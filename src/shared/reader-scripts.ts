/**
 * In die gelesene Seite injizierte Skripte.
 *
 * Bewusst plattformneutral als String: Electron injiziert sie per
 * `webContents.executeJavaScript`, Android per `evaluateJavascript` bzw.
 * `executeScript` — beide Seiten teilen damit dieselbe Logik.
 *
 * Rueckkanal ist `console.log` mit einem Praefix. Der Reader-BrowserView hat kein
 * Preload, und ein Android-WebView hat kein Capacitor-Bridge — console-Messages
 * sind auf beiden Plattformen abgreifbar.
 */

export const SCROLL_REPORT_PREFIX = '__MANGA_SCROLL__'

/** Antwort auf das In-Page-Angebot zur Scroll-Rueckkehr (Mobile). */
export const SCROLL_OFFER_PREFIX = '__MANGA_OFFER__'

/** Antwort auf den Domain-Guard-Dialog (Mobile). */
export const DOMAIN_GUARD_PREFIX = '__MANGA_GUARD__'

/** Bericht des kosmetischen Durchlaufs: was wurde ausgeblendet. */
export const COSMETIC_REPORT_PREFIX = '__MANGA_COSMETIC__'

/**
 * Meldet die Scroll-Position fortlaufend, statt sie erst beim Schliessen zu lesen.
 *
 * Der Grund: das Auslesen beim Schliessen ist nicht zuverlaessig zu bekommen — wird
 * das Reader-Fenster ueber das Fenster-X geschlossen, ist die Seite schon zerstoert,
 * bevor irgendwer sie fragen koennte. Bei fortlaufender Meldung liegt der letzte
 * Stand immer schon im Speicher.
 *
 * Zweitens scrollen viele Leseseiten nicht das Dokument, sondern einen inneren
 * Container. `window.scrollY` ist dort konstant 0 — deshalb wird das tatsaechlich
 * scrollende Element gesucht.
 */
export const SCROLL_TRACK_SCRIPT = `
(function() {
  if (window.__mangaScrollTracker__) return;
  window.__mangaScrollTracker__ = true;

  var PREFIX = ${JSON.stringify(SCROLL_REPORT_PREFIX)};
  var MIN_SCROLLABLE = 40;
  var REPORT_INTERVAL_MS = 400;
  var MIN_DELTA_PX = 40;

  var cached = null;

  function docEl() {
    return document.scrollingElement || document.documentElement;
  }

  /** Findet das Element, das tatsaechlich scrollt — Dokument oder innerer Container. */
  function findScroller() {
    if (cached && cached.isConnected && cached.scrollHeight - cached.clientHeight > MIN_SCROLLABLE) {
      return cached;
    }
    cached = null;

    var root = docEl();
    if (root && root.scrollHeight - root.clientHeight > MIN_SCROLLABLE) {
      cached = root;
      return root;
    }

    // Nur Container-artige Elemente pruefen, nicht das ganze DOM
    var nodes = document.querySelectorAll('div, main, section, article');
    var best = null;
    var bestRange = MIN_SCROLLABLE;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var range = el.scrollHeight - el.clientHeight;
      if (range <= bestRange) continue;
      var overflowY = getComputedStyle(el).overflowY;
      if (overflowY !== 'auto' && overflowY !== 'scroll') continue;
      best = el;
      bestRange = range;
    }
    cached = best || root;
    return cached;
  }

  function currentOffset(el) {
    if (el === docEl()) {
      return Math.round(window.scrollY || el.scrollTop || 0);
    }
    return Math.round(el.scrollTop || 0);
  }

  window.__mangaScrollRead__ = function() {
    var el = findScroller();
    if (!el) return null;
    var y = currentOffset(el);
    var range = Math.max(1, el.scrollHeight - el.clientHeight);
    return { y: y, pct: Math.min(1, y / range), url: location.href };
  };

  window.__mangaScrollApply__ = function(target) {
    var el = findScroller();
    if (!el) return false;
    if (el === docEl()) {
      window.scrollTo({ top: target, behavior: 'instant' });
    } else {
      el.scrollTop = target;
    }
    return Math.abs(currentOffset(el) - target) < 80;
  };

  var lastReported = -1;
  var timer = null;

  function report() {
    var state = window.__mangaScrollRead__();
    if (!state) return;
    if (Math.abs(state.y - lastReported) < MIN_DELTA_PX) return;
    lastReported = state.y;
    console.log(PREFIX + JSON.stringify(state));
  }

  function schedule() {
    if (timer !== null) return;
    timer = setTimeout(function() {
      timer = null;
      report();
    }, REPORT_INTERVAL_MS);
  }

  window.addEventListener('scroll', schedule, { passive: true, capture: true });
  // Vor dem Entladen den letzten Stand ungebremst nachschieben
  window.addEventListener('pagehide', report);
  window.addEventListener('beforeunload', report);
})();
`

/**
 * Springt zur gespeicherten Position.
 *
 * Wiederholt, weil Leseseiten Bilder nachladen: unmittelbar nach dem Laden ist die
 * Seite oft noch zu kurz fuer das Ziel, und ein einzelner Sprung landet am Ende der
 * noch unfertigen Seite.
 */
export function buildScrollRestoreScript(targetY: number, attempts = 12, intervalMs = 250): string {
  const safeTarget = Math.max(0, Math.round(Number(targetY) || 0))
  return `
(function() {
  var target = ${safeTarget};
  var left = ${Math.max(1, Math.round(attempts))};

  function apply() {
    left--;
    var ok = typeof window.__mangaScrollApply__ === 'function'
      ? window.__mangaScrollApply__(target)
      : (window.scrollTo({ top: target, behavior: 'instant' }), Math.abs(window.scrollY - target) < 80);
    if (!ok && left > 0) setTimeout(apply, ${Math.max(50, Math.round(intervalMs))});
  }

  apply();
})();
`
}

/**
 * Vergleichsschluessel fuer URLs.
 *
 * Exakte Gleichheit ist zu streng: Leseseiten haengen Fragmente und wechselnde
 * Parameter an, wodurch die gespeicherte Position nie wiedergefunden wurde.
 * Pfad und Query bleiben erhalten — manche Seiten tragen das Kapitel dort.
 */
export function scrollUrlKey(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname.replace(/\/+$/, '')
    return `${parsed.origin}${path}${parsed.search}`
  } catch {
    return url.split('#')[0].replace(/\/+$/, '')
  }
}

/**
 * Blendet im Reader ein Angebot ein, zur gespeicherten Position zu springen.
 *
 * Auf Mobile liegt der Reader-WebView als Overlay ueber der App — die Vue-Leiste
 * des Desktops ist dort nicht sichtbar. Das Angebot muss deshalb in der Seite
 * selbst stehen und antwortet ueber denselben console-Rueckkanal.
 */
export function buildScrollOfferScript(labels: { jump: string; dismiss: string }): string {
  // Die Beschriftung kommt bereits interpoliert: vue-i18n ersetzt einen fehlenden
  // Parameter durch einen leeren String, weshalb ein nachtraegliches Ersetzen von
  // {percent} hier ins Leere lief — die Prozentzahl fehlte dann in der Leiste.
  const payload = JSON.stringify({
    prefix: SCROLL_OFFER_PREFIX,
    jump: labels.jump,
    dismiss: labels.dismiss
  })
  return `
(function() {
  var cfg = ${payload};
  var existing = document.getElementById('__mangaScrollOffer__');
  if (existing) existing.remove();

  var bar = document.createElement('div');
  bar.id = '__mangaScrollOffer__';
  bar.style.cssText = [
    'position:fixed', 'left:12px', 'right:12px', 'bottom:16px', 'z-index:2147483647',
    'display:flex', 'gap:8px', 'align-items:center', 'justify-content:space-between',
    'padding:12px 14px', 'border-radius:12px', 'background:rgba(16,16,20,0.96)',
    'color:#f4f4f5', 'font:14px system-ui,sans-serif',
    'box-shadow:0 6px 24px rgba(0,0,0,0.5)'
  ].join(';');

  var text = document.createElement('span');
  text.textContent = cfg.jump;
  text.style.cssText = 'flex:1;min-width:0';

  var yes = document.createElement('button');
  yes.textContent = '↷';
  yes.setAttribute('aria-label', cfg.jump);
  yes.style.cssText = 'flex:0 0 auto;padding:8px 14px;border:0;border-radius:8px;background:#e879f9;color:#111;font-size:16px';

  var no = document.createElement('button');
  no.textContent = '✕';
  no.setAttribute('aria-label', cfg.dismiss);
  no.style.cssText = 'flex:0 0 auto;padding:8px 12px;border:0;border-radius:8px;background:#2e2e2e;color:#f4f4f5;font-size:14px';

  function respond(action) {
    bar.remove();
    console.log(cfg.prefix + JSON.stringify({ action: action }));
  }

  yes.addEventListener('click', function() { respond('jump'); });
  no.addEventListener('click', function() { respond('dismiss'); });

  bar.appendChild(text);
  bar.appendChild(yes);
  bar.appendChild(no);
  (document.body || document.documentElement).appendChild(bar);

  // Nicht nach kurzer Zeit wegblenden — das Angebot wurde so regelmaessig
  // verpasst. Es verschwindet, sobald der Leser selbst scrollt (dann hat er sich
  // implizit entschieden), mit einer langen Reserve als Rueckfall.
  var startY = window.scrollY || 0;
  function dismissOnScroll() {
    if (Math.abs((window.scrollY || 0) - startY) < 150) return;
    window.removeEventListener('scroll', dismissOnScroll, true);
    if (bar.isConnected) respond('dismiss');
  }
  window.addEventListener('scroll', dismissOnScroll, { passive: true, capture: true });
  setTimeout(function() { if (bar.isConnected) respond('dismiss'); }, 120000);
})();
`
}

/** Blendet per CSS Elemente aus (Cosmetic-Adblock + gespeicherte Picker-Selektoren). */
export function buildHideSelectorsScript(selectors: string[]): string {
  if (selectors.length === 0) return ''
  const css = selectors.map((selector) => `${selector} { display: none !important; }`).join(' ')
  return `
(function() {
  var id = '__mangaHiddenElements__';
  var style = document.getElementById(id);
  if (!style) {
    style = document.createElement('style');
    style.id = id;
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = ${JSON.stringify(css)};
})();
`
}

export type DomainGuardAnswer = 'yes' | 'yes_always' | 'no' | 'no_block'

export interface DomainGuardLabels {
  title: string
  message: string
  from: string
  yes: string
  yesAlways: string
  no: string
  noBlock: string
}

/**
 * Fragt im Reader nach, ob auf eine fremde Domain navigiert werden darf.
 *
 * Die Navigation ist zu diesem Zeitpunkt bereits abgewiesen — ein "ja" loest sie
 * per setUrl() erneut aus. Antwort kommt ueber den console-Rueckkanal.
 *
 * Wird nur bei Navigationen *mit* Nutzergeste gezeigt. Automatische Umleitungen
 * werden stumm verworfen; dafuer will niemand gefragt werden.
 */
export function buildDomainGuardDialogScript(labels: DomainGuardLabels): string {
  const payload = JSON.stringify({ prefix: DOMAIN_GUARD_PREFIX, l: labels })
  return `
(function() {
  var cfg = ${payload};
  var old = document.getElementById('__mangaGuard__');
  if (old) old.remove();

  var back = document.createElement('div');
  back.id = '__mangaGuard__';
  back.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483647',
    'display:flex', 'align-items:center', 'justify-content:center',
    'padding:20px', 'background:rgba(0,0,0,0.72)',
    'font:14px system-ui,sans-serif'
  ].join(';');

  var box = document.createElement('div');
  box.style.cssText = [
    'width:100%', 'max-width:360px', 'box-sizing:border-box',
    'padding:18px', 'border-radius:14px', 'background:#141418',
    'color:#f4f4f5', 'box-shadow:0 10px 40px rgba(0,0,0,0.6)'
  ].join(';');

  function line(text, css) {
    var el = document.createElement('p');
    el.textContent = text;
    el.style.cssText = 'margin:0 0 8px 0;' + (css || '');
    return el;
  }

  box.appendChild(line(cfg.l.title, 'font-size:16px;font-weight:700'));
  box.appendChild(line(cfg.l.message, 'color:#d4d4d8;line-height:1.4'));
  box.appendChild(line(cfg.l.from, 'color:#9ca3af;font-size:12px'));

  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px';

  function respond(action) {
    back.remove();
    console.log(cfg.prefix + JSON.stringify({ action: action }));
  }

  function button(text, action, accent) {
    var b = document.createElement('button');
    b.textContent = text;
    b.style.cssText = [
      'padding:11px 8px', 'border:0', 'border-radius:9px', 'font-size:13px',
      'background:' + (accent ? '#e879f9' : '#2a2a30'),
      'color:' + (accent ? '#111' : '#f4f4f5')
    ].join(';');
    b.addEventListener('click', function() { respond(action); });
    return b;
  }

  grid.appendChild(button(cfg.l.yes, 'yes', true));
  grid.appendChild(button(cfg.l.yesAlways, 'yes_always', false));
  grid.appendChild(button(cfg.l.no, 'no', false));
  grid.appendChild(button(cfg.l.noBlock, 'no_block', false));

  box.appendChild(grid);
  back.appendChild(box);
  (document.body || document.documentElement).appendChild(back);
})();
`
}

/**
 * Blendet Werbe-Elemente aus, die die Netzwerksperre nicht erwischt.
 *
 * Banner sind meist fremde *Bilder*, und fremde Bilder werden bewusst
 * durchgelassen — dort stecken die Kapitelseiten. Hier wird deshalb nicht
 * nach Namen gefiltert, sondern nach Herkunft: ein img/iframe, dessen Domain
 * weder die der Seite noch freigegeben ist, ist Werbung.
 *
 * Kapitelbilder koennen dadurch nicht verschwinden — die kommen von der Seite
 * selbst und fallen nie unter die Regel.
 *
 * Laeuft zusaetzlich per MutationObserver weiter, weil Werbung oft erst nach
 * dem Laden nachgeschoben wird.
 */
export function buildCosmeticAdCleanupScript(allowedDomains: string[]): string {
  const payload = JSON.stringify({
    prefix: COSMETIC_REPORT_PREFIX,
    allowed: allowedDomains.map((domain) => domain.toLowerCase())
  })
  return `
(function() {
  if (window.__mangaCosmetic__) { window.__mangaCosmetic__(); return; }
  var cfg = ${payload};

  function baseDomain(host) {
    var parts = String(host || '').toLowerCase().split('.');
    return parts.length < 2 ? parts.join('.') : parts.slice(-2).join('.');
  }

  var pageBase = baseDomain(location.hostname);
  var allowed = {};
  for (var i = 0; i < cfg.allowed.length; i++) allowed[cfg.allowed[i]] = true;

  function isForeign(rawUrl) {
    if (!rawUrl) return false;
    try {
      var u = new URL(rawUrl, location.href);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      var base = baseDomain(u.hostname);
      if (!base || base === pageBase) return false;
      return !allowed[base];
    } catch (e) {
      return false;
    }
  }

  var hidden = 0;
  var seen = new WeakSet();

  function hide(el) {
    if (!el || seen.has(el)) return;
    seen.add(el);
    el.style.setProperty('display', 'none', 'important');
    hidden++;

    // Leere Huelle mit ausblenden, damit keine Luecke stehen bleibt.
    // Nur eine Ebene und nur, wenn dort nichts anderes Sichtbares haengt.
    var parent = el.parentElement;
    if (!parent || parent === document.body) return;
    var others = 0;
    for (var i = 0; i < parent.children.length; i++) {
      var child = parent.children[i];
      if (child !== el && child.offsetHeight > 8) others++;
    }
    if (others === 0 && (parent.textContent || '').trim().length < 3) {
      parent.style.setProperty('display', 'none', 'important');
    }
  }

  /**
   * Naechster fixiert/klebend positionierter Vorfahre.
   *
   * Overlay-Banner, die mitscrollen und ein X zum Schliessen haben, sitzen in so
   * einem Container. Nur das innere Bild auszublenden liesse die Huelle mit dem
   * X stehen — deshalb wird der Container selbst getroffen.
   *
   * Eigene Bedienelemente der Leseseite sind ebenfalls fixiert, enthalten aber
   * keine fremden Bilder/iframes; die Regel greift nur ueber diesen Nachweis.
   */
  function stickyAncestor(el) {
    var node = el;
    var depth = 0;
    while (node && node !== document.body && depth < 8) {
      var pos = getComputedStyle(node).position;
      if (pos === 'fixed' || pos === 'sticky') return node;
      node = node.parentElement;
      depth++;
    }
    return null;
  }

  /**
   * Ist dieses fremde Bild Werbung oder Inhalt?
   *
   * Fremde Bilder duerfen NICHT allein wegen ihrer Herkunft verschwinden:
   * manche Leseseiten liefern die Kapitelseiten ueber eine eigene Bild-Domain
   * aus (gemessen: imgsrv5.com auf mgeko.cc). Wird die pauschal ausgeblendet,
   * ist das Kapitel leer.
   *
   * Unterschieden wird deshalb nach Form und Ort, nicht nach Domain:
   *   - in einem mitscrollenden, fixierten Container  -> Werbung
   *   - flach (Banner-Format)                          -> Werbung
   *   - gross und hoch (Kapitelseite)                  -> Inhalt, bleibt
   */
  function looksLikeAd(el) {
    if (stickyAncestor(el)) return true;

    var height = el.offsetHeight || 0;
    var width = el.offsetWidth || 0;

    // Noch nicht ausgemessen (lazy load): nicht anfassen, spaeterer Durchlauf
    // entscheidet erneut.
    if (height === 0 && width === 0) return false;

    // Kapitelseiten sind hoch; Banner sind flach
    if (height > 320) return false;
    // Schmale Miniaturen sind ebenfalls kein Kapitelinhalt
    return true;
  }

  function sweep() {
    var nodes = document.querySelectorAll('img, iframe, ins, embed, object');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data');
      if (!isForeign(src)) continue;

      var tag = el.tagName.toLowerCase();
      if (tag === 'img') {
        // Bilder nur, wenn sie nach Werbung aussehen — sonst droht ein leeres Kapitel
        if (!looksLikeAd(el)) continue;
      }
      hide(stickyAncestor(el) || el);
    }
    if (hidden > 0) {
      console.log(cfg.prefix + JSON.stringify({ hidden: hidden, url: location.href }));
    }
  }

  window.__mangaCosmetic__ = sweep;
  sweep();

  // Nachgeschobene Werbung ebenfalls erfassen, gedrosselt
  var pending = null;
  var observer = new MutationObserver(function() {
    if (pending !== null) return;
    pending = setTimeout(function() { pending = null; sweep(); }, 600);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
`
}

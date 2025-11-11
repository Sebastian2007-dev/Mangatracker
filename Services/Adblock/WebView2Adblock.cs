using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace MangaTracker.Services.Adblock
{
    /// <summary>
    /// Netzwerk-Blocking (EasyList-Wrapper + Hard-Denylist) + kosmetische Filter (CSS) +
    /// Element-Picker (F2) + Custom URL-Regeln + robuster Popup-Block (native+JS) + Anti-Overlay.
    /// </summary>
    public static class WebView2Adblock
    {
        public sealed class Options
        {
            /// <summary>Nur loggen, nichts blocken. Für echtes Blocken auf false setzen!</summary>
            public bool DryRun { get; init; } = false;

            /// <summary>Domains, die nie geblockt werden (Failsafe).</summary>
            public ISet<string> SiteAllowlist { get; init; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            /// <summary>window.open()-Popups blocken (Native + JS-Guard).</summary>
            public bool BlockNewWindows { get; init; } = true;

            /// <summary>_blank-Links im selben Tab öffnen statt blocken.</summary>
            public bool PopupOpenInSameTab { get; init; } = false;

            /// <summary>In-Page Overlays/Banner (position:fixed/sticky) aggressiv entfernen.</summary>
            public bool BlockInPageOverlays { get; init; } = true;

            /// <summary>
            /// Harte Denylist (Wildcard-Host bzw. Host+Pfad). Greift nur bei Third-Party.
            /// Beispiel-Einträge: "*.infolinks.com", "demand.pubadx.one", "yandex.ru/ads/*"
            /// </summary>
            public IList<string>? HardBlockDomainPatterns { get; init; } = null;
        }

        // ---------- Defaults für Hard-Denylist ----------
        private static readonly string[] DefaultHardBlockPatterns = new[]
        {
            "*.infolinks.com",
            "router.infolinks.com/*",
            "rt*.infolinks.com/*",
            "*.pubadx.one",
            "imp*.pubadx.one/*",
            "pixel-dsp.pubadx.one/*",
            "source.pubadx.one/*",
            "demand.pubadx.one/*",
            "cdn.pubfuture-ad.com/*",
            "media.pubfuture.com/*",
            "s3.pubfuture.com/*",
            "*.monetixads.com/*",
            "ssp-service.monetixads.com/*",
            "static.cdn.monetixads.com/*",
            "*.adform.net/*",
            "*.a-ads.com/*",
            "ad.a-ads.com/*",
            "doubleclick.net/*",
            "*.doubleclick.net/*",
            "*.googlesyndication.com/*",
            "adservice.google.com/*",
            "adservice.google.*/*",
            "*.teads.tv/*",
            "yandex.ru/ads/*",
            "*.adxpremium.services/*",
            "*.pubrev.io/*",
            "*.lowseelor.com/*",
            "*.glookockish.com/*",
            "cdnpf.com/*",
            "topworkredbay.shop/*",
        };

        /// <summary>
        /// Hängt Filter an (Netzwerk + optional Popups). Reihenfolge: Allowlist -> Custom-URL-Regeln -> Hard-Denylist -> EasyList/Heuristik.
        /// </summary>
        public static void Attach(WebView2 web, AdblockService svc, Options? opt = null, CosmeticRuleStore? ruleStore = null)
        {
            if (web is null)
                throw new ArgumentNullException(nameof(web));
            if (svc is null)
                throw new ArgumentNullException(nameof(svc));
            opt ??= new Options();

            var env = web.CoreWebView2.Environment;
            var hardPatterns = (opt.HardBlockDomainPatterns is { Count: > 0 })
                ? opt.HardBlockDomainPatterns
                : DefaultHardBlockPatterns;

            var ctxs = new[]
            {
                CoreWebView2WebResourceContext.Script,
                CoreWebView2WebResourceContext.Image,
                CoreWebView2WebResourceContext.Media,
                CoreWebView2WebResourceContext.Stylesheet,
                CoreWebView2WebResourceContext.XmlHttpRequest,
                CoreWebView2WebResourceContext.Fetch,
                CoreWebView2WebResourceContext.Font,
                CoreWebView2WebResourceContext.Other,
                CoreWebView2WebResourceContext.Document
            };
            foreach (var c in ctxs)
                web.CoreWebView2.AddWebResourceRequestedFilter("*", c);

            web.CoreWebView2.WebResourceRequested += (s, e) =>
            {
                try
                {
                    var resourceUrl = e.Request.Uri;
                    var documentUrl = web.Source?.ToString() ?? resourceUrl;
                    // Never block Cloudflare Turnstile/challenge resources
                    if (resourceUrl.Contains("challenges.cloudflare.com", StringComparison.OrdinalIgnoreCase) ||
                        resourceUrl.Contains("/turnstile/", StringComparison.OrdinalIgnoreCase))
                        return;

                    var docHost = new Uri(documentUrl).Host;
                    if (opt.SiteAllowlist.Contains(docHost))
                        return;

                    var isThirdParty = AdblockService.IsThirdParty(resourceUrl, documentUrl);

                    // 1) Custom URL-Regeln (pro Host) zuerst prüfen
                    if (ruleStore != null)
                    {
                        foreach (var pat in ruleStore.GetUrlRules(docHost))
                        {
                            if (UrlPatternMatch(resourceUrl, pat))
                            {
                                Block(env, e, opt, $"CUSTOM URL BLOCK: {resourceUrl} matched {pat}");
                                return;
                            }
                        }
                    }

                    // 2) Harte Denylist (nur Third-Party)
                    if (isThirdParty && MatchesAny(resourceUrl, hardPatterns))
                    {
                        Block(env, e, opt, $"HARD DENYLIST BLOCK: {resourceUrl}");
                        return;
                    }

                    // 3) EasyList (wenn deine Engine später „echt“ ist)
                    var ctx = e.ResourceContext;

                    // Hauptdokument nicht blocken; IFrames erkennen
                    if (ctx == CoreWebView2WebResourceContext.Document && !IsIFrameRequest(e))
                        return;

                    var type = (ctx == CoreWebView2WebResourceContext.Document)
                        ? ResType.Subdocument
                        : AdblockService.MapContext(ctx);

                    if (type == ResType.Other)
                        return;

                    var blockByEasy = svc.ShouldBlock(resourceUrl, documentUrl, type, isThirdParty);

                    // 4) Kleine Heuristik obendrauf
                    if (!blockByEasy && LooksLikeAdUrl(resourceUrl))
                        blockByEasy = true;

                    Debug.WriteLine($"[{(blockByEasy ? "BLOCK?" : "allow")}] {type} {resourceUrl} (3rd={isThirdParty}) on {documentUrl}");

                    if (blockByEasy)
                        Block(env, e, opt, "Blocked by EasyList/heuristic");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine("Adblock error: " + ex);
                }
            };

            // Native: NewWindowRequested blocken
            if (opt.BlockNewWindows)
            {
                web.CoreWebView2.NewWindowRequested += (s, e) =>
                {
                    e.Handled = true; // Popups/Popunders verhindern
                    Debug.WriteLine($"Blocked popup (native): {e.Uri}");
                };
            }
        }

        /// <summary>
        /// Komplett-Setup inkl. CSS-Injektion, host-spezifischen Regeln, Picker-Messagepipe, Popup/Overlay-Guard und Navigation.
        /// </summary>
        public static async Task AttachAndNavigateAsync(
            WebView2 web,
            string url,
            string[] filterFiles,
            Options? opt = null,
            string? cosmeticCss = null,
            CosmeticRuleStore? ruleStore = null)
        {
            if (web is null)
                throw new ArgumentNullException(nameof(web));
            if (url is null)
                throw new ArgumentNullException(nameof(url));

            opt ??= new Options();
            ruleStore ??= new CosmeticRuleStore();

            await web.EnsureCoreWebView2Async();

            // Netzwerk + Popups (native)
            var existing = filterFiles?.Where(File.Exists).ToArray() ?? Array.Empty<string>();
            var svc = new AdblockService(existing);
            Attach(web, svc, opt, ruleStore);

            // JS-Popup-Guard injizieren (blockt window.open + _blank-Klicks)
            if (opt.BlockNewWindows)
            {
                var popupScript = GetPopupGuardScript(opt.PopupOpenInSameTab);
                await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(popupScript);
            }

            // Anti-Overlay-Guard (in-page Banner/Sticky/IFRAME over UI)
            if (opt.BlockInPageOverlays)
                await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(AntiOverlayScript);

            // vorsichtiges Default-CSS (kosmetisch) + erweitert um typische Ad-Kennungen
            var baseCss = (cosmeticCss ?? DefaultCosmeticCss) + ExtraAdCss;
            if (!string.IsNullOrWhiteSpace(baseCss))
            {
                var script = WrapCssAsDocumentCreatedScript(baseCss);
                await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(script);
            }

            // Host-spezifische CSS-Regeln bei jeder Navigation injizieren
            web.CoreWebView2.NavigationStarting += async (s, e) =>
            {
                try
                {
                    var host = new Uri(e.Uri).Host;
                    var hostCss = ruleStore.BuildCssForHost(host);
                    if (!string.IsNullOrWhiteSpace(hostCss))
                    {
                        var script = WrapCssAsDocumentCreatedScript(hostCss);
                        await web.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(script);
                    }
                }
                catch { /* ignore */ }
            };

            // Nachrichten aus Picker empfangen
            web.CoreWebView2.WebMessageReceived += (s, e) =>
            {
                try
                {
                    var msg = e.TryGetWebMessageAsString();
                    if (string.IsNullOrWhiteSpace(msg))
                        return;

                    if (msg.StartsWith("nyx-cosmetic|", StringComparison.Ordinal))
                    {
                        var parts = msg.Split('|', 3);
                        if (parts.Length == 3)
                        {
                            var host = parts[1];
                            var selector = parts[2];
                            ruleStore.AddRule(host, selector);

                            // sofort ausblenden
                            _ = web.Dispatcher.InvokeAsync(async () =>
                            {
                                await web.CoreWebView2.ExecuteScriptAsync(
                                    $"try{{document.querySelectorAll({ToJsString(selector)}).forEach(n=>n.style.setProperty('display','none','important'));}}catch(e){{}}");
                            });
                        }
                    }
                    else if (msg.StartsWith("nyx-net|", StringComparison.Ordinal))
                    {
                        var parts = msg.Split('|', 3);
                        if (parts.Length == 3)
                        {
                            var host = parts[1];
                            var rawUrl = parts[2];

                            try
                            {
                                var u = new Uri(rawUrl);
                                var path = u.AbsolutePath;
                                // einfache Generalisierung: Zahlen in * verwandeln
                                path = System.Text.RegularExpressions.Regex.Replace(path, @"\d+", "*");
                                var pattern = $"{u.Scheme}://{u.Host}{path}*"; // alles darunter
                                ruleStore.AddUrlRule(host, pattern);
                                Debug.WriteLine($"[NYX] URL rule saved for {host}: {pattern}");
                            }
                            catch
                            {
                                var noQuery = rawUrl.Split('?', '#')[0];
                                ruleStore.AddUrlRule(host, noQuery + "*");
                            }
                        }
                    }
                }
                catch { /* ignore */ }
            };

            web.Source = new Uri(url);
        }

        // ---------- Helpers ----------
        private static void Block(CoreWebView2Environment env, CoreWebView2WebResourceRequestedEventArgs e, Options opt, string why)
        {
            Debug.WriteLine(why);
            if (!opt.DryRun)
            {
                //        content      status  reason    headers
                e.Response = env.CreateWebResourceResponse(
                    null,           // IStream? content
                    403,            // statusCode
                    "Blocked",      // reasonPhrase
                    "Content-Type: text/plain"); // headers
            }
        }

        private const string DefaultCosmeticCss = @"
[id*=""ad"" i],[class*=""ad"" i],
[id*=""ads"" i],[class*=""ads"" i],
[id*=""advert"" i],[class*=""advert"" i],
[id*=""sponsor"" i],[class*=""sponsor"" i],
iframe[src*=""ad"" i],iframe[src*=""ads"" i],
div[class*=""ad-container"" i],section[class*=""ad-container"" i],
.ad,.ads,.advert,.advertisement,.sponsored{
  display:none !important; visibility:hidden !important;
}
.ad-slot,.ad-wrapper,.adsbygoogle,.sponsor,.sponsored-post{
  max-height:0 !important; height:0 !important; overflow:hidden !important;
}";

        private const string ExtraAdCss = @"
/* Google/Generic */
ins.adsbygoogle, #google_image_div, [id^=""google_ads""] { display:none !important; }
iframe[src*=""doubleclick.net"" i],
iframe[src*=""googlesyndication.com"" i],
iframe[src*=""googleads.g.doubleclick.net"" i],
iframe[src*=""adservice.google"" i],
iframe[src*=""/ads"" i],
iframe[src*=""/ad/"" i] {
  display:none !important; visibility:hidden !important; width:0 !important; height:0 !important; }

/* Sticky bottom banners / cookie-like bars that are clearly ads */
div[id*=""ad""][style*=""position:fixed"" i],
div[class*=""ad""][style*=""position:fixed"" i],
div[class*="" banner"" i][style*=""position:fixed"" i] {
  display:none !important; visibility:hidden !important; }";

        private static string WrapCssAsDocumentCreatedScript(string css) => $@"
(() => {{
  try {{
    const s = document.createElement('style');
    s.textContent = `{css.Replace("`", "\\`")}`;
    document.documentElement.appendChild(s);
  }} catch (e) {{ }}
}})();";

        private static string ToJsString(string s) => "`" + s.Replace("`", "\\`") + "`";

        // Host+Pfad-Wildcards (einfach): '*' und '?' unterstützt
        private static bool UrlPatternMatch(string url, string pattern)
        {
            if (string.IsNullOrWhiteSpace(url) || string.IsNullOrWhiteSpace(pattern))
                return false;

            // Wenn pattern nur Host enthält (keinen Slash), tolerant behandeln
            if (!pattern.Contains('/'))
            {
                // matcht jede URL mit diesem Host (inkl. Subdomains bei "*.host")
                try
                {
                    var u = new Uri(url);
                    if (HostWildcardMatch(u.Host, pattern))
                        return true;
                }
                catch { }
                // fallback: klassische Wildcard über die gesamte URL
            }

            string Regexize(string p) => System.Text.RegularExpressions.Regex.Escape(p)
                .Replace(@"\*", ".*").Replace(@"\?", ".");
            var rx = "^" + Regexize(pattern) + "$";
            return System.Text.RegularExpressions.Regex.IsMatch(url, rx, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        }

        private static bool MatchesAny(string url, IEnumerable<string> patterns)
        {
            foreach (var p in patterns)
            {
                if (UrlPatternMatch(url, p))
                    return true;
                try
                {
                    var h = new Uri(url).Host;
                    if (HostWildcardMatch(h, p))
                        return true;
                }
                catch { /* ignore */ }
            }
            return false;
        }

        private static bool HostWildcardMatch(string host, string pattern)
        {
            var p = pattern;
            if (p.Contains('/'))
                p = p.Split('/')[0];
            string Regexize(string s) => System.Text.RegularExpressions.Regex.Escape(s)
                .Replace(@"\*", ".*").Replace(@"\?", ".");
            var rx = "^" + Regexize(p) + "$";
            return System.Text.RegularExpressions.Regex.IsMatch(host, rx, System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        }

        private static bool LooksLikeAdUrl(string urlLower)
        {
            var u = urlLower.ToLowerInvariant();
            if (u.Contains("doubleclick.net") ||
                u.Contains("googlesyndication.com") ||
                u.Contains("adservice.google") ||
                u.Contains("/ads/") || u.Contains("/ad/") ||
                u.Contains("?ad=") || u.Contains("&ad=") ||
                u.Contains("advert") || u.Contains("sponsored"))
                return true;
            return false;
        }

        private static bool IsIFrameRequest(CoreWebView2WebResourceRequestedEventArgs e)
        {
            try
            {
                var headers = e.Request.Headers;
                if (headers.Contains("Sec-Fetch-Dest"))
                {
                    var dest = headers.GetHeader("Sec-Fetch-Dest");
                    if (!string.IsNullOrEmpty(dest) && dest.Equals("iframe", StringComparison.OrdinalIgnoreCase))
                        return true;
                }
            }
            catch { }
            return false;
        }

        // -------- Popup-Guard (JS) --------
        private static string GetPopupGuardScript(bool openInSameTab) => $@"
(() => {{
  const OPEN_IN_SAME_TAB = {(openInSameTab ? "true" : "false")};
  try {{
    // window.open neutralisieren
    Object.defineProperty(window, 'open', {{
      configurable: true,
      value: function(url, name, specs) {{
        if (!OPEN_IN_SAME_TAB) return null;
        if (url) {{ try {{ location.assign(url); }} catch {{ location.href = url; }} }}
        return null;
      }}
    }});

    // Links mit target=""_blank"" behandeln
    const onClick = (ev) => {{
      try {{
        const a = ev.target?.closest && ev.target.closest('a[target=""_blank""]');
        if (!a) return;
        ev.preventDefault(); ev.stopPropagation();
        if (OPEN_IN_SAME_TAB && a.href) {{
          try {{ location.assign(a.href); }} catch {{ location.href = a.href; }}
        }}
      }} catch {{}}
    }};
    document.addEventListener('click', onClick, true);
  }} catch {{}}
}})();";

        // -------- Anti-Overlay (JS) --------
        private const string AntiOverlayScript = @"
(() => {
  const BAD_IFRAME_HOSTS = [/doubleclick\.net/i, /googlesyndication\.com/i, /adservice\.google/i, /\/ads?\//i, /pubadx\.one/i, /infolinks\.com/i, /monetixads\.com/i];
  function looksLikeAdIframe(ifr) {
    try { const src = String(ifr.src||''); return BAD_IFRAME_HOSTS.some(rx => rx.test(src)); } catch { return false; }
  }
  function looksLikeOverlay(el) {
    try {
      const cs = getComputedStyle(el); if (!cs) return false;
      const pos = cs.position; if (pos !== 'fixed' && pos !== 'sticky') return false;
      const zi = parseInt(cs.zIndex || '0', 10); const w = el.offsetWidth, h = el.offsetHeight;
      if ((w >= 300 && h >= 100) && zi >= 999) return true;
      const r = el.getBoundingClientRect();
      if (pos==='fixed' && (r.bottom >= (window.innerHeight-2)) && (h>=80) && zi>=999) return true;
    } catch {}
    return false;
  }
  function nuke(el){
    try {
      el.style.setProperty('display','none','important');
      el.style.setProperty('visibility','hidden','important');
      if (el.parentElement && el.parentElement.childElementCount===1)
        el.parentElement.style.setProperty('display','none','important');
    } catch {}
  }
  function scan(root) {
    try {
      const nodes = (root instanceof Element ? [root, ...root.querySelectorAll('*')] : document.querySelectorAll('*'));
      for (const el of nodes) {
        if (el.tagName==='IFRAME' && looksLikeAdIframe(el)) { nuke(el); continue; }
        if (looksLikeOverlay(el)) { nuke(el); continue; }
      }
    } catch {}
  }
  scan(document);
  const mo = new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType===1) scan(n);
  });
  try { mo.observe(document.documentElement, {childList:true, subtree:true}); } catch {}
})();
";

        // -------- Picker ----------
        public static async Task EnableElementPickerAsync(WebView2 web)
        {
            await web.EnsureCoreWebView2Async();
            await web.CoreWebView2.ExecuteScriptAsync(PickerScriptEnable);
        }

        public static async Task DisableElementPickerAsync(WebView2 web)
        {
            await web.EnsureCoreWebView2Async();
            await web.CoreWebView2.ExecuteScriptAsync(PickerScriptDisable);
        }

        // ENABLE – mit Handler-Referenzen + netz-URL-Post
        private const string PickerScriptEnable = @"
(() => {
  if (window.__nyxPickerActive) return;
  window.__nyxPickerActive = true;

  const ov = document.createElement('div');
  ov.id = '__nyxPickerOverlay';
  Object.assign(ov.style, {
    position:'fixed', left:0, top:0, right:0, bottom:0,
    pointerEvents:'none', zIndex: 2147483647
  });
  const box = document.createElement('div');
  Object.assign(box.style, {
    position:'absolute', border:'2px solid #00c8ff',
    background:'rgba(0,200,255,0.15)', pointerEvents:'none'
  });
  ov.appendChild(box);
  document.documentElement.appendChild(ov);

  const label = document.createElement('div');
  label.id = '__nyxPickerLabel';
  label.textContent = 'NYX Picker: Hover & Click – ESC zum Abbrechen';
  Object.assign(label.style, {
    position:'fixed', left:'8px', bottom:'8px', zIndex:2147483647,
    fontFamily:'monospace', fontSize:'12px',
    background:'rgba(0,0,0,0.7)', color:'#fff',
    padding:'6px 8px', borderRadius:'6px', pointerEvents:'none'
  });
  document.documentElement.appendChild(label);

  function getRect(el){
    const r=el.getBoundingClientRect();
    const s=getComputedStyle(el);
    return { x:r.left-2, y:r.top-2, w:r.width+4, h:r.height+4, vis:(s.visibility!=='hidden'&&s.display!=='none') };
  }

  function cssPath(el){
    if (!(el instanceof Element)) return '';
    const parts = [];
    while (el && el.nodeType === 1 && parts.length < 6) {
      let part = el.nodeName.toLowerCase();
      if (el.id) { parts.unshift(`#${CSS.escape(el.id)}`); break; }
      let cls = (el.className && typeof el.className === 'string')
        ? el.className.trim().split(/\s+/).map(c=>'.'+CSS.escape(c)).join('') : '';
      if (cls) part += cls;
      let sib = el, idx = 1;
      while ((sib = sib.previousElementSibling) != null)
        if (sib.nodeName === el.nodeName) idx++;
      if (el.parentElement && el.parentElement.querySelectorAll(el.nodeName).length > 1)
        part += `:nth-of-type(${idx})`;
      parts.unshift(part);
      el = el.parentElement;
    }
    return parts.join(' > ');
  }

  function resourceUrl(el){
    const u = (el && (el.src || el.href)) ? (el.src || el.href) : null;
    return u || null;
  }

  const onMove = (e) => {
    if (!window.__nyxPickerActive) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === document.documentElement || el === document.body) return;
    const r = getRect(el);
    if (!r.vis) return;
    box.style.left = r.x + 'px';
    box.style.top  = r.y + 'px';
    box.style.width  = r.w + 'px';
    box.style.height = r.h + 'px';
  };

  const onClick = (e) => {
    if (!window.__nyxPickerActive) return;
    e.preventDefault(); e.stopPropagation();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el) return;
    try {
      const host = location.host;
      const sel  = cssPath(el);
      const url  = resourceUrl(el);
      if (window.chrome && window.chrome.webview) {
        if (sel) window.chrome.webview.postMessage(`nyx-cosmetic|${host}|${sel}`);
        if (url) window.chrome.webview.postMessage(`nyx-net|${host}|${url}`);
      }
    } catch {}
  };

  const onEsc = (e) => { if (e.key === 'Escape') teardown(); };

  function teardown(){
    window.__nyxPickerActive = false;
    window.removeEventListener('mousemove', onMove, true);
    window.removeEventListener('click', onClick, true);
    window.removeEventListener('keydown', onEsc, true);
    try { document.getElementById('__nyxPickerOverlay')?.remove(); } catch {}
    try { document.getElementById('__nyxPickerLabel')?.remove(); } catch {}
    window.__nyxPickerHandlers = null;
  }

  window.__nyxPickerHandlers = { onMove, onClick, onEsc };
  window.addEventListener('mousemove', onMove, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('keydown', onEsc, true);
})();
";

        // DISABLE – entfernt Handler & UI
        private const string PickerScriptDisable = @"
(() => {
  const H = window.__nyxPickerHandlers;
  window.__nyxPickerActive = false;
  if (H) {
    window.removeEventListener('mousemove', H.onMove, true);
    window.removeEventListener('click', H.onClick, true);
    window.removeEventListener('keydown', H.onEsc, true);
    window.__nyxPickerHandlers = null;
  }
  try { document.getElementById('__nyxPickerOverlay')?.remove(); } catch {}
  try { document.getElementById('__nyxPickerLabel')?.remove(); } catch {}
})();
";
    }
}

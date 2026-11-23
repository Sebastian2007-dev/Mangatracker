import {
  COSMETIC_REPORT_PREFIX,
  DOMAIN_GUARD_PREFIX,
  SCROLL_OFFER_PREFIX,
  SCROLL_REPORT_PREFIX,
  SCROLL_TRACK_SCRIPT,
  buildCosmeticAdCleanupScript,
  buildDomainGuardDialogScript,
  buildHideSelectorsScript,
  buildScrollOfferScript,
  buildScrollRestoreScript,
  scrollUrlKey
} from '../../../../shared/reader-scripts'
import { detectChapterFromUrl } from '../../../../shared/chapter-template'
import { AD_HOSTS, ALLOWED_THIRD_PARTY } from '../../../../shared/ad-hosts'
import type { DomainGuardLabels } from '../../../../shared/reader-scripts'
import type { DomainGuardMode, Manga } from '../../../../types/index'
import { ReaderWebView } from './reader.plugin'

/**
 * Verbindet den nativen Reader-WebView mit der App-Logik.
 *
 * Deckt die drei Dinge ab, die der Systembrowser nicht kann:
 *   1. Kapitelerkennung — aus der gemeldeten URL, ohne manuelle Eingabe
 *   2. Scroll-Gedaechtnis — fortlaufend gemeldet, beim Schliessen persistiert
 *   3. Werbung — Hosts nativ blockiert, Restwerbung per CSS ausgeblendet
 */

export interface ReaderCallbacks {
  /** Neue Kapitelnummer erkannt (nur wenn hoeher als der aktuelle Stand). */
  onChapterDetected: (mangaId: string, chapter: number) => void | Promise<void>
  /** Reader geschlossen — hier wird die Scroll-Position persistiert. */
  onScrollPosition: (
    mangaId: string,
    position: { url: string; scrollY: number; scrollPercent: number } | undefined
  ) => void | Promise<void>
  /** Liefert den aktuellen Manga-Stand (Templates, gespeicherte Position). */
  getManga: (mangaId: string) => Manga | undefined
  /** Pro Domain ausgeblendete Selektoren aus den Einstellungen. */
  getHiddenSelectors: (domain: string) => string[]
  /**
   * Baut die Beschriftung des In-Page-Angebots.
   * Bekommt die Prozentzahl, damit vue-i18n sie selbst interpoliert.
   */
  buildLabels: (percent: number) => { jump: string; dismiss: string }

  // ── Domain Guard ───────────────────────────────────────────────────
  /** 'ask' | 'block' | 'off' */
  guardMode: DomainGuardMode
  /** Dauerhaft erlaubte bzw. gesperrte Domains aus den Einstellungen. */
  allowedDomains: string[]
  blockedDomains: string[]
  /** Beschriftung des Guard-Dialogs; bekommt Ziel- und Ursprungsdomain. */
  buildGuardLabels: (targetDomain: string, originDomain: string) => DomainGuardLabels
  /** Persistiert "ja, immer" bzw. "nie" in den Einstellungen. */
  onGuardDecision: (
    domain: string,
    decision: 'allow_always' | 'block_always'
  ) => void | Promise<void>
}

let callbacks: ReaderCallbacks | null = null
let listenersReady = false

/** Fallback fuer Events, die keine mangaId mitbringen (readerPageFinished). */
let lastOpenedMangaId = ''

/** Geoeffnete URL — Basis fuer den Ursprungs-Domain-Vergleich im Dialog. */
let lastOpenedUrl = ''

/** Letzte gemeldete Position — beim Schliessen liegt sie damit schon vor. */
let lastScroll: { mangaId: string; url: string; scrollY: number; scrollPercent: number } | null = null

/** Verhindert, dass das Angebot bei jedem Nachladen derselben Seite erneut kommt. */
let offeredForUrlKey: string | null = null

/** Navigation, zu der gerade der Guard-Dialog offen ist. */
let pendingGuard: { url: string; domain: string } | null = null

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

async function handleUrlChanged(url: string, mangaId: string): Promise<void> {
  if (!callbacks || !mangaId) return
  const manga = callbacks.getManga(mangaId)
  if (!manga) return

  const detected = detectChapterFromUrl(url, manga.chapterUrlTemplate, manga.chapterDetectionTemplate)
  if (!detected) return
  if (detected.chapter <= manga.currentChapter) return

  await callbacks.onChapterDetected(mangaId, detected.chapter)
}

async function handlePageFinished(url: string, mangaId: string): Promise<void> {
  if (!callbacks) return

  // 1. Scroll-Tracking (neue Seite = frischer Kontext)
  await ReaderWebView.executeScript({ code: SCROLL_TRACK_SCRIPT }).catch(() => {})

  // 2. Werbe-Elemente ausblenden, die die Netzwerksperre passieren.
  //    Fremde Bilder werden absichtlich geladen (Kapitelseiten), deshalb muessen
  //    Banner und mitscrollende Overlays hier im DOM erwischt werden.
  await ReaderWebView.executeScript({
    code: buildCosmeticAdCleanupScript(ALLOWED_THIRD_PARTY)
  }).catch(() => {})

  // 3. Zusaetzlich die vom Nutzer per Element-Picker gewaehlten Selektoren
  const selectors = callbacks.getHiddenSelectors(domainOf(url))
  if (selectors.length > 0) {
    const code = buildHideSelectorsScript(selectors)
    if (code) await ReaderWebView.executeScript({ code }).catch(() => {})
  }

  // 4. Rueckkehr zur gespeicherten Position anbieten
  const manga = mangaId ? callbacks.getManga(mangaId) : undefined
  const saved = manga?.scrollPosition
  if (!saved || saved.scrollY <= 100) return
  const key = scrollUrlKey(url)
  if (scrollUrlKey(saved.url) !== key) return
  if (offeredForUrlKey === key) return
  offeredForUrlKey = key

  const percent = Math.round(Math.min(1, Math.max(0, saved.scrollPercent)) * 100)
  await ReaderWebView.executeScript({
    code: buildScrollOfferScript(callbacks.buildLabels(percent))
  }).catch(() => {})
}

async function handleMessage(message: string, mangaId: string): Promise<void> {
  if (!callbacks) return

  if (message.startsWith(SCROLL_REPORT_PREFIX)) {
    try {
      const state = JSON.parse(message.slice(SCROLL_REPORT_PREFIX.length)) as {
        y: number
        pct: number
        url: string
      }
      if (!Number.isFinite(state.y) || !state.url) return
      lastScroll = {
        mangaId,
        url: state.url,
        scrollY: Math.max(0, Math.round(state.y)),
        scrollPercent: Math.min(1, Math.max(0, Number(state.pct) || 0))
      }
    } catch {
      // Unvollstaendige Meldung ignorieren
    }
    return
  }

  if (message.startsWith(COSMETIC_REPORT_PREFIX)) {
    // Nur zur Diagnose: wie viele Elemente der Durchlauf ausgeblendet hat.
    console.info('Reader: Werbe-Elemente ausgeblendet', message.slice(COSMETIC_REPORT_PREFIX.length))
    return
  }

  if (message.startsWith(DOMAIN_GUARD_PREFIX)) {
    try {
      const answer = JSON.parse(message.slice(DOMAIN_GUARD_PREFIX.length)) as { action: string }
      await handleGuardAnswer(answer.action)
    } catch {
      pendingGuard = null
    }
    return
  }

  if (message.startsWith(SCROLL_OFFER_PREFIX)) {
    try {
      const answer = JSON.parse(message.slice(SCROLL_OFFER_PREFIX.length)) as { action: string }
      if (answer.action !== 'jump') return
      const manga = callbacks.getManga(mangaId)
      const target = manga?.scrollPosition?.scrollY
      if (!target) return
      await ReaderWebView.executeScript({ code: buildScrollRestoreScript(target) }).catch(() => {})
    } catch {
      // Ignorieren
    }
  }
}

/**
 * Reagiert auf eine vom Plugin abgewiesene Navigation.
 *
 * Nur `reason === 'ask'` fuehrt zum Dialog. Automatische Umleitungen ('auto'),
 * bekannte Werbe-Hosts und bereits gesperrte Domains sind schon entschieden —
 * dafuer soll niemand gefragt werden, das war der ganze Zweck.
 */
async function handleNavigationBlocked(
  event: { url: string; domain: string; reason: string },
): Promise<void> {
  if (!callbacks) return
  if (event.reason !== 'ask') return
  if (!event.domain) return
  if (pendingGuard) return

  pendingGuard = { url: event.url, domain: event.domain }
  const origin = originDomainOf(lastOpenedUrl)
  await ReaderWebView.executeScript({
    code: buildDomainGuardDialogScript(callbacks.buildGuardLabels(event.domain, origin))
  }).catch(() => {
    pendingGuard = null
  })
}

async function handleGuardAnswer(action: string): Promise<void> {
  const pending = pendingGuard
  pendingGuard = null
  if (!pending || !callbacks) return

  if (action === 'yes' || action === 'yes_always') {
    if (action === 'yes_always') {
      await callbacks.onGuardDecision(pending.domain, 'allow_always')
    }
    // Die Navigation wurde nativ verworfen — hier erneut ausloesen
    await ReaderWebView.setUrl({ url: pending.url }).catch(() => {})
    return
  }

  if (action === 'no_block') {
    await callbacks.onGuardDecision(pending.domain, 'block_always')
  }
  // 'no': nichts tun, die Navigation bleibt verworfen
}

function originDomainOf(url: string): string {
  const host = domainOf(url)
  const parts = host.split('.')
  return parts.length < 2 ? host : parts.slice(-2).join('.')
}

async function handleClosed(mangaId: string): Promise<void> {
  if (!callbacks) return
  const report = lastScroll
  const keep = report !== null && report.mangaId === mangaId && report.scrollY > 100
  await callbacks.onScrollPosition(
    mangaId,
    keep ? { url: report!.url, scrollY: report!.scrollY, scrollPercent: report!.scrollPercent } : undefined
  )
  lastScroll = null
  offeredForUrlKey = null
}

/**
 * Registriert die Plugin-Listener genau einmal.
 *
 * Die Listener bleiben fuer die Lebensdauer der App bestehen; `callbacks` wird bei
 * jedem Oeffnen aktualisiert, damit sie stets auf den aktuellen Store zeigen.
 */
async function ensureListeners(): Promise<void> {
  if (listenersReady) return
  listenersReady = true

  await ReaderWebView.addListener('readerUrlChanged', (event) => {
    void handleUrlChanged(event.url, event.mangaId)
  })
  await ReaderWebView.addListener('readerPageFinished', (event) => {
    void handlePageFinished(event.url, lastOpenedMangaId)
  })
  await ReaderWebView.addListener('readerMessage', (event) => {
    void handleMessage(event.message, event.mangaId || lastOpenedMangaId)
  })
  await ReaderWebView.addListener('readerClosed', (event) => {
    void handleClosed(event.mangaId || lastOpenedMangaId)
  })
  await ReaderWebView.addListener('readerNavigationBlocked', (event) => {
    void handleNavigationBlocked(event)
  })
}


/** Oeffnet ein Kapitel im In-App-Reader. */
export async function openInReader(
  url: string,
  mangaId: string,
  next: ReaderCallbacks
): Promise<void> {
  callbacks = next
  lastOpenedMangaId = mangaId
  lastOpenedUrl = url
  lastScroll = null
  offeredForUrlKey = null
  pendingGuard = null
  await ensureListeners()
  await ReaderWebView.open({
    url,
    mangaId,
    blockedHosts: AD_HOSTS,
    blockPopups: true,
    strictThirdParty: true,
    allowedThirdParty: ALLOWED_THIRD_PARTY,
    guardMode: next.guardMode,
    allowedDomains: next.allowedDomains,
    blockedDomains: next.blockedDomains
  })
}

export async function closeReader(): Promise<void> {
  await ReaderWebView.close().catch(() => {})
}

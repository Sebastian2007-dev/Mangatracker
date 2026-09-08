/**
 * Host-Blockliste fuer den In-App-Reader.
 *
 * Absichtlich hier und nicht im nativen Code: so ist sie ohne Android-Build
 * pflegbar und wird beim Oeffnen an das Plugin uebergeben.
 *
 * Das Plugin prueft Host *und* alle Elterndomains — `doubleclick.net` deckt also
 * auch `stats.g.doubleclick.net` ab. Deshalb stehen hier nur die Wurzeln.
 *
 * Bewusst konservativ: Leseseiten liefern ihre Bilder oft ueber CDNs, die einer
 * aggressiven Liste zum Opfer fallen wuerden. Blockiert wird, was eindeutig
 * Werbung oder Tracking ist.
 */
export const AD_HOSTS: string[] = [
  // Google Ads / Analytics
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'googletagservices.com',
  'googletagmanager.com',
  'google-analytics.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  // Grosse Ad-Exchanges und SSPs
  'adnxs.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'criteo.com',
  'criteo.net',
  'taboola.com',
  'outbrain.com',
  'media.net',
  'smartadserver.com',
  'adform.net',
  'casalemedia.com',
  'sharethrough.com',
  'triplelift.com',
  'indexww.com',
  'bidswitch.net',
  'spotxchange.com',
  'teads.tv',
  'yieldmo.com',
  'sonobi.com',
  '3lift.com',
  // Bei Manga-/Streaming-Seiten haeufige Popup- und Redirect-Netze
  'popads.net',
  'popcash.net',
  'propellerads.com',
  'exoclick.com',
  'exosrv.com',
  'juicyads.com',
  'adsterra.com',
  'hilltopads.net',
  'clickadu.com',
  'adcash.com',
  'mgid.com',
  'revcontent.com',
  'trafficjunky.net',
  'poweredby.jads.co',
  'monetag.com',
  'onclickalgo.com',
  'onclasrv.com',
  'zeydoo.com',
  // Tracking / Fingerprinting
  'scorecardresearch.com',
  'quantserve.com',
  'hotjar.com',
  'mixpanel.com',
  'segment.io',
  'branch.io',
  'amplitude.com',
  'fullstory.com',
  'clarity.ms',
  'moatads.com',
  'adsafeprotected.com',
  'omnitagjs.com',
  // Social-Tracker (Bilder auf Leseseiten kommen nie von hier)
  'connect.facebook.net',
  'facebook.net',
  'analytics.tiktok.com',

  // ── Auf den tatsaechlich genutzten Leseseiten gemessen (08.09.) ──────
  // Diese Netze liefern ueber zufaellig benannte, rotierende Domains aus.
  // Die Namen hier sind Momentaufnahmen — der Schutz dagegen ist
  // ALLOWED_THIRD_PARTY weiter unten, nicht diese Liste.
  '405kk.com',
  '484r.com',
  'aqle3.com',
  'a-ads.com',
  'boordlygripe.cyou',
  'onclcktg.com',
  'onclckinpg.com',
  'onclckmn.com',
  'onclckinp.com',
  'onclckmetrics.com',
  'boulder-collide.com',
  'chagnougroalry.net',
  'trkblue.com',
  'pubadx.one',
  'junior-shine.com',
  'edshessite.com',
  'ecomindscapes.com',
  'sootoarathus.net',
  'swiwetduchan.shop',
  'diveinthebluesky.biz',
  'nowedgigsman.com',
  'murky-benefit.pro',
  'inppcdn.com',

  // ── Zweite Messung, manhuaus.com (08.09.) ───────────────────────────
  'infolinks.com',
  'hattyrhombi.com',
  'graftautobus.cyou',
  'a-zzz.com'
]

/**
 * Fremde Domains, von denen Skripte und iframes erlaubt bleiben.
 *
 * Der eigentliche Schutz: auf Leseseiten kommt der Inhalt von der Seite selbst
 * plus einer Handvoll Infrastruktur-CDNs. Alles andere, was ein *Skript* oder
 * *iframe* von einer fremden Domain laedt, ist praktisch immer Werbung.
 *
 * Das wirkt auch gegen die zufaellig benannten Domains, die diese Netze taeglich
 * wechseln — man muss ihre Namen nicht kennen, um sie zu blockieren.
 *
 * Bilder bleiben unangetastet, sonst fehlen die Kapitelseiten.
 */
export const ALLOWED_THIRD_PARTY: string[] = [
  // Bibliotheks- und Font-CDNs
  'cloudflare.com',
  // challenges.cloudflare.com ist die Bot-Pruefung (Turnstile) — ohne sie
  // laesst die Seite den Reader nicht durch.
  'jsdelivr.net',
  // www.google.com liefert reCAPTCHA. Googles *Werbe*-Domains
  // (googlesyndication, doubleclick, googletagservices, googletagmanager)
  // stehen oben in AD_HOSTS und werden vorher geprueft — diese Freigabe
  // schwaecht die Werbesperre also nicht.
  'google.com',
  'googleapis.com',
  'gstatic.com',
  'unpkg.com',
  'jquery.com',
  'bootstrapcdn.com',
  'cloudflare.net',
  // Content-Domains von Leseseiten, die unter eigenem Namen ausliefern
  'mangageko.com',
  'mgeko.cc',
  'asurascans.com',
  'asuracomic.net',
  'manhuaus.com',
  // Bild-Domain von mgeko.cc — liefert die Kapitelseiten, nicht Werbung
  'imgsrv5.com',
  // Avatare in Kommentaren; harmlos und sonst als Werbung ausgeblendet
  'gravatar.com'
]

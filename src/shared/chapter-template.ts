/**
 * Kapitelerkennung aus der navigierten URL.
 *
 * Lag bisher nur in src/main/reader/ReaderView.ts und war damit an den
 * Electron-Main-Prozess gebunden. Da die Erkennung ausschliesslich mit der URL
 * arbeitet — kein DOM, kein Scraping — kann der Android-Reader dieselbe Logik
 * nutzen, sobald sein WebView die URL meldet.
 */

export interface TemplateFixResult {
  newTemplate: string
  confidence: number
}

/** Unterstuetzt die Bindestrich-Dezimalschreibweise mancher Seiten ("62-1" → 62.1). */
export function parseChapter(value: string): number {
  return parseFloat(value.replace(/^(\d+)-(\d+)$/, '$1.$2'))
}

export function buildChapterRegex(template: string): RegExp | null {
  try {
    const parts = template.split('$chapter')
    if (parts.length < 2) return null
    const escapedParts = parts.map((part) => {
      const escaped = part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Hex-Hashes in URL-Slugs flexibel matchen — manche Seiten (z.B. AsuraComic)
      // ändern den Hash-Teil des Slugs, leiten aber trotzdem korrekt weiter.
      return escaped.replace(/-[0-9a-fA-F]{6,12}(?=\/)/g, '-[0-9a-fA-F]{6,12}')
    })
    // Match both dot-decimal (62.1) and dash-decimal (62-1) chapter numbers
    return new RegExp(escapedParts.join('(\\d+(?:[-.]\\d+)?)'))
  } catch {
    return null
  }
}

export function tryFixTemplate(navUrl: string, template: string): TemplateFixResult | null {
  const chapterIdx = template.indexOf('$chapter')
  if (chapterIdx === -1) return null
  try {
    const navUrlObj = new URL(navUrl)
    const templatePrefix = template.substring(0, chapterIdx)
    const templateSuffix = template.substring(chapterIdx + '$chapter'.length)
    const templateUrlObj = new URL(templatePrefix.replace(/\/?$/, '/dummy'))

    if (templateUrlObj.hostname !== navUrlObj.hostname) return null

    // Find last numeric path segment (= chapter number)
    const pathSegs = navUrlObj.pathname.split('/')
    let chapterSegIdx = -1
    for (let i = pathSegs.length - 1; i >= 0; i--) {
      if (/^\d+(\.\d+)?$/.test(pathSegs[i]) && pathSegs[i].length > 0) {
        chapterSegIdx = i
        break
      }
    }
    if (chapterSegIdx === -1) return null

    // Rebuild template with $chapter
    const newPathSegs = [...pathSegs]
    newPathSegs[chapterSegIdx] = '$chapter'
    const newTemplate =
      navUrlObj.protocol + '//' + navUrlObj.host + newPathSegs.join('/') + templateSuffix

    // Compare path segments before the chapter number
    const oldSegs = templateUrlObj.pathname.replace('/dummy', '').split('/').filter(Boolean)
    const newSegs = pathSegs.slice(0, chapterSegIdx).filter(Boolean)

    if (oldSegs.length !== newSegs.length) return null

    let diffCount = 0
    let hexHashDiffCount = 0
    for (let i = 0; i < oldSegs.length; i++) {
      if (oldSegs[i] !== newSegs[i]) {
        diffCount++
        const oldBase = oldSegs[i].replace(/-[0-9a-fA-F]{6,12}$/, '')
        const newBase = newSegs[i].replace(/-[0-9a-fA-F]{6,12}$/, '')
        if (oldBase === newBase && oldBase !== oldSegs[i] && newBase !== newSegs[i]) {
          hexHashDiffCount++
        }
      }
    }

    if (diffCount === 0) return null

    let confidence: number
    if (diffCount === hexHashDiffCount) {
      confidence = diffCount === 1 ? 0.95 : 0.8
    } else {
      confidence = Math.max(0, 0.5 - (diffCount - hexHashDiffCount) * 0.2)
    }

    return { newTemplate, confidence }
  } catch {
    return null
  }
}

/**
 * Liest die Kapitelnummer aus einer URL — erst mit dem Lese-Template, dann mit dem
 * Erkennungs-Template als Rueckfall.
 *
 * Gibt `null` zurueck, wenn keines passt; der Aufrufer kann dann tryFixTemplate()
 * bemuehen.
 */
export function detectChapterFromUrl(
  navUrl: string,
  chapterUrlTemplate: string | undefined,
  chapterDetectionTemplate?: string
): { chapter: number; source: 'template' | 'detection' } | null {
  for (const [template, source] of [
    [chapterUrlTemplate, 'template'],
    [chapterDetectionTemplate, 'detection']
  ] as const) {
    if (!template) continue
    const regex = buildChapterRegex(template)
    const match = regex?.exec(navUrl)
    if (!match) continue
    const chapter = parseChapter(match[1])
    if (Number.isNaN(chapter)) continue
    return { chapter, source }
  }
  return null
}

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChapterRegex,
  detectChapterFromUrl,
  parseChapter,
  tryFixTemplate
} from '../src/shared/chapter-template'

test('parseChapter understands dot and dash decimal notation', () => {
  assert.equal(parseChapter('62'), 62)
  assert.equal(parseChapter('62.1'), 62.1)
  // Manche Seiten schreiben Unterkapitel mit Bindestrich
  assert.equal(parseChapter('62-1'), 62.1)
  assert.ok(Number.isNaN(parseChapter('abc')))
})

test('buildChapterRegex extracts the chapter from a templated URL', () => {
  const regex = buildChapterRegex('https://site.test/manga/foo/chapter-$chapter')
  assert.ok(regex)
  assert.equal(regex!.exec('https://site.test/manga/foo/chapter-73')?.[1], '73')
  assert.equal(regex!.exec('https://site.test/manga/foo/chapter-73.2')?.[1], '73.2')
  assert.equal(regex!.exec('https://site.test/manga/foo/chapter-73-2')?.[1], '73-2')
  assert.equal(regex!.exec('https://other.test/manga/foo/chapter-73'), null)
})

test('buildChapterRegex tolerates changing hex hashes in URL slugs', () => {
  // AsuraComic & Co. tauschen den Hash im Slug, leiten aber korrekt weiter
  const regex = buildChapterRegex('https://site.test/series/foo-a1b2c3d4/chapter/$chapter')
  assert.ok(regex)
  assert.equal(
    regex!.exec('https://site.test/series/foo-99887766/chapter/12')?.[1],
    '12'
  )
})

test('buildChapterRegex rejects templates without a $chapter placeholder', () => {
  assert.equal(buildChapterRegex('https://site.test/manga/foo/chapter-1'), null)
})

test('detectChapterFromUrl falls back to the detection template', () => {
  const primary = 'https://site.test/read/$chapter'
  const detection = 'https://site.test/v2/ch/$chapter'

  assert.deepEqual(detectChapterFromUrl('https://site.test/read/50', primary, detection), {
    chapter: 50,
    source: 'template'
  })
  // Seite umgestellt: nur noch das Detection-Template passt
  assert.deepEqual(detectChapterFromUrl('https://site.test/v2/ch/51', primary, detection), {
    chapter: 51,
    source: 'detection'
  })
  assert.equal(detectChapterFromUrl('https://site.test/somewhere/else', primary, detection), null)
})

test('detectChapterFromUrl copes with a missing template', () => {
  assert.equal(detectChapterFromUrl('https://site.test/read/50', undefined), null)
})

test('tryFixTemplate repairs a changed slug hash with high confidence', () => {
  const fixed = tryFixTemplate(
    'https://site.test/series/foo-99887766/chapter/12',
    'https://site.test/series/foo-a1b2c3d4/chapter/$chapter'
  )
  assert.ok(fixed)
  assert.equal(fixed!.newTemplate, 'https://site.test/series/foo-99887766/chapter/$chapter')
  // Nur der Hash-Teil unterscheidet sich → hohe Zuversicht
  assert.ok(fixed!.confidence >= 0.9, `confidence war ${fixed!.confidence}`)
})

test('tryFixTemplate is unsure when unrelated path segments differ', () => {
  const fixed = tryFixTemplate(
    'https://site.test/comics/other/chapter/12',
    'https://site.test/series/foo/chapter/$chapter'
  )
  // Zwei unabhaengige Abweichungen → niedrige Zuversicht, keine Auto-Uebernahme
  if (fixed) assert.ok(fixed.confidence < 0.6, `confidence war ${fixed.confidence}`)
})

test('tryFixTemplate refuses to cross hosts or invent a chapter segment', () => {
  assert.equal(
    tryFixTemplate('https://evil.test/series/foo/chapter/12', 'https://site.test/series/foo/chapter/$chapter'),
    null
  )
  // Keine numerische Pfadkomponente → nichts zu reparieren
  assert.equal(
    tryFixTemplate('https://site.test/series/foo/chapter/latest', 'https://site.test/series/foo/chapter/$chapter'),
    null
  )
  assert.equal(tryFixTemplate('https://site.test/x/1', 'no placeholder here'), null)
})

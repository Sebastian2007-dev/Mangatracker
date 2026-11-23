import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SCROLL_REPORT_PREFIX,
  SCROLL_TRACK_SCRIPT,
  buildScrollRestoreScript,
  scrollUrlKey
} from '../src/shared/reader-scripts'

test('injected reader scripts are syntactically valid JavaScript', () => {
  // Die Skripte gehen als String in die Seite. Ein Syntaxfehler faellt sonst erst
  // zur Laufzeit auf — und dort still, weil die Injection mit .catch() laeuft.
  assert.doesNotThrow(() => new Function(SCROLL_TRACK_SCRIPT))
  assert.doesNotThrow(() => new Function(buildScrollRestoreScript(4321)))
  assert.doesNotThrow(() => new Function(buildScrollRestoreScript(0)))
})

test('scroll tracking script embeds the report prefix the main process listens for', () => {
  // Praefix im Skript und im Parser muessen identisch sein, sonst wird jede
  // Meldung verworfen und es wird nie eine Position gespeichert.
  assert.ok(SCROLL_TRACK_SCRIPT.includes(JSON.stringify(SCROLL_REPORT_PREFIX)))
})

test('scroll restore script carries the sanitised target offset', () => {
  assert.ok(buildScrollRestoreScript(4321).includes('var target = 4321'))
  assert.ok(buildScrollRestoreScript(12.7).includes('var target = 13'))
  // Negative und unbrauchbare Werte landen auf 0 statt im Skript zu landen
  assert.ok(buildScrollRestoreScript(-50).includes('var target = 0'))
  assert.ok(buildScrollRestoreScript(Number.NaN).includes('var target = 0'))
})

test('scrollUrlKey ignores fragments and trailing slashes but not the chapter', () => {
  // Regression: der Vergleich lief auf exakte String-Gleichheit, wodurch ein
  // angehaengtes Fragment die gespeicherte Position unerreichbar machte.
  const same: Array<[string, string]> = [
    ['https://x.com/ch/12', 'https://x.com/ch/12/'],
    ['https://x.com/ch/12', 'https://x.com/ch/12#page-3'],
    ['https://x.com/ch/12?a=1', 'https://x.com/ch/12?a=1#top'],
    ['https://x.com/ch/12//', 'https://x.com/ch/12']
  ]
  for (const [left, right] of same) {
    assert.equal(scrollUrlKey(left), scrollUrlKey(right), `${left} != ${right}`)
  }

  // Das Kapitel muss unterscheidbar bleiben — egal ob im Pfad oder in der Query
  const different: Array<[string, string]> = [
    ['https://x.com/ch/12', 'https://x.com/ch/13'],
    ['https://x.com/r?ch=12', 'https://x.com/r?ch=13'],
    ['https://x.com/ch/12', 'https://y.com/ch/12']
  ]
  for (const [left, right] of different) {
    assert.notEqual(scrollUrlKey(left), scrollUrlKey(right), `${left} == ${right}`)
  }
})

test('scrollUrlKey survives strings that are not valid URLs', () => {
  assert.equal(scrollUrlKey('not a url#frag'), 'not a url')
  assert.equal(scrollUrlKey(''), '')
})

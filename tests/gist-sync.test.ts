import test from 'node:test'
import assert from 'node:assert/strict'
import type { Manga, StatisticsEvent, StatisticsTagCache } from '../src/types/index'
import {
  buildSyncPayload,
  GIST_VERSION,
  mergeLists,
  mergeSkillTree,
  mergeStatisticsPayload,
  parseSyncPayload
} from '../src/shared/gist.sync'
import { normalizeUnlockedSkills } from '../src/shared/skill-tree'

function makeManga(overrides: Partial<Manga> = {}): Manga {
  return {
    id: overrides.id ?? 'manga-1',
    title: overrides.title ?? 'Sample Manga',
    mainUrl: overrides.mainUrl ?? 'https://example.com/sample',
    chapterUrlTemplate: overrides.chapterUrlTemplate ?? 'https://example.com/sample/$chapter',
    status: overrides.status ?? 'reading',
    isFocused: overrides.isFocused ?? false,
    currentChapter: overrides.currentChapter ?? 0,
    hasNewChapter: overrides.hasNewChapter ?? false,
    lastCheckedChapter: overrides.lastCheckedChapter ?? overrides.currentChapter ?? 0,
    createdAt: overrides.createdAt ?? 1_700_000_000_000,
    updatedAt: overrides.updatedAt ?? 1_700_000_000_000,
    mangaDexId: overrides.mangaDexId,
    mangaDexTitle: overrides.mangaDexTitle,
    mangaDexCoverUrl: overrides.mangaDexCoverUrl,
    comickHid: overrides.comickHid,
    comickTitle: overrides.comickTitle,
    comickCoverUrl: overrides.comickCoverUrl,
    tags: overrides.tags
  }
}

test('parseSyncPayload accepts old payloads without stats and migrates genres to tags', () => {
  const payload = parseSyncPayload(JSON.stringify({
    version: 1,
    syncedAt: 123,
    manga: [{ ...makeManga(), genres: ['Action'] }],
    deleted: [{ id: 'gone-1', deletedAt: 321 }]
  }))

  assert.equal(payload.version, 1)
  assert.equal(payload.manga.length, 1)
  assert.deepEqual(payload.manga[0].tags, ['Action'])
  assert.equal(payload.deleted.length, 1)
  assert.deepEqual(payload.stats.events, [])
  assert.equal(payload.stats.tagCache, null)
})

test('buildSyncPayload round-trips statistics payloads', () => {
  const events: StatisticsEvent[] = [
    {
      id: 'chapter_progress:manga-1:1',
      type: 'chapter_progress',
      mangaId: 'manga-1',
      at: 1,
      amount: 10,
      fromChapter: 0,
      toChapter: 10
    }
  ]
  const tagCache: StatisticsTagCache = {
    fetchedAt: 2,
    sourceKey: 'mdx:demo',
    tags: { Action: 1 }
  }

  const raw = buildSyncPayload([makeManga()], [], { events, tagCache })
  const parsed = parseSyncPayload(raw)

  assert.equal(parsed.version, GIST_VERSION)
  assert.equal(parsed.stats.events.length, 1)
  assert.equal(parsed.stats.tagCache?.tags.Action, 1)
})

test('mergeLists keeps the newest manga and respects tombstones', () => {
  const local = [makeManga({ id: 'a', updatedAt: 10, title: 'Local' })]
  const remote = [makeManga({ id: 'a', updatedAt: 20, title: 'Remote' }), makeManga({ id: 'b', updatedAt: 5 })]
  const merged = mergeLists(local, remote, [], [{ id: 'b', deletedAt: 99 }])

  assert.equal(merged.manga.length, 1)
  assert.equal(merged.manga[0].title, 'Remote')
  assert.equal(merged.deleted.length, 1)
})

test('mergeLists restores remote entries when the local side is empty', () => {
  // Absicherung fuer den Fall "lokal leer, Gist voll": der Sync muss die
  // Remote-Eintraege zurueckbringen und darf die Leere nicht hochschieben.
  const remote = [1, 2, 3].map((n) => makeManga({ id: `r${n}`, updatedAt: 1_000 + n }))
  const merged = mergeLists([], remote, [], [])

  assert.deepEqual(merged.manga.map((m) => m.id).sort(), ['r1', 'r2', 'r3'])

  // Ein lokaler Papierkorb-Eintrag loescht nur, wenn er neuer ist als der Manga
  const withTombstone = mergeLists([], remote, [{ id: 'r2', deletedAt: 5_000 }], [])
  assert.deepEqual(withTombstone.manga.map((m) => m.id).sort(), ['r1', 'r3'])

  const staleTombstone = mergeLists([], remote, [{ id: 'r2', deletedAt: 1 }], [])
  assert.deepEqual(staleTombstone.manga.map((m) => m.id).sort(), ['r1', 'r2', 'r3'])
})

test('mergeLists respects the focus limit from the merged skill tree', () => {
  // Regression: ohne skillTree-Argument fiel mergeLists auf FOCUS_BASE (3) zurueck
  // und hat bei jedem Sync alles ab dem 4. Fokus-Eintrag entfokussiert — auch wenn
  // focus_1..focus_4 freigeschaltet waren.
  const focused = [1, 2, 3, 4, 5, 6].map((n) =>
    makeManga({ id: `m${n}`, isFocused: true, updatedAt: 1_000 + n })
  )

  const withoutSkills = mergeLists(focused, [], [], [])
  assert.equal(withoutSkills.manga.filter((m) => m.isFocused).length, 3)

  const withSkills = mergeLists(focused, [], [], [], {
    unlockedSkills: ['focus_1', 'focus_2', 'focus_3'],
    version: 1
  })
  assert.equal(withSkills.manga.filter((m) => m.isFocused).length, 6)

  // Bei Ueberschreitung bleiben die zuletzt aktualisierten Eintraege fokussiert.
  // focus_1 allein ergibt FOCUS_BASE (3) + 1 = 4 Slots.
  const capped = mergeLists(focused, [], [], [], {
    unlockedSkills: ['focus_1'],
    version: 1
  })
  const stillFocused = capped.manga.filter((m) => m.isFocused).map((m) => m.id).sort()
  assert.deepEqual(stillFocused, ['m3', 'm4', 'm5', 'm6'])
})

test('mergeSkillTree unions both sides and survives a payload round-trip', () => {
  const merged = mergeSkillTree(
    { unlockedSkills: ['focus_1', 'palette_ember'], version: 1 },
    { unlockedSkills: ['focus_1', 'card_glow'], version: 1 }
  )
  assert.deepEqual(merged.unlockedSkills.sort(), ['card_glow', 'focus_1', 'palette_ember'])

  // Der Skill-Tree muss den Gist-Roundtrip ueberleben — vorher liess der Desktop
  // das Argument weg, wodurch buildSyncPayload den Key ganz weggelassen hat.
  const json = buildSyncPayload([], [], { events: [], tagCache: null }, undefined, merged)
  const parsed = parseSyncPayload(json)
  assert.deepEqual(parsed.skillTree?.unlockedSkills.sort(), ['card_glow', 'focus_1', 'palette_ember'])
})

test('normalizeUnlockedSkills migrates renamed skills and drops removed ones', () => {
  const normalized = normalizeUnlockedSkills([
    'focus_1',
    'legendary',   // umbenannt -> profile_legendary
    'adv_search',  // entfernt (Kernfunktion, nicht mehr gegatet)
    'export_list', // entfernt
    'focus_1'      // Duplikat
  ])
  assert.deepEqual(normalized.sort(), ['focus_1', 'profile_legendary'])
})

test('mergeStatisticsPayload de-duplicates events and prefers the newest cache', () => {
  const olderCache: StatisticsTagCache = {
    fetchedAt: 10,
    sourceKey: 'mdx:old',
    tags: { Action: 1 }
  }
  const newerCache: StatisticsTagCache = {
    fetchedAt: 20,
    sourceKey: 'mdx:new',
    tags: { Fantasy: 2 }
  }

  const merged = mergeStatisticsPayload(
    {
      events: [
        { id: 'event-1', type: 'manga_added', mangaId: 'a', at: 1 },
        { id: 'event-2', type: 'manga_deleted', mangaId: 'b', at: 2 }
      ],
      tagCache: olderCache
    },
    {
      events: [
        { id: 'event-2', type: 'manga_deleted', mangaId: 'b', at: 2 },
        { id: 'event-3', type: 'manga_restored', mangaId: 'b', at: 3 }
      ],
      tagCache: newerCache
    }
  )

  assert.equal(merged.events.length, 3)
  assert.equal(merged.tagCache?.sourceKey, 'mdx:new')
  assert.equal(merged.tagCache?.tags.Fantasy, 2)
})
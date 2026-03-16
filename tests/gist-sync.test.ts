import test from 'node:test'
import assert from 'node:assert/strict'
import type { Manga, StatisticsEvent, StatisticsTagCache } from '../src/types/index'
import {
  buildSyncPayload,
  mergeLists,
  mergeStatisticsPayload,
  parseSyncPayload
} from '../src/shared/gist.sync'

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

  assert.equal(parsed.version, 3)
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
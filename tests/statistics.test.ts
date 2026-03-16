import test from 'node:test'
import assert from 'node:assert/strict'
import type { Manga, StatisticsTagCache, TrashedManga } from '../src/types/index'
import {
  buildCreateStatisticsEvents,
  buildDeleteStatisticsEvents,
  buildRestoreStatisticsEvents,
  buildStatisticsOverview,
  buildUpdateStatisticsEvents
} from '../src/shared/statistics'

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

function makeTrash(overrides: Partial<TrashedManga> = {}): TrashedManga {
  return {
    ...makeManga(overrides),
    deletedAt: overrides.deletedAt ?? 1_700_100_000_000
  }
}

test('buildStatisticsOverview handles an empty library', () => {
  const overview = buildStatisticsOverview([], [], [], null, false, 1_700_200_000_000)

  assert.equal(overview.counts.current, 0)
  assert.equal(overview.counts.deleted, 0)
  assert.equal(overview.counts.allTime, 0)
  assert.equal(overview.chapters.allTime, 0)
  assert.equal(overview.activeDays, 0)
  assert.equal(overview.favoriteTag, null)
  assert.equal(overview.tagCache.stale, false)
})

test('buildStatisticsOverview combines snapshot data, history, and tag cache', () => {
  const active = makeManga({
    id: 'active-1',
    title: 'Active One',
    currentChapter: 42,
    lastCheckedChapter: 55,
    isFocused: true,
    mangaDexId: 'mdx-1'
  })
  const completed = makeManga({
    id: 'active-2',
    title: 'Completed One',
    status: 'completed',
    currentChapter: 90,
    lastCheckedChapter: 90,
    comickHid: 'ck-1'
  })
  const deleted = makeTrash({
    id: 'deleted-1',
    title: 'Deleted One',
    currentChapter: 33
  })
  const events = [
    ...buildCreateStatisticsEvents(active, 1_700_000_000_000),
    ...buildCreateStatisticsEvents(completed, 1_700_010_000_000),
    {
      id: 'manga_deleted:deleted-1:1700200000000',
      type: 'manga_deleted' as const,
      mangaId: 'deleted-1',
      at: 1_700_200_000_000
    }
  ]
  const cache: StatisticsTagCache = {
    fetchedAt: 1_700_250_000_000,
    sourceKey: 'ck:ck-1|mdx:mdx-1',
    tags: {
      Action: 2,
      Fantasy: 1
    }
  }

  const overview = buildStatisticsOverview(
    [active, completed],
    [deleted],
    events,
    cache,
    false,
    1_700_300_000_000
  )

  assert.equal(overview.counts.current, 2)
  assert.equal(overview.counts.deleted, 1)
  assert.equal(overview.counts.allTime, 3)
  assert.equal(overview.chapters.current, 132)
  assert.equal(overview.chapters.unread, 13)
  assert.equal(overview.favoriteTag?.name, 'Action')
  assert.equal(overview.favoriteTag?.count, 2)
  assert.equal(overview.linked.mangaDex, 1)
  assert.equal(overview.linked.comick, 1)
  assert.equal(overview.statusCounts.completed, 1)
})

test('buildStatisticsOverview uses stored manga tags when no cache is available', () => {
  const active = makeManga({
    id: 'tag-local-1',
    mangaDexId: 'mdx-local-1',
    tags: ['action', ' Fantasy ', 'Action']
  })

  const overview = buildStatisticsOverview([active], [], [], null, false, 1_700_300_000_000)

  assert.equal(overview.favoriteTag?.name, 'Action')
  assert.equal(overview.favoriteTag?.count, 1)
  assert.equal(overview.tags.Action, 1)
  assert.equal(overview.tags.Fantasy, 1)
})

test('buildUpdateStatisticsEvents records positive chapter progress and status changes only', () => {
  const before = makeManga({
    id: 'manga-2',
    status: 'reading',
    currentChapter: 10,
    updatedAt: 1_700_000_000_000
  })
  const after = makeManga({
    id: 'manga-2',
    status: 'completed',
    currentChapter: 15,
    updatedAt: 1_700_100_000_000
  })
  const lowered = makeManga({
    id: 'manga-2',
    status: 'completed',
    currentChapter: 9,
    updatedAt: 1_700_200_000_000
  })

  const raisedEvents = buildUpdateStatisticsEvents(before, after, after.updatedAt)
  const loweredEvents = buildUpdateStatisticsEvents(after, lowered, lowered.updatedAt)

  assert.equal(raisedEvents.length, 2)
  assert.equal(raisedEvents[0].type, 'chapter_progress')
  assert.equal(raisedEvents[0].amount, 5)
  assert.equal(raisedEvents[1].type, 'status_changed')
  assert.equal(loweredEvents.length, 0)
})

test('create, delete, and restore event builders emit the expected event types', () => {
  const manga = makeManga({ id: 'manga-events', currentChapter: 12 })

  const createEvents = buildCreateStatisticsEvents(manga, 100)
  const deleteEvents = buildDeleteStatisticsEvents(manga, 200)
  const restoreEvents = buildRestoreStatisticsEvents(manga, 300)

  assert.equal(createEvents[0].type, 'manga_added')
  assert.equal(createEvents[1].type, 'chapter_progress')
  assert.equal(createEvents[1].synthetic, true)
  assert.equal(deleteEvents[0].type, 'manga_deleted')
  assert.equal(restoreEvents[0].type, 'manga_restored')
  assert.equal(restoreEvents[1].type, 'chapter_progress')
})
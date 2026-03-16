import type {
  Manga,
  MangaStatus,
  StatisticsAchievement,
  StatisticsEvent,
  StatisticsFavoriteTag,
  StatisticsTagCache,
  StatisticsOverview,
  TrashedManga
} from '../types/index'

const DAY_MS = 86_400_000
export const STATISTICS_TAG_CACHE_TTL_MS = DAY_MS

const LEVEL_THRESHOLDS = [
  0, 10, 25, 50, 100, 200, 350, 500, 750, 1000,
  1500, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 30000, 50000
]

const TAG_TO_CLASS: Array<[string[], string, string]> = [
  [['Action', 'Adventure', 'Shounen'], 'Berserker', 'Sword'],
  [['Romance', 'Shoujo', 'Harem'], 'Enchanter', 'Heart'],
  [['Fantasy', 'Isekai', 'Magic'], 'Dragon Knight', 'Dragon'],
  [['Sci-Fi', 'Mecha', 'Cyberpunk'], 'Cyber Adept', 'Circuit'],
  [['Horror', 'Psychological', 'Thriller'], 'Shadow Walker', 'Moon'],
  [['Comedy', 'Slice of Life', 'School Life'], 'Jester', 'Spark'],
  [['Sports'], 'Iron Champion', 'Trophy'],
  [['Mystery', 'Crime', 'Detective'], 'Shadow Detective', 'Search'],
  [['Historical', 'Samurai', 'Martial Arts'], 'Lore Keeper', 'Scroll']
]

type AchievementContext = {
  totalActive: number
  totalChaptersRead: number
  uniqueTags: number
  byStatus: Record<MangaStatus, number>
  focused: number
  linkedMangaDex: number
  level: number
  firstTrackedAt: number | null
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function getLocalDayKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getLocalMonthKey(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
}

function parseDayKey(dayKey: string): number {
  const [year, month, day] = dayKey.split('-').map((value) => Number.parseInt(value, 10))
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS)
}

function getLevel(totalChapters: number): number {
  let level = 1
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (totalChapters >= LEVEL_THRESHOLDS[i]) level = i + 1
  }
  return Math.min(level, LEVEL_THRESHOLDS.length)
}

function getLevelProgress(totalChapters: number): { level: number; xpCurrent: number; xpRequired: number; percent: number } {
  const level = getLevel(totalChapters)
  const previousXp = LEVEL_THRESHOLDS[level - 1] ?? 0
  const nextXp = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1]
  const xpCurrent = Math.max(0, totalChapters - previousXp)
  const xpRequired = Math.max(1, nextXp - previousXp)
  return {
    level,
    xpCurrent,
    xpRequired,
    percent: Math.min(100, Math.round((xpCurrent / xpRequired) * 100))
  }
}

function statScore(value: number, milestone: number): number {
  if (value <= 0 || milestone <= 0) return 0
  return Math.min(100, Math.round((Math.log1p(value) / Math.log1p(milestone)) * 100))
}

function getJobClass(tags: Record<string, number>): { name: string; icon: string } {
  const sortedTags = Object.entries(tags)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([tag]) => tag.toLowerCase())

  for (const [keywords, className, icon] of TAG_TO_CLASS) {
    if (keywords.some((keyword) => sortedTags.some((tag) => tag.includes(keyword.toLowerCase())))) {
      return { name: className, icon }
    }
  }

  return { name: 'Scholar', icon: 'Book' }
}

function getSecondaryClass(mangaList: Manga[], averageChapters: number, uniqueTags: number): string | null {
  const total = mangaList.length
  if (total === 0) return null

  const completed = mangaList.filter((manga) => manga.status === 'completed').length
  const planToRead = mangaList.filter((manga) => manga.status === 'plan_to_read').length

  if (completed / total > 0.3) return 'Completionist'
  if (averageChapters > 100) return 'Binge Reader'
  if (uniqueTags >= 8) return 'Tag Wanderer'
  if (planToRead / total > 0.4) return 'Grand Collector'
  return null
}

function buildAchievements(context: AchievementContext): StatisticsAchievement[] {
  const {
    totalActive,
    totalChaptersRead,
    uniqueTags,
    byStatus,
    focused,
    linkedMangaDex,
    level,
    firstTrackedAt
  } = context

  const completed = byStatus.completed ?? 0
  const daysSinceFirst = firstTrackedAt ? Math.floor((Date.now() - firstTrackedAt) / DAY_MS) : 0

  return [
    { id: 'first_steps', icon: 'BookOpen', name: 'First Steps', unlocked: totalActive >= 1, hint: '1+ manga in library' },
    { id: 'bookworm', icon: 'Library', name: 'Bookworm', unlocked: totalActive >= 10, hint: '10+ manga' },
    { id: 'grand_library', icon: 'Castle', name: 'Grand Library', unlocked: totalActive >= 50, hint: '50+ manga' },
    { id: 'speed_reader', icon: 'Zap', name: 'Speed Reader', unlocked: totalChaptersRead >= 500, hint: '500+ chapters read' },
    { id: 'binge_mode', icon: 'Flame', name: 'Binge Mode', unlocked: totalChaptersRead >= 2000, hint: '2000+ chapters read' },
    { id: 'chapter_master', icon: 'Gem', name: 'Chapter Master', unlocked: totalChaptersRead >= 5000, hint: '5000+ chapters read' },
    { id: 'tag_explorer', icon: 'Compass', name: 'Tag Explorer', unlocked: uniqueTags >= 5, hint: '5+ tags tracked' },
    { id: 'tag_connoisseur', icon: 'Palette', name: 'Tag Connoisseur', unlocked: uniqueTags >= 10, hint: '10+ tags tracked' },
    { id: 'completer', icon: 'CheckCircle2', name: 'Completer', unlocked: completed >= 1, hint: 'Completed 1 manga' },
    { id: 'completionist', icon: 'Trophy', name: 'Completionist', unlocked: completed >= 10, hint: '10+ completed manga' },
    { id: 'on_focus', icon: 'Target', name: 'On Focus', unlocked: focused >= 3, hint: '3 manga in Focus' },
    { id: 'veteran', icon: 'Clock3', name: 'Veteran', unlocked: daysSinceFirst >= 365, hint: '1+ year tracking' },
    { id: 'elite_reader', icon: 'Crown', name: 'Elite Reader', unlocked: level >= 15, hint: 'Reach Level 15' },
    { id: 'fully_linked', icon: 'Link', name: 'Fully Linked', unlocked: linkedMangaDex >= 10, hint: '10+ MangaDex links' }
  ]
}

function getEventWeight(event: StatisticsEvent): number {
  if (event.type === 'chapter_progress') return Math.max(1, event.amount ?? 0)
  return 1
}

function buildStreakInfo(activityByDay: Record<string, number>, now: number): {
  activeDays: number
  currentStreak: number
  bestStreak: number
  busiestDay: StatisticsOverview['busiestDay']
} {
  const entries = Object.entries(activityByDay).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) {
    return { activeDays: 0, currentStreak: 0, bestStreak: 0, busiestDay: null }
  }

  let bestStreak = 1
  let currentRun = 1
  let busiestDay: StatisticsOverview['busiestDay'] = null

  for (let index = 0; index < entries.length; index++) {
    const [dayKey, count] = entries[index]
    if (!busiestDay || count > busiestDay.count) busiestDay = { date: dayKey, count }

    if (index === 0) continue

    const previousDay = parseDayKey(entries[index - 1][0])
    const currentDay = parseDayKey(dayKey)
    if (currentDay - previousDay === 1) {
      currentRun += 1
      if (currentRun > bestStreak) bestStreak = currentRun
    } else {
      currentRun = 1
    }
  }

  const todayKey = getLocalDayKey(now)
  let currentStreak = 0
  let cursor = parseDayKey(todayKey)
  const activityDays = new Set(entries.map(([dayKey]) => parseDayKey(dayKey)))

  while (activityDays.has(cursor)) {
    currentStreak += 1
    cursor -= 1
  }

  return {
    activeDays: entries.length,
    currentStreak,
    bestStreak,
    busiestDay
  }
}

export function normalizeTagName(tag: string): string {
  const normalized = tag.trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  return normalized
    .split(' ')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ')
}

export function normalizeTagList(tags: string[] | null | undefined): string[] {
  const normalized: string[] = []
  const seen = new Set<string>()

  for (const rawTag of tags ?? []) {
    const tag = normalizeTagName(rawTag)
    if (!tag) continue

    const key = tag.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    normalized.push(tag)
  }

  return normalized
}

export function buildStoredTagMap(mangaList: Manga[]): Record<string, number> {
  const tagCounts: Record<string, number> = {}

  for (const manga of mangaList) {
    for (const tag of normalizeTagList(manga.tags)) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1
    }
  }

  return tagCounts
}

export function hasCompleteStoredTagCoverage(mangaList: Manga[]): boolean {
  const linkedManga = mangaList.filter((manga) => Boolean(manga.mangaDexId || manga.comickHid))
  return linkedManga.length > 0 && linkedManga.every((manga) => normalizeTagList(manga.tags).length > 0)
}

export function mergeTagMaps(...maps: Array<Record<string, number> | null | undefined>): Record<string, number> {
  const merged: Record<string, number> = {}
  for (const map of maps) {
    if (!map) continue
    for (const [rawTag, rawCount] of Object.entries(map)) {
      const tag = normalizeTagName(rawTag)
      const count = Number.isFinite(rawCount) ? rawCount : 0
      if (!tag || count <= 0) continue
      merged[tag] = (merged[tag] ?? 0) + count
    }
  }
  return merged
}

export function getStatisticsSourceKey(mangaList: Manga[]): string {
  return mangaList
    .flatMap((manga) => {
      const ids: string[] = []
      if (manga.mangaDexId) ids.push(`mdx:${manga.mangaDexId}`)
      if (manga.comickHid) ids.push(`ck:${manga.comickHid}`)
      return ids
    })
    .sort()
    .join('|')
}

export function shouldRefreshTagCache(
  mangaList: Manga[],
  tagCache: StatisticsTagCache | null | undefined,
  now = Date.now()
): boolean {
  const sourceKey = getStatisticsSourceKey(mangaList)
  if (!sourceKey) return false
  if (!tagCache) return true
  if (tagCache.sourceKey !== sourceKey) return true
  if (!tagCache.fetchedAt) return true
  return now - tagCache.fetchedAt >= STATISTICS_TAG_CACHE_TTL_MS
}

export function buildStatisticsEventId(
  type: StatisticsEvent['type'],
  mangaId: string,
  at: number,
  ...parts: Array<string | number | undefined>
): string {
  const suffix = parts
    .filter((part) => part !== undefined && part !== '')
    .map((part) => String(part))
    .join(':')
  return suffix ? `${type}:${mangaId}:${at}:${suffix}` : `${type}:${mangaId}:${at}`
}

export function createSyntheticChapterSeedEvent(manga: Manga | TrashedManga, at = Date.now()): StatisticsEvent | null {
  if ((manga.currentChapter ?? 0) <= 0) return null
  return {
    id: buildStatisticsEventId('chapter_progress', manga.id, at, 'seed'),
    type: 'chapter_progress',
    mangaId: manga.id,
    at,
    synthetic: true,
    amount: manga.currentChapter,
    fromChapter: 0,
    toChapter: manga.currentChapter
  }
}

export function buildCreateStatisticsEvents(manga: Manga, at: number): StatisticsEvent[] {
  const events: StatisticsEvent[] = [{
    id: buildStatisticsEventId('manga_added', manga.id, at),
    type: 'manga_added',
    mangaId: manga.id,
    at
  }]
  const seedEvent = createSyntheticChapterSeedEvent(manga, at)
  if (seedEvent) events.push(seedEvent)
  return events
}

export function buildRestoreStatisticsEvents(manga: Manga, at: number): StatisticsEvent[] {
  const events: StatisticsEvent[] = [{
    id: buildStatisticsEventId('manga_restored', manga.id, at),
    type: 'manga_restored',
    mangaId: manga.id,
    at
  }]
  const seedEvent = createSyntheticChapterSeedEvent(manga, at)
  if (seedEvent) events.push(seedEvent)
  return events
}

export function buildDeleteStatisticsEvents(manga: Manga, at: number): StatisticsEvent[] {
  return [{
    id: buildStatisticsEventId('manga_deleted', manga.id, at),
    type: 'manga_deleted',
    mangaId: manga.id,
    at
  }]
}

export function buildUpdateStatisticsEvents(before: Manga, after: Manga, at: number): StatisticsEvent[] {
  const events: StatisticsEvent[] = []

  if ((after.currentChapter ?? 0) > (before.currentChapter ?? 0)) {
    events.push({
      id: buildStatisticsEventId(
        'chapter_progress',
        after.id,
        at,
        before.currentChapter ?? 0,
        after.currentChapter ?? 0
      ),
      type: 'chapter_progress',
      mangaId: after.id,
      at,
      amount: (after.currentChapter ?? 0) - (before.currentChapter ?? 0),
      fromChapter: before.currentChapter ?? 0,
      toChapter: after.currentChapter ?? 0
    })
  }

  if (after.status !== before.status) {
    events.push({
      id: buildStatisticsEventId('status_changed', after.id, at, before.status, after.status),
      type: 'status_changed',
      mangaId: after.id,
      at,
      fromStatus: before.status,
      toStatus: after.status
    })
  }

  return events
}

export function hasChapterHistory(events: StatisticsEvent[], mangaId: string): boolean {
  return events.some((event) => event.mangaId === mangaId && event.type === 'chapter_progress')
}

export function appendStatisticsEvents(existing: StatisticsEvent[], incoming: StatisticsEvent[]): StatisticsEvent[] {
  if (incoming.length === 0) return existing

  const merged = new Map(existing.map((event) => [event.id, event]))
  for (const event of incoming) {
    if (!merged.has(event.id)) merged.set(event.id, event)
  }

  return Array.from(merged.values()).sort((left, right) => {
    if (left.at !== right.at) return left.at - right.at
    return left.id.localeCompare(right.id)
  })
}

export function buildStatisticsOverview(
  mangaList: Manga[],
  mangaTrash: TrashedManga[],
  events: StatisticsEvent[],
  tagCache: StatisticsTagCache | null | undefined,
  refreshing = false,
  now = Date.now()
): StatisticsOverview {
  const allManga: Array<Manga | TrashedManga> = [...mangaList, ...mangaTrash]
  const activeIds = new Set(mangaList.map((manga) => manga.id))
  const deletedIds = new Set<string>(mangaTrash.map((manga) => manga.id))
  const knownIds = new Set<string>(allManga.map((manga) => manga.id))
  const statusCounts: Record<MangaStatus, number> = {
    reading: 0,
    plan_to_read: 0,
    hiatus: 0,
    completed: 0,
    rereading: 0
  }

  let currentChapterTotal = 0
  let trackedChapterTotal = 0
  let unreadChapterTotal = 0
  let focusCount = 0
  let linkedMangaDex = 0
  let linkedComick = 0
  let firstTrackedAt: number | null = null
  let longestManga: StatisticsOverview['longestManga'] = {
    id: null,
    title: '-',
    chapters: 0
  }

  for (const manga of mangaList) {
    if (statusCounts[manga.status] !== undefined) statusCounts[manga.status] += 1
    currentChapterTotal += manga.currentChapter ?? 0
    trackedChapterTotal += manga.lastCheckedChapter ?? 0
    unreadChapterTotal += Math.max(0, (manga.lastCheckedChapter ?? 0) - (manga.currentChapter ?? 0))
    if (manga.isFocused) focusCount += 1
    if (manga.mangaDexId) linkedMangaDex += 1
    if (manga.comickHid) linkedComick += 1
  }

  for (const manga of allManga) {
    if (!firstTrackedAt || manga.createdAt < firstTrackedAt) firstTrackedAt = manga.createdAt
    if ((manga.currentChapter ?? 0) > longestManga.chapters) {
      longestManga = {
        id: manga.id,
        title: manga.title,
        chapters: manga.currentChapter ?? 0
      }
    }
  }

  for (const event of events) {
    knownIds.add(event.mangaId)
    if (event.type === 'manga_deleted') deletedIds.add(event.mangaId)
    if (event.type === 'manga_restored' || event.type === 'manga_added') deletedIds.delete(event.mangaId)
  }

  for (const activeId of activeIds) deletedIds.delete(activeId)

  const averagePerManga = mangaList.length > 0 ? Math.round(currentChapterTotal / mangaList.length) : 0

  const nonSyntheticEvents = events.filter((event) => !event.synthetic)
  const activityByDay: Record<string, number> = {}
  const activityByMonth: Record<string, number> = {}

  for (const event of nonSyntheticEvents) {
    const weight = getEventWeight(event)
    const dayKey = getLocalDayKey(event.at)
    const monthKey = getLocalMonthKey(event.at)
    activityByDay[dayKey] = (activityByDay[dayKey] ?? 0) + weight
    activityByMonth[monthKey] = (activityByMonth[monthKey] ?? 0) + weight
  }

  const { activeDays, currentStreak, bestStreak, busiestDay } = buildStreakInfo(activityByDay, now)

  const storedTagMap = buildStoredTagMap(mangaList)
  const unlinkedStoredTagMap = buildStoredTagMap(
    mangaList.filter((manga) => !manga.mangaDexId && !manga.comickHid)
  )
  const cachedTagMap = mergeTagMaps(tagCache?.tags ?? {})
  const tagMap = hasCompleteStoredTagCoverage(mangaList) || Object.keys(cachedTagMap).length === 0
    ? storedTagMap
    : mergeTagMaps(cachedTagMap, unlinkedStoredTagMap)
  const sortedTags = Object.entries(tagMap).sort((left, right) => right[1] - left[1])
  const favoriteTag: StatisticsFavoriteTag | null = sortedTags[0]
    ? { name: sortedTags[0][0], count: sortedTags[0][1] }
    : null

  const chapterProgressFromEvents = events
    .filter((event) => event.type === 'chapter_progress')
    .reduce((total, event) => total + Math.max(0, event.amount ?? 0), 0)

  const snapshotAllTimeChapterTotal = allManga.reduce(
    (total, manga) => total + Math.max(0, manga.currentChapter ?? 0),
    0
  )
  const allTimeChapterTotal = Math.max(snapshotAllTimeChapterTotal, chapterProgressFromEvents)
  const { level, xpCurrent, xpRequired, percent } = getLevelProgress(allTimeChapterTotal)
  const jobClass = getJobClass(tagMap)
  const secondaryClass = getSecondaryClass(mangaList, averagePerManga, sortedTags.length)

  const stats = {
    pwr: statScore(mangaList.length, 200),
    spd: statScore(averagePerManga, 200),
    wis: statScore(sortedTags.length, 15),
    stm: statScore(allTimeChapterTotal, 10000),
    end: statScore(statusCounts.completed, 50),
    arc: statScore(firstTrackedAt ? Math.floor((now - firstTrackedAt) / DAY_MS) : 0, 1095)
  }

  const achievements = buildAchievements({
    totalActive: mangaList.length,
    totalChaptersRead: allTimeChapterTotal,
    uniqueTags: sortedTags.length,
    byStatus: statusCounts,
    focused: focusCount,
    linkedMangaDex,
    level,
    firstTrackedAt
  })

  const sourceKey = getStatisticsSourceKey(mangaList)
  const tagFetchedAt = tagCache?.fetchedAt ?? 0
  const tagCacheAge = tagFetchedAt > 0 ? Math.floor((now - tagFetchedAt) / 60_000) : null

  return {
    generatedAt: now,
    historyEventCount: events.length,
    counts: {
      current: mangaList.length,
      deleted: Math.max(mangaTrash.length, deletedIds.size),
      allTime: Math.max(mangaList.length + mangaTrash.length, knownIds.size)
    },
    chapters: {
      current: currentChapterTotal,
      allTime: allTimeChapterTotal,
      tracked: trackedChapterTotal,
      unread: unreadChapterTotal,
      averagePerManga
    },
    linked: {
      mangaDex: linkedMangaDex,
      comick: linkedComick
    },
    focusCount,
    statusCounts,
    firstTrackedAt,
    longestManga,
    activityByDay,
    activityByMonth,
    activeDays,
    currentStreak,
    bestStreak,
    busiestDay,
    tags: tagMap,
    favoriteTag,
    uniqueTags: sortedTags.length,
    level,
    xpCurrent,
    xpRequired,
    xpPercent: percent,
    jobClass: jobClass.name,
    jobIcon: jobClass.icon,
    secondaryClass,
    stats,
    achievements,
    tagCache: {
      fetchedAt: tagFetchedAt || null,
      ageMinutes: tagCacheAge,
      stale: shouldRefreshTagCache(mangaList, tagCache, now),
      refreshing,
      sourceKey,
      sourceCount: sourceKey ? sourceKey.split('|').length : 0
    }
  }
}
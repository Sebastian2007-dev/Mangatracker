import { ipcMain } from 'electron'
import {
  debugResetAchievements,
  debugResetStats,
  debugSetChapters,
  getStatisticsOverview,
  rebuildStatistics,
  refreshStatisticsTags
} from '../stats.service'

function registerHandler(
  channel: string,
  listener: Parameters<typeof ipcMain.handle>[1]
): void {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, listener)
}

export function registerStatsIpc(): void {
  registerHandler('stats:getOverview', async () => {
    try {
      return { success: true, data: await getStatisticsOverview() }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  registerHandler('stats:refreshTags', async () => {
    try {
      await refreshStatisticsTags()
      return { success: true, data: await getStatisticsOverview() }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  registerHandler('stats:refreshGenres', async () => {
    try {
      await refreshStatisticsTags()
      return { success: true, data: await getStatisticsOverview() }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  // 'manga:refreshMetadata' wird in manga.ipc.ts registriert (Domain-Zugehörigkeit)

  registerHandler('stats:rebuild', async () => {
    try {
      rebuildStatistics()
      return { success: true, data: await getStatisticsOverview() }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })

  registerHandler('stats:debug:reset', () => {
    debugResetStats()
    return { success: true }
  })

  registerHandler('stats:debug:resetAchievements', () => {
    debugResetAchievements()
    return { success: true }
  })

  registerHandler('stats:debug:setChapters', (_e, payload: unknown) => {
    const { chapters } = payload as { chapters: number }
    debugSetChapters(chapters)
    return { success: true }
  })
}
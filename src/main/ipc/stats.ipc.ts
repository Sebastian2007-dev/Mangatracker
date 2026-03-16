import { ipcMain } from 'electron'
import { getStatisticsOverview, refreshLibraryMetadata, refreshStatisticsTags } from '../stats.service'

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

  registerHandler('manga:refreshMetadata', async () => {
    try {
      return { success: true, data: await refreshLibraryMetadata() }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
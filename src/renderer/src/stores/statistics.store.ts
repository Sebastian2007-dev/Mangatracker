import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StatisticsOverview } from '../types/index'
import { getBridge } from '../services/platform'

export const useStatisticsStore = defineStore('statistics', () => {
  const api = getBridge()
  const overview = ref<StatisticsOverview | null>(null)
  const loading = ref(false)
  const refreshingTags = ref(false)
  const error = ref('')
  let activeRequest = 0

  async function fetchOverview(): Promise<void> {
    activeRequest += 1
    const requestId = activeRequest
    loading.value = true

    const result = await api.invoke<{ success: boolean; data?: StatisticsOverview; error?: string }>('stats:getOverview')
    if (requestId !== activeRequest) return

    loading.value = false
    if (!result.success || !result.data) {
      error.value = result.error ?? 'Failed to load statistics'
      return
    }

    overview.value = result.data
    refreshingTags.value = result.data.tagCache.refreshing
    error.value = ''
  }

  async function refreshTags(): Promise<void> {
    refreshingTags.value = true
    const result = await api.invoke<{ success: boolean; data?: StatisticsOverview; error?: string }>('stats:refreshTags')

    if (!result.success || !result.data) {
      refreshingTags.value = false
      error.value = result.error ?? 'Failed to refresh tags'
      return
    }

    overview.value = result.data
    refreshingTags.value = result.data.tagCache.refreshing
    error.value = ''
  }

  function setupListeners(): () => void {
    return api.on('stats:updated', () => {
      void fetchOverview()
    })
  }

  return {
    overview,
    loading,
    refreshingTags,
    error,
    fetchOverview,
    refreshTags,
    setupListeners
  }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { LogEntry } from '../../../types/index'

export const useLogStore = defineStore('log', () => {
  const entries = ref<LogEntry[]>([])
  const unreadCount = ref(0)

  function addEntry(entry: LogEntry): void {
    entries.value.unshift(entry)
    if (entries.value.length > 500) entries.value = entries.value.slice(0, 500)
    if (entry.type === 'warning' || entry.type === 'error' || entry.type === 'success') {
      unreadCount.value++
    }
  }

  function markAllRead(): void {
    unreadCount.value = 0
  }

  function clear(): void {
    entries.value = []
    unreadCount.value = 0
  }

  return { entries, unreadCount, addEntry, markAllRead, clear }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Manga, MangaStatus } from '../types/index'
import { getBridge } from '../services/platform'

export const useMangaStore = defineStore('manga', () => {
  const api = getBridge()
  const items = ref<Manga[]>([])
  const recentlyDeleted = ref<Manga | null>(null)
  const focusFullVisible = ref(false)
  const lastMutationAt = ref<number>(0)
  let undoTimerId: ReturnType<typeof setTimeout> | null = null
  let focusFullTimerId: ReturnType<typeof setTimeout> | null = null

  async function fetchAll(): Promise<void> {
    const result = await api.invoke<{ success: boolean; data: Manga[] }>('manga:getAll')
    if (result.success && result.data) {
      items.value = result.data
    }
  }

  async function create(payload: Omit<Manga, 'id' | 'createdAt' | 'updatedAt'>): Promise<Manga | null> {
    const result = await api.invoke<{ success: boolean; data: Manga }>('manga:create', payload)
    if (result.success && result.data) {
      items.value.push(result.data)
      lastMutationAt.value = Date.now()
      return result.data
    }
    return null
  }

  async function update(id: string, updates: Partial<Manga>): Promise<void> {
    const result = await api.invoke<{ success: boolean; data: Manga }>('manga:update', { id, ...updates })
    if (result.success && result.data) {
      const idx = items.value.findIndex((m) => m.id === id)
      if (idx !== -1) items.value[idx] = result.data
      lastMutationAt.value = Date.now()
    }
  }

  async function remove(id: string): Promise<void> {
    const manga = items.value.find((m) => m.id === id)
    if (!manga) return

    await api.invoke('manga:delete', { id })
    items.value = items.value.filter((m) => m.id !== id)
    lastMutationAt.value = Date.now()

    // Undo window
    recentlyDeleted.value = manga
    if (undoTimerId !== null) clearTimeout(undoTimerId)
    undoTimerId = setTimeout(async () => {
      await api.invoke('manga:emptyTrash', { id: manga.id })
      recentlyDeleted.value = null
      undoTimerId = null
    }, 10_000)
  }

  async function undoDelete(): Promise<void> {
    if (!recentlyDeleted.value) return
    const manga = recentlyDeleted.value

    if (undoTimerId !== null) {
      clearTimeout(undoTimerId)
      undoTimerId = null
    }

    const result = await api.invoke<{ success: boolean; data: Manga }>('manga:createWithId', manga)
    if (result.success) {
      items.value.push(manga)
    }
    recentlyDeleted.value = null
  }

  function clearUndo(): void {
    recentlyDeleted.value = null
    if (undoTimerId !== null) {
      clearTimeout(undoTimerId)
      undoTimerId = null
    }
  }

  function setupListeners(): () => void {
    const cleanup1 = api.on('notifications:newChapter', (data: any) => {
      const idx = items.value.findIndex((m) => m.id === data.mangaId)
      if (idx !== -1) {
        items.value[idx] = { ...items.value[idx], hasNewChapter: true }
      }
    })
    const cleanup2 = api.on('manga:templateFixed', () => {
      fetchAll()
    })
    return () => {
      cleanup1()
      cleanup2()
    }
  }

  async function setChapter(id: string, chapter: number): Promise<void> {
    await update(id, { currentChapter: chapter, hasNewChapter: false })
  }

  async function setStatus(id: string, status: MangaStatus): Promise<void> {
    await update(id, { status })
  }

  async function clearNewChapter(id: string): Promise<void> {
    await update(id, { hasNewChapter: false })
  }

  async function toggleFocus(id: string): Promise<void> {
    const manga = items.value.find((m) => m.id === id)
    if (!manga) return

    if (manga.isFocused) {
      await update(id, { isFocused: false })
    } else {
      const focusCount = items.value.filter((m) => m.isFocused).length
      if (focusCount >= 3) {
        focusFullVisible.value = true
        if (focusFullTimerId !== null) clearTimeout(focusFullTimerId)
        focusFullTimerId = setTimeout(() => {
          focusFullVisible.value = false
          focusFullTimerId = null
        }, 3_000)
        return
      }
      await update(id, { isFocused: true })
    }
  }

  async function scanNow(): Promise<Manga[]> {
    const alreadyFlagged = new Set(items.value.filter((m) => m.hasNewChapter).map((m) => m.id))
    await api.invoke('manga:scanNow')
    await fetchAll()
    return items.value.filter((m) => m.hasNewChapter && !alreadyFlagged.has(m.id))
  }

  async function reorder(fromId: string, toId: string): Promise<void> {
    const fromIdx = items.value.findIndex((m) => m.id === fromId)
    if (fromIdx === -1) return
    const newItems = [...items.value]
    const [item] = newItems.splice(fromIdx, 1)
    const toIdx = newItems.findIndex((m) => m.id === toId)
    newItems.splice(toIdx === -1 ? newItems.length : toIdx, 0, item)
    items.value = newItems
    await api.invoke('manga:moveItem', { fromId, toId })
  }

  function detectDuplicates(list?: Manga[]): Array<[Manga, Manga]> {
    const source = list ?? items.value
    const norm = (url: string) => url.toLowerCase().replace(/\/+$/, '').trim()
    const pairs: Array<[Manga, Manga]> = []
    for (let i = 0; i < source.length; i++) {
      for (let j = i + 1; j < source.length; j++) {
        const a = source[i], b = source[j]
        const match =
          norm(a.mainUrl) === norm(b.mainUrl) ||
          a.title.toLowerCase().trim() === b.title.toLowerCase().trim() ||
          (!!a.mangaDexId && a.mangaDexId === b.mangaDexId) ||
          (!!a.comickHid && a.comickHid === b.comickHid)
        if (match) pairs.push([a, b])
      }
    }
    return pairs
  }

  return {
    items,
    recentlyDeleted,
    focusFullVisible,
    lastMutationAt,
    fetchAll,
    create,
    update,
    remove,
    undoDelete,
    clearUndo,
    setupListeners,
    setChapter,
    setStatus,
    clearNewChapter,
    toggleFocus,
    reorder,
    scanNow,
    detectDuplicates
  }
})

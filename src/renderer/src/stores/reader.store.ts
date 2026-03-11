import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { DomainGuardRequest } from '../types/index'
import { useMangaStore } from './manga.store'
import { getBridge } from '../services/platform'

export const useReaderStore = defineStore('reader', () => {
  const api = getBridge()
  const isOpen = ref(false)
  const currentUrl = ref('')
  const canGoBack = ref(false)
  const canGoForward = ref(false)
  const isLoading = ref(false)
  const pendingDomainGuard = ref<DomainGuardRequest | null>(null)
  const currentMangaId = ref<string | null>(null)

  function setupListeners(): () => void {
    const cleanupUrl = api.on('reader:urlChanged', (data: any) => {
      currentUrl.value = data.url
      canGoBack.value = data.canGoBack
      canGoForward.value = data.canGoForward
    })

    const cleanupLoading = api.on('reader:loadingChanged', (data: any) => {
      isLoading.value = data.loading
    })

    const cleanupDomain = api.on('reader:domainGuardRequest', (data: any) => {
      pendingDomainGuard.value = data
    })

    const cleanupChapter = api.on('reader:chapterDetected', (data: any) => {
      const mangaStore = useMangaStore()
      mangaStore.setChapter(data.mangaId, data.chapter)
    })

    return () => {
      cleanupUrl()
      cleanupLoading()
      cleanupDomain()
      cleanupChapter()
    }
  }

  async function open(mangaId: string, url: string): Promise<void> {
    currentMangaId.value = mangaId
    currentUrl.value = url
    const result = await api.invoke<{ success: boolean; separateWindow: boolean }>('reader:open', { mangaId, url })
    if (!result?.separateWindow) {
      isOpen.value = true
    }
  }

  async function close(): Promise<void> {
    await api.invoke('reader:close')
    isOpen.value = false
    currentUrl.value = ''
    currentMangaId.value = null
    canGoBack.value = false
    canGoForward.value = false
  }

  async function goBack(): Promise<void> {
    await api.invoke('reader:goBack')
  }

  async function goForward(): Promise<void> {
    await api.invoke('reader:goForward')
  }

  async function reload(): Promise<void> {
    await api.invoke('reader:reload')
  }

  async function navigate(url: string): Promise<void> {
    await api.invoke('reader:navigate', { url })
  }

  async function respondToDomainGuard(requestId: string, choice: string): Promise<void> {
    pendingDomainGuard.value = null
    await api.invoke('reader:domainGuardReply', { requestId, choice })
  }

  return {
    isOpen, currentUrl, canGoBack, canGoForward, isLoading,
    pendingDomainGuard, currentMangaId,
    setupListeners, open, close, goBack, goForward, reload, navigate, respondToDomainGuard
  }
})

<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted } from 'vue'
import { RouterView } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppSidebar from './components/layout/AppSidebar.vue'
import MobileTabBar from './components/layout/MobileTabBar.vue'
import AppHeader from './components/layout/AppHeader.vue'
import ReaderView from './views/ReaderView.vue'
import DeleteUndoToast from './components/manga/DeleteUndoToast.vue'
import { useMangaStore } from './stores/manga.store'
import { useSettingsStore } from './stores/settings.store'
import { useLogStore } from './stores/log.store'
import { useTheme } from './composables/useTheme'
import type { LogEntry } from '../../types/index'
import { getBridge } from './services/platform'
import { isMobile } from './composables/usePlatform'

const { t, locale } = useI18n()
const mangaStore = useMangaStore()
const settingsStore = useSettingsStore()
const logStore = useLogStore()

const searchQuery = ref('')
provide('searchQuery', searchQuery)

let cleanupMangaListeners: (() => void) | null = null
let cleanupLogListener: (() => void) | null = null
let cleanupSettingsListener: (() => void) | null = null

onMounted(async () => {
  cleanupSettingsListener = settingsStore.setupListeners()
  await settingsStore.load()
  locale.value = settingsStore.language
  await mangaStore.fetchAll()
  cleanupMangaListeners = mangaStore.setupListeners()
  cleanupLogListener = getBridge().on('logs:entry', (entry) => {
    logStore.addEntry(entry as LogEntry)
  })
})

onUnmounted(() => {
  cleanupMangaListeners?.()
  cleanupLogListener?.()
  cleanupSettingsListener?.()
})

useTheme()
</script>

<template>
  <div class="app-shell" :class="{ 'mobile-layout': isMobile }">
    <AppSidebar v-if="!isMobile" />
    <div class="main-area">
      <AppHeader v-model:searchQuery="searchQuery" />
      <div class="view-area">
        <RouterView />
      </div>
      <MobileTabBar v-if="isMobile" />
    </div>
    <ReaderView v-if="!isMobile" />
    <DeleteUndoToast />
    <Transition name="slide-up">
      <div v-if="mangaStore.focusFullVisible" class="focus-full-toast">
        {{ t('manga.focusFull') }}
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
.main-area {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.view-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}
.focus-full-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: hsl(var(--foreground));
  color: hsl(var(--background));
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  z-index: 200;
  pointer-events: none;
  white-space: nowrap;
}
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s, transform 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
</style>

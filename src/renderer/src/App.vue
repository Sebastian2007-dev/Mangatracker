<script setup lang="ts">
import { ref, provide, onMounted, onUnmounted, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import AppSidebar from './components/layout/AppSidebar.vue'
import MobileTabBar from './components/layout/MobileTabBar.vue'
import AppHeader from './components/layout/AppHeader.vue'
import ReaderView from './views/ReaderView.vue'
import DeleteUndoToast from './components/manga/DeleteUndoToast.vue'
import AchievementToast from './components/AchievementToast.vue'
import LevelUpOverlay from './components/LevelUpOverlay.vue'
import TemplateMismatchModal from './components/manga/TemplateMismatchModal.vue'
import DuplicatesModal from './components/manga/DuplicatesModal.vue'
import { useMangaStore } from './stores/manga.store'
import { useSettingsStore } from './stores/settings.store'
import { useLogStore } from './stores/log.store'
import { useStatisticsStore } from './stores/statistics.store'
import { useTheme } from './composables/useTheme'
import type { LogEntry, Manga } from '../../types/index'
import { getBridge } from './services/platform'
import { isMobile } from './composables/usePlatform'
import { getReadingSession, clearReadingSession, type ReadingSession } from './composables/useReadingSession'

const { t, locale } = useI18n()
const route = useRoute()
const mangaStore = useMangaStore()
const settingsStore = useSettingsStore()
const logStore = useLogStore()
const statisticsStore = useStatisticsStore()

const searchQuery = ref('')
provide('searchQuery', searchQuery)

// Duplicates modal
const syncDuplicates = ref<Array<[Manga, Manga]>>([])

// Template mismatch modal
type TemplateMismatchData = {
  mangaId: string
  mangaTitle: string
  oldTemplate: string
  suggestedTemplate: string
  currentUrl: string
  confidence: number
  updateDetectionTemplate?: boolean
}
const templateMismatch = ref<TemplateMismatchData | null>(null)

async function onTemplateMismatchConfirm(newTemplate: string): Promise<void> {
  if (!templateMismatch.value) return
  if (templateMismatch.value.updateDetectionTemplate) {
    await mangaStore.update(templateMismatch.value.mangaId, { chapterDetectionTemplate: newTemplate })
  } else {
    await mangaStore.update(templateMismatch.value.mangaId, { chapterUrlTemplate: newTemplate })
  }
  templateMismatch.value = null
}

async function onTemplateMismatchIgnore(keepDetection: boolean): Promise<void> {
  if (!templateMismatch.value) return
  if (templateMismatch.value.updateDetectionTemplate) {
    // Detection-Template veraltet: "Nicht mehr anzeigen" → neue URL übernehmen wenn gewünscht
    if (keepDetection) {
      await mangaStore.update(templateMismatch.value.mangaId, {
        chapterDetectionTemplate: templateMismatch.value.suggestedTemplate
      })
    }
  } else {
    await mangaStore.update(templateMismatch.value.mangaId, {
      ignoreTemplateMismatch: true,
      ...(keepDetection ? { chapterDetectionTemplate: templateMismatch.value.suggestedTemplate } : {})
    })
  }
  templateMismatch.value = null
}

// Reading session recovery
const recoverySession = ref<ReadingSession | null>(null)
const recoveryChapter = ref(0)
const showRecovery = ref(false)

async function confirmRecovery(): Promise<void> {
  const session = recoverySession.value
  showRecovery.value = false
  recoverySession.value = null
  await clearReadingSession()
  if (session && recoveryChapter.value > 0) {
    const manga = mangaStore.items.find((m) => m.id === session.mangaId)
    if (manga && recoveryChapter.value > manga.currentChapter) {
      await mangaStore.setChapter(session.mangaId, recoveryChapter.value)
    }
  }
}

async function skipRecovery(): Promise<void> {
  showRecovery.value = false
  recoverySession.value = null
  await clearReadingSession()
}

let cleanupMangaListeners: (() => void) | null = null
let cleanupLogListener: (() => void) | null = null
let cleanupSettingsListener: (() => void) | null = null
let cleanupStatisticsListener: (() => void) | null = null
let mutationSyncTimer: ReturnType<typeof setTimeout> | null = null
let syncInProgress = false

function scheduleMutationSync(): void {
  if (!settingsStore.gistSyncEnabled || !settingsStore.githubToken) return
  if (mutationSyncTimer !== null) clearTimeout(mutationSyncTimer)
  mutationSyncTimer = setTimeout(async () => {
    mutationSyncTimer = null
    if (syncInProgress) return
    syncInProgress = true
    try {
      await settingsStore.syncGist()
    } catch { /* Sync-Fehler ignorieren */ } finally {
      syncInProgress = false
    }
  }, 3000)
}

onMounted(async () => {
  cleanupSettingsListener = settingsStore.setupListeners()
  await settingsStore.load()
  locale.value = settingsStore.language
  await mangaStore.fetchAll()
  cleanupMangaListeners = mangaStore.setupListeners()
  cleanupStatisticsListener = statisticsStore.setupListeners()
  cleanupLogListener = getBridge().on('logs:entry', (entry) => {
    logStore.addEntry(entry as LogEntry)
  })

  // Sync nach Mutations (create / update / remove) — debounced 3s
  watch(() => mangaStore.lastMutationAt, scheduleMutationSync)

  getBridge().on('reader:templateMismatch', (data: any) => {
    templateMismatch.value = data as TemplateMismatchData
  })

  // Auto-Sync mit GitHub Gist falls aktiviert
  if (settingsStore.gistSyncEnabled && settingsStore.gistAutoSync && settingsStore.githubToken) {
    settingsStore.syncGist().then(async (result) => {
      if (result.success) {
        await mangaStore.fetchAll()
        const dupes = mangaStore.detectDuplicates()
        if (dupes.length > 0) syncDuplicates.value = dupes
      }
    }).catch(() => { /* Sync-Fehler beim Start ignorieren */ })
  }

  if (isMobile) {
    const session = await getReadingSession()
    if (session) {
      const manga = mangaStore.items.find((m) => m.id === session.mangaId)
      if (manga) {
        recoverySession.value = session
        recoveryChapter.value = session.chapter
        showRecovery.value = true
      } else {
        await clearReadingSession()
      }
    }
  }
})

onUnmounted(() => {
  cleanupMangaListeners?.()
  cleanupLogListener?.()
  cleanupSettingsListener?.()
  cleanupStatisticsListener?.()
  if (mutationSyncTimer !== null) clearTimeout(mutationSyncTimer)
})

useTheme()
</script>

<template>
  <div class="app-shell" :class="{ 'mobile-layout': isMobile }">
    <AppSidebar v-if="!isMobile" />
    <div class="main-area">
      <AppHeader v-model:searchQuery="searchQuery" />
      <div class="view-area">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.path" />
          </Transition>
        </RouterView>
      </div>
      <MobileTabBar v-if="isMobile" />
    </div>
    <ReaderView v-if="!isMobile" />
    <DeleteUndoToast />
    <AchievementToast />
    <LevelUpOverlay />

    <DuplicatesModal
      v-if="syncDuplicates.length > 0"
      :pairs="syncDuplicates"
      @close="syncDuplicates = []"
    />

    <TemplateMismatchModal
      v-if="templateMismatch"
      :manga-title="templateMismatch.mangaTitle"
      :old-template="templateMismatch.oldTemplate"
      :suggested-template="templateMismatch.suggestedTemplate"
      :current-url="templateMismatch.currentUrl"
      :confidence="templateMismatch.confidence"
      @confirm="onTemplateMismatchConfirm"
      @ignore="onTemplateMismatchIgnore"
      @dismiss="templateMismatch = null"
    />

    <!-- Reading session recovery modal (mobile only) -->
    <Teleport to="body">
      <div v-if="showRecovery" class="recovery-backdrop">
        <div class="recovery-box">
          <p class="recovery-title">{{ t('manga.recoveryTitle') }}</p>
          <p class="recovery-hint">{{ t('manga.recoveryHint') }}</p>
          <p class="recovery-manga-title">{{ recoverySession?.title }}</p>
          <div class="recovery-chapter-row">
            <button class="chapter-adj-btn" @click="recoveryChapter = Math.max(1, recoveryChapter - 1)">−</button>
            <span class="recovery-chapter-val">{{ recoveryChapter }}</span>
            <button class="chapter-adj-btn" @click="recoveryChapter++">+</button>
          </div>
          <button class="recovery-btn-primary" @click="confirmRecovery">{{ t('manga.save') }}</button>
          <button class="recovery-btn-ghost" @click="skipRecovery">{{ t('manga.recoverySkip') }}</button>
        </div>
      </div>
    </Teleport>

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
  height: 100%;
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
  height: 0; /* Trick: macht height:100% in Kindern auflösbar (flex-item-Höhe) */
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
  max-width: calc(100vw - 32px);
  text-align: center;
}
.slide-up-enter-active, .slide-up-leave-active { transition: opacity 0.2s, transform 0.2s; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateX(-50%) translateY(8px); }
.page-enter-active { transition: opacity 0.14s ease; }
.page-leave-active { transition: opacity 0.1s ease; }
.page-enter-from, .page-leave-to { opacity: 0; }
.recovery-backdrop {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}
.recovery-box {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  padding: 22px 20px;
  width: min(300px, 92vw);
  display: flex;
  flex-direction: column;
  gap: 0;
}
.recovery-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
  margin-bottom: 6px;
}
.recovery-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 12px;
  line-height: 1.5;
}
.recovery-manga-title {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  margin-bottom: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recovery-chapter-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}
.recovery-chapter-val {
  font-size: 20px;
  font-weight: 600;
  color: hsl(var(--foreground));
  min-width: 52px;
  text-align: center;
}
.chapter-adj-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  font-size: 20px;
  font-weight: 500;
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chapter-adj-btn:active { background: hsl(var(--accent)); }
.recovery-btn-primary {
  width: 100%;
  padding: 9px 12px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
  margin-bottom: 8px;
}
.recovery-btn-ghost {
  width: 100%;
  padding: 9px 12px;
  border-radius: 7px;
  font-size: 13px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  border: none;
  cursor: pointer;
}
</style>

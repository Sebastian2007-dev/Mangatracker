<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BookOpen, Pencil, Trash2, Star } from 'lucide-vue-next'
import type { Manga } from '../../types/index'
import ChapterInput from './ChapterInput.vue'
import NewChapterBadge from './NewChapterBadge.vue'
import { useMangaStore } from '../../stores/manga.store'
import { useReaderStore } from '../../stores/reader.store'
import { useSettingsStore } from '../../stores/settings.store'
import { buildChapterUrl } from '../../composables/useChapterUrl'
import { isMobile } from '../../composables/usePlatform'
import { Browser } from '@capacitor/browser'

const props = defineProps<{ manga: Manga }>()
const emit = defineEmits<{ edit: [manga: Manga] }>()

const { t } = useI18n()
const mangaStore = useMangaStore()
const readerStore = useReaderStore()
const settingsStore = useSettingsStore()

async function onChapterChange(chapter: number): Promise<void> {
  await mangaStore.setChapter(props.manga.id, chapter)
}

async function openUrl(url: string, trackFromChapter?: number): Promise<void> {
  if (isMobile) {
    await Browser.open({ url, presentationStyle: 'fullscreen' })
    if (trackFromChapter !== undefined) {
      const listener = await Browser.addListener('browserFinished', async () => {
        await listener.remove()
        // Dialog anzeigen: bis zu welchem Kapitel hast du gelesen?
        markReadChapter.value = trackFromChapter
        showMarkReadDialog.value = true
      })
    }
  } else {
    await readerStore.open(props.manga.id, url)
  }
}

/** Gibt das Kapitel zurück das geöffnet werden soll — neues Kapitel falls verfügbar. */
function chapterToRead(): number {
  return props.manga.hasNewChapter && props.manga.lastCheckedChapter > props.manga.currentChapter
    ? props.manga.lastCheckedChapter
    : props.manga.currentChapter
}

async function onRead(): Promise<void> {
  const behavior = settingsStore.readBehavior
  const chapter = chapterToRead()
  if (behavior === 'main') {
    await openUrl(props.manga.mainUrl)
  } else if (behavior === 'chapter') {
    const url = buildChapterUrl(props.manga.chapterUrlTemplate, chapter)
    await openUrl(url, chapter)
  } else {
    // ask — show inline dialog
    const url = buildChapterUrl(props.manga.chapterUrlTemplate, chapter)
    showReadChoiceDialog.value = true
    pendingChapterUrl.value = url
    pendingChapter.value = chapter
  }
}

import { ref, watch } from 'vue'
import type { MangaStatus } from '../../types/index'
const showReadChoiceDialog = ref(false)
const pendingChapterUrl = ref('')
const pendingChapter = ref(0)

// Nach-dem-Lesen-Dialog (Mobile)
const titleExpanded = ref(false)
const showMarkReadDialog = ref(false)
const markReadChapter = ref(0)

async function confirmMarkRead(): Promise<void> {
  showMarkReadDialog.value = false
  if (markReadChapter.value > props.manga.currentChapter) {
    await mangaStore.setChapter(props.manga.id, markReadChapter.value)
  }
}

// Status quick-change
const showStatusPicker = ref(false)
let backdropDown = false
const statusBadgeRef = ref<HTMLElement | null>(null)
const pickerStyle = ref<Record<string, string>>({})

const statuses: { value: MangaStatus; label: string }[] = [
  { value: 'reading', label: 'tabs.reading' },
  { value: 'plan_to_read', label: 'tabs.plan_to_read' },
  { value: 'hiatus', label: 'tabs.hiatus' },
  { value: 'completed', label: 'tabs.completed' },
  { value: 'rereading', label: 'tabs.rereading' }
]

function toggleStatusPicker(): void {
  if (!showStatusPicker.value && statusBadgeRef.value) {
    const rect = statusBadgeRef.value.getBoundingClientRect()
    pickerStyle.value = {
      position: 'fixed',
      bottom: `${window.innerHeight - rect.top + 4}px`,
      left: `${rect.left}px`,
      zIndex: '9999'
    }
  }
  showStatusPicker.value = !showStatusPicker.value
}

async function changeStatus(s: MangaStatus): Promise<void> {
  showStatusPicker.value = false
  await mangaStore.setStatus(props.manga.id, s)
}

function handleOutsideClick(e: MouseEvent): void {
  const t = e.target as Element
  if (!t.closest('.status-badge-btn') && !t.closest('.status-picker-floating')) {
    showStatusPicker.value = false
  }
}

watch(showStatusPicker, (v) => {
  if (v) document.addEventListener('click', handleOutsideClick)
  else document.removeEventListener('click', handleOutsideClick)
})

async function openMain(): Promise<void> {
  showReadChoiceDialog.value = false
  await openUrl(props.manga.mainUrl)
}

async function openChapter(): Promise<void> {
  showReadChoiceDialog.value = false
  if (pendingChapter.value > props.manga.currentChapter) {
    await mangaStore.setChapter(props.manga.id, pendingChapter.value)
  }
  await openUrl(pendingChapterUrl.value)
}
</script>

<template>
  <div
    class="manga-card"
    :class="{ 'has-new': manga.hasNewChapter }"
  >
    <!-- Card inner: two-column when cover present -->
    <div class="card-inner" :class="{ 'has-cover': manga.mangaDexCoverUrl || manga.comickCoverUrl }">
      <!-- Cover panel (left column) -->
      <div v-if="manga.mangaDexCoverUrl || manga.comickCoverUrl" class="cover-panel">
        <img :src="manga.mangaDexCoverUrl || manga.comickCoverUrl" :alt="manga.title" loading="lazy" />
      </div>

      <!-- Content column -->
      <div class="card-content">
        <!-- Title row -->
        <div class="flex items-start justify-between gap-1 mb-0.5">
          <p
            class="text-sm font-semibold card-title"
            :class="{ 'title-expand-enabled': settingsStore.titleExpand, expanded: titleExpanded && settingsStore.titleExpand }"
            style="color: hsl(var(--foreground))"
            @click.stop="settingsStore.titleExpand && (titleExpanded = !titleExpanded)"
          >{{ manga.title }}</p>
          <NewChapterBadge v-if="manga.hasNewChapter" />
        </div>
        <div class="flex items-center gap-1.5 mb-2">
          <span class="text-xs" style="color: hsl(var(--muted-foreground))">Kap. </span>
          <ChapterInput :model-value="manga.currentChapter" @update:model-value="onChapterChange" />
        </div>

        <!-- Status badge -->
        <div class="status-wrapper mb-2">
          <button ref="statusBadgeRef" class="status-badge status-badge-btn" @click.stop="toggleStatusPicker">
            {{ t('tabs.' + manga.status) }}
          </button>
        </div>

        <!-- Action buttons -->
        <div class="flex items-center gap-1 mt-auto">
          <button class="card-btn primary" :title="t('manga.read')" @click="onRead">
            <BookOpen :size="14" />
          </button>
          <button class="card-btn" :title="t('manga.info')" @click="emit('edit', manga)">
            <Pencil :size="14" />
          </button>
          <button
            class="card-btn"
            :class="{ focus: manga.isFocused }"
            :title="manga.isFocused ? t('manga.unfocus') : t('manga.focus')"
            @click="mangaStore.toggleFocus(manga.id)"
          >
            <Star :size="14" :fill="manga.isFocused ? 'currentColor' : 'none'" />
          </button>
          <button class="card-btn danger" :title="t('manga.delete')" @click="mangaStore.remove(manga.id)">
            <Trash2 :size="14" />
          </button>
        </div>
      </div>
    </div>

    <!-- Status picker (teleported to body to avoid clip) -->
    <Teleport to="body">
      <div v-if="showStatusPicker" class="status-picker-floating" :style="pickerStyle" @click.stop>
        <button
          v-for="s in statuses"
          :key="s.value"
          class="status-picker-option"
          :class="{ active: manga.status === s.value }"
          @click="changeStatus(s.value)"
        >
          {{ t(s.label) }}
        </button>
      </div>
    </Teleport>

    <!-- Mark-as-read Dialog (Mobile, nach Schließen des Browsers) -->
    <Teleport to="body">
      <div v-if="showMarkReadDialog" class="modal-backdrop" @mousedown="backdropDown = ($event.target as Element) === ($event.currentTarget as Element)" @click.self="backdropDown && (showMarkReadDialog = false)">
        <div class="modal-box">
          <p class="text-sm font-medium mb-1" style="color: hsl(var(--foreground))">
            Bis zu welchem Kapitel gelesen?
          </p>
          <p class="text-xs mb-4 truncate" style="color: hsl(var(--muted-foreground))">{{ manga.title }}</p>
          <div class="flex items-center justify-center gap-3 mb-4">
            <button class="chapter-adj-btn" @click="markReadChapter = Math.max(1, markReadChapter - 1)">−</button>
            <span class="text-lg font-semibold" style="color: hsl(var(--foreground)); min-width: 48px; text-align: center">{{ markReadChapter }}</span>
            <button class="chapter-adj-btn" @click="markReadChapter++">+</button>
          </div>
          <button class="btn-primary w-full" @click="confirmMarkRead">Speichern</button>
          <button class="btn-ghost w-full mt-2" @click="showMarkReadDialog = false">Abbrechen</button>
        </div>
      </div>
    </Teleport>

    <!-- Read Choice Dialog -->
    <Teleport to="body">
      <div v-if="showReadChoiceDialog" class="modal-backdrop" @mousedown="backdropDown = ($event.target as Element) === ($event.currentTarget as Element)" @click.self="backdropDown && (showReadChoiceDialog = false)">
        <div class="modal-box">
          <p class="text-sm font-medium mb-4" style="color: hsl(var(--foreground))">
            {{ t('reader.chooseWhat') }}
          </p>
          <p class="text-xs mb-4 truncate" style="color: hsl(var(--muted-foreground))">{{ manga.title }}</p>
          <div class="flex gap-2">
            <button class="btn-primary flex-1" @click="openMain">{{ t('reader.openMain') }}</button>
            <button class="btn-secondary flex-1" @click="openChapter">{{ t('reader.openChapter') }}</button>
          </div>
          <button class="btn-ghost w-full mt-2" @click="showReadChoiceDialog = false">{{ t('manga.cancel') }}</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.manga-card {
  padding: 12px;
  border-radius: 8px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  transition: border-color 0.15s, box-shadow 0.15s;
}
.manga-card:hover {
  border-color: hsl(var(--border) / 0.8);
  box-shadow: 0 2px 8px hsl(0 0% 0% / 0.3);
}
.manga-card.has-new {
  border-color: hsl(var(--primary) / 0.4);
}
.card-inner {
  display: flex;
  flex-direction: column;
}
.card-inner.has-cover {
  flex-direction: row;
  gap: 10px;
}
.cover-panel {
  flex-shrink: 0;
  width: 72px;
  border-radius: 5px;
  overflow: hidden;
  background: hsl(var(--secondary));
  align-self: stretch;
}
.cover-panel img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.card-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.card-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;
}
.card-title.title-expand-enabled:hover,
.card-title.expanded {
  white-space: normal;
  word-break: break-word;
  overflow: visible;
  text-overflow: unset;
  cursor: pointer;
}
.card-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--secondary));
  border: none;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.card-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.card-btn.primary:hover {
  background: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
}
.card-btn.danger:hover {
  background: hsl(var(--destructive) / 0.3);
  color: hsl(0 70% 70%);
}
.card-btn.focus {
  color: hsl(43 96% 56%);
}
.card-btn.focus:hover {
  background: hsl(43 96% 56% / 0.15);
  color: hsl(43 96% 50%);
}
@media (pointer: coarse) {
  .card-btn {
    min-width: 44px;
    min-height: 44px;
  }
}
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-box {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  padding: 20px;
  width: 300px;
}
.btn-primary {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
}
.btn-secondary {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
}
.btn-ghost {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  border: none;
  cursor: pointer;
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
.chapter-adj-btn:active {
  background: hsl(var(--accent));
}
.status-wrapper {
  display: inline-block;
}
.status-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: hsl(var(--secondary));
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.status-badge:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
</style>

<!-- Global styles for teleported picker (not scoped) -->
<style>
.status-picker-floating {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 140px;
  box-shadow: 0 4px 16px hsl(0 0% 0% / 0.4);
}
.status-picker-option {
  text-align: left;
  padding: 6px 10px;
  border-radius: 5px;
  font-size: 12px;
  background: transparent;
  color: hsl(var(--foreground));
  border: none;
  cursor: pointer;
  transition: background 0.1s;
  width: 100%;
}
.status-picker-option:hover {
  background: hsl(var(--accent));
}
.status-picker-option.active {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}
</style>

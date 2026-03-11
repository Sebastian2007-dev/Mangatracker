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

async function openUrl(url: string): Promise<void> {
  if (isMobile) {
    await Browser.open({ url, presentationStyle: 'fullscreen' })
  } else {
    await readerStore.open(props.manga.id, url)
  }
}

async function onRead(): Promise<void> {
  const behavior = settingsStore.readBehavior
  if (behavior === 'main') {
    await openUrl(props.manga.mainUrl)
  } else if (behavior === 'chapter') {
    const url = buildChapterUrl(props.manga.chapterUrlTemplate, props.manga.currentChapter)
    await openUrl(url)
  } else {
    // ask — show inline dialog
    const url = buildChapterUrl(props.manga.chapterUrlTemplate, props.manga.currentChapter)
    showReadChoiceDialog.value = true
    pendingChapterUrl.value = url
  }
}

import { ref, watch } from 'vue'
import type { MangaStatus } from '../../types/index'
const showReadChoiceDialog = ref(false)
const pendingChapterUrl = ref('')

// Status quick-change
const showStatusPicker = ref(false)
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
  await openUrl(pendingChapterUrl.value)
}
</script>

<template>
  <div
    class="manga-card"
    :class="{ 'has-new': manga.hasNewChapter }"
  >
    <!-- Header row -->
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold truncate" style="color: hsl(var(--foreground))">{{ manga.title }}</p>
        <div class="flex items-center gap-1.5 mt-0.5">
          <span class="text-xs" style="color: hsl(var(--muted-foreground))">Kap. </span>
          <ChapterInput :model-value="manga.currentChapter" @update:model-value="onChapterChange" />
        </div>
      </div>
      <NewChapterBadge v-if="manga.hasNewChapter" />
    </div>

    <!-- Status badge -->
    <div class="status-wrapper mt-2">
      <button ref="statusBadgeRef" class="status-badge status-badge-btn" @click.stop="toggleStatusPicker">
        {{ t('tabs.' + manga.status) }}
      </button>
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

    <!-- Action buttons -->
    <div class="flex items-center gap-1 mt-2">
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

    <!-- Read Choice Dialog -->
    <Teleport to="body">
      <div v-if="showReadChoiceDialog" class="modal-backdrop" @click.self="showReadChoiceDialog = false">
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

<script setup lang="ts">
import { computed, ref, inject, watch } from 'vue'
import { Plus, ArrowUpDown, RefreshCw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { Manga, TabId } from '../types/index'
import { useMangaStore } from '../stores/manga.store'
import { useSkillTreeStore } from '../stores/skill-tree.store'
import { useAdvFilter } from '../composables/useAdvFilter'
import MangaTabBar from '../components/manga/MangaTabBar.vue'
import MangaCard from '../components/manga/MangaCard.vue'
import MangaFormDialog from '../components/manga/MangaFormDialog.vue'
import { isMobile } from '../composables/usePlatform'

const { t } = useI18n()
const mangaStore = useMangaStore()
const skillTreeStore = useSkillTreeStore()
const { filter, hasFilters } = useAdvFilter()

// Injected from App.vue
const searchQuery = inject<{ value: string }>('searchQuery', { value: '' })

const activeTab = ref<TabId>('reading')
const showForm = ref(false)
const editingManga = ref<Manga | null>(null)

const filteredManga = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  const advActive = skillTreeStore.isUnlocked('adv_search') && hasFilters.value
  return mangaStore.items
    .filter((m) => {
      if (activeTab.value === 'all') return true
      if (activeTab.value === 'new') return m.hasNewChapter === true
      if (activeTab.value === 'focus') return m.isFocused
      return m.status === activeTab.value
    })
    .filter((m) => {
      if (!q) return true
      return (
        m.title.toLowerCase().includes(q) ||
        String(m.currentChapter).includes(q) ||
        m.mainUrl.toLowerCase().includes(q) ||
        m.chapterUrlTemplate.toLowerCase().includes(q)
      )
    })
    .filter((m) => {
      if (!advActive) return true
      if (filter.tags.length > 0) {
        const mt = m.tags ?? []
        if (!filter.tags.every((t) => mt.includes(t))) return false
      }
      if (filter.minChapter !== null && m.currentChapter < filter.minChapter) return false
      if (filter.maxChapter !== null && m.currentChapter > filter.maxChapter) return false
      return true
    })
})

// ── Sortierung ───────────────────────────────────────────────────────
type SortMode = 'manual' | 'newFirst' | 'title' | 'chapter' | 'rating' | 'updated' | 'added'

const SORT_STORAGE_KEY = 'mangatracker:librarySort'
const SORT_MODES: SortMode[] = ['manual', 'newFirst', 'title', 'chapter', 'rating', 'updated', 'added']

const storedSort = localStorage.getItem(SORT_STORAGE_KEY) as SortMode | null
const sortMode = ref<SortMode>(storedSort && SORT_MODES.includes(storedSort) ? storedSort : 'manual')

watch(sortMode, (v) => localStorage.setItem(SORT_STORAGE_KEY, v))

const sortedManga = computed(() => {
  const list = [...filteredManga.value]
  switch (sortMode.value) {
    case 'newFirst':
      // sort ist stabil — innerhalb der Gruppen bleibt die manuelle Reihenfolge
      return list.sort((a, b) => Number(b.hasNewChapter === true) - Number(a.hasNewChapter === true))
    case 'title':
      return list.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    case 'chapter':
      return list.sort((a, b) => b.currentChapter - a.currentChapter)
    case 'rating':
      return list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
    case 'updated':
      return list.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    case 'added':
      return list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    default:
      return list
  }
})

// Drag & Drop ergibt nur in der eigenen Reihenfolge Sinn
const dragEnabled = computed(() => sortMode.value === 'manual')

const isFocusFull = computed(() =>
  activeTab.value === 'focus' && mangaStore.items.filter((m) => m.isFocused).length >= skillTreeStore.maxFocusSlots
)

function openAdd(): void {
  if (activeTab.value === 'new') return
  if (activeTab.value === 'focus' && isFocusFull.value) return
  editingManga.value = null
  showForm.value = true
}

function openEdit(manga: Manga): void {
  editingManga.value = manga
  showForm.value = true
}

// ── Pull-to-Refresh (Mobile) ─────────────────────────────────────────
const PULL_THRESHOLD = 64
const PULL_MAX = 96
const scrollEl = ref<HTMLElement | null>(null)
const pullDistance = ref(0)
const isRefreshing = ref(false)
let pullStartY = 0
let pulling = false

function onTouchStart(e: TouchEvent): void {
  if (!isMobile || isRefreshing.value) return
  if ((scrollEl.value?.scrollTop ?? 1) > 0) return
  pullStartY = e.touches[0].clientY
  pulling = true
}

function onTouchMove(e: TouchEvent): void {
  if (!pulling || isRefreshing.value) return
  if ((scrollEl.value?.scrollTop ?? 1) > 0) {
    pullDistance.value = 0
    return
  }
  const dy = e.touches[0].clientY - pullStartY
  // Wurzel-Dämpfung: Indikator klebt nicht 1:1 am Finger
  pullDistance.value = dy > 0 ? Math.min(Math.sqrt(dy) * 6, PULL_MAX) : 0
}

async function onTouchEnd(): Promise<void> {
  if (!pulling) return
  pulling = false
  const shouldRefresh = pullDistance.value >= PULL_THRESHOLD
  pullDistance.value = 0
  if (!shouldRefresh || isRefreshing.value) return
  isRefreshing.value = true
  try {
    await mangaStore.scanNow()
  } finally {
    isRefreshing.value = false
  }
}

// Drag-and-drop
const draggedId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

function onDragStart(id: string, e: DragEvent): void {
  if (!dragEnabled.value) return
  draggedId.value = id
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(id: string): void {
  if (draggedId.value && draggedId.value !== id) dragOverId.value = id
}

function onDrop(toId: string): void {
  if (draggedId.value && draggedId.value !== toId) {
    mangaStore.reorder(draggedId.value, toId)
  }
  draggedId.value = null
  dragOverId.value = null
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Tab bar -->
    <MangaTabBar v-model="activeTab" />

    <!-- Content -->
    <div
      ref="scrollEl"
      class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4"
      :class="{ 'scroll-content-mobile': isMobile }"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <!-- Pull-to-Refresh Indikator (Mobile) -->
      <div
        v-if="isMobile && (pullDistance > 0 || isRefreshing)"
        class="ptr-indicator"
        :style="{ height: (isRefreshing ? 44 : pullDistance) + 'px' }"
      >
        <RefreshCw
          :size="18"
          class="ptr-icon"
          :class="{ spinning: isRefreshing, armed: !isRefreshing && pullDistance >= PULL_THRESHOLD }"
          :style="!isRefreshing ? { transform: `rotate(${pullDistance * 3}deg)` } : undefined"
        />
      </div>

      <!-- Sortierung -->
      <div v-if="filteredManga.length > 1" class="sort-row">
        <ArrowUpDown :size="13" class="sort-icon" />
        <select v-model="sortMode" class="sort-select" :title="t('sort.label')">
          <option value="manual">{{ t('sort.manual') }}</option>
          <option value="newFirst">{{ t('sort.newFirst') }}</option>
          <option value="title">{{ t('sort.title') }}</option>
          <option value="chapter">{{ t('sort.chapter') }}</option>
          <option value="rating">{{ t('sort.rating') }}</option>
          <option value="updated">{{ t('sort.updated') }}</option>
          <option value="added">{{ t('sort.added') }}</option>
        </select>
      </div>

      <!-- Focus hint -->
      <div v-if="activeTab === 'focus'" class="focus-hint-bar">
        <span class="focus-hint-text">{{ t('manga.focusHint', { max: skillTreeStore.maxFocusSlots }) }}</span>
        <span v-if="isFocusFull" class="focus-full-tag">{{ t('manga.focusFull', { max: skillTreeStore.maxFocusSlots }) }}</span>
      </div>

      <!-- Manga grid -->
      <div v-if="sortedManga.length > 0" class="manga-grid">
        <div
          v-for="manga in sortedManga"
          :key="manga.id"
          class="drag-item"
          :class="{ 'drag-over': dragOverId === manga.id, 'is-dragging': draggedId === manga.id }"
          :draggable="dragEnabled"
          @dragstart="onDragStart(manga.id, $event)"
          @dragend="draggedId = null; dragOverId = null"
          @dragover.prevent="onDragOver(manga.id)"
          @dragleave="dragOverId = null"
          @drop.prevent="onDrop(manga.id)"
        >
          <MangaCard :manga="manga" @edit="openEdit" />
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="flex flex-col items-center justify-center h-48 gap-2">
        <p class="text-sm" style="color: hsl(var(--muted-foreground))">{{ t('manga.noManga') }}</p>
        <button v-if="!isFocusFull" class="btn-add-first" @click="openAdd">
          {{ t('manga.addFirst') }}
        </button>
      </div>
    </div>

    <!-- Floating add button -->
    <button
      v-if="activeTab !== 'new' && !isFocusFull"
      class="fab"
      :class="{ 'fab-mobile': isMobile }"
      :title="t('manga.new')"
      @click="openAdd"
    >
      <Plus :size="20" />
    </button>

    <!-- Form Dialog -->
    <MangaFormDialog v-model:open="showForm" :manga="editingManga" />
  </div>
</template>

<style scoped>
.fab {
  position: fixed;
  bottom: 24px;
  right: calc(24px + env(safe-area-inset-right, 0px));
  width: 48px; height: 48px;
  border-radius: 50%;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 16px hsl(var(--primary) / 0.4);
  transition: opacity 0.15s, transform 0.15s;
}
.fab:hover { opacity: 0.9; transform: scale(1.05); }
.fab-mobile { bottom: calc(64px + 16px + env(safe-area-inset-bottom, 0px)); }
@media (orientation: landscape) {
  .fab-mobile { bottom: calc(48px + 12px + env(safe-area-inset-bottom, 0px)); }
}
.btn-add-first {
  padding: 8px 16px; border-radius: 6px; font-size: 13px;
  background: hsl(var(--primary) / 0.15); color: hsl(var(--primary));
  border: 1px solid hsl(var(--primary) / 0.3); cursor: pointer;
}
.focus-hint-bar {
  display: flex; flex-wrap: wrap; align-items: center;
  gap: 6px; font-size: 0.75rem; margin-bottom: 1rem;
  color: hsl(var(--muted-foreground));
}
.focus-hint-text { overflow-wrap: break-word; }
.focus-full-tag { font-weight: 500; color: hsl(var(--primary)); }
.sort-row {
  display: flex; align-items: center; justify-content: flex-end;
  gap: 6px; margin-bottom: 12px;
}
.sort-icon { color: hsl(var(--muted-foreground)); flex-shrink: 0; }
.sort-select {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 6px;
  background: hsl(var(--card));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
}
.sort-select:focus { outline: 1px solid hsl(var(--primary)); }
.ptr-indicator {
  display: flex; align-items: center; justify-content: center;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
}
.ptr-icon.armed { color: hsl(var(--primary)); }
.ptr-icon.spinning {
  color: hsl(var(--primary));
  animation: ptr-spin 0.8s linear infinite;
}
@keyframes ptr-spin { to { transform: rotate(360deg); } }
.manga-grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
@media (min-width: 600px) {
  .manga-grid { grid-template-columns: repeat(auto-fill, minmax(max(220px, 16%), 1fr)); }
}
.drag-item { border-radius: 8px; transition: opacity 0.15s; }
.drag-item.is-dragging { opacity: 0.4; }
.drag-item.drag-over { outline: 2px solid hsl(var(--primary)); outline-offset: 2px; }
.scroll-content-mobile {
  padding-bottom: 72px;
  padding-left: max(16px, env(safe-area-inset-left, 0px));
  padding-right: max(16px, env(safe-area-inset-right, 0px));
}
@media (orientation: landscape) {
  .scroll-content-mobile { padding-bottom: 60px; }
}
</style>

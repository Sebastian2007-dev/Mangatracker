<script setup lang="ts">
import { computed, ref, inject } from 'vue'
import { Plus } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { Manga, TabId } from '../types/index'
import { useMangaStore } from '../stores/manga.store'
import MangaTabBar from '../components/manga/MangaTabBar.vue'
import MangaCard from '../components/manga/MangaCard.vue'
import MangaFormDialog from '../components/manga/MangaFormDialog.vue'
import { isMobile } from '../composables/usePlatform'

const { t } = useI18n()
const mangaStore = useMangaStore()

// Injected from App.vue
const searchQuery = inject<{ value: string }>('searchQuery', { value: '' })

const activeTab = ref<TabId>('reading')
const showForm = ref(false)
const editingManga = ref<Manga | null>(null)

const filteredManga = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
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
})

const isFocusFull = computed(() =>
  activeTab.value === 'focus' && mangaStore.items.filter((m) => m.isFocused).length >= 3
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

// Drag-and-drop
const draggedId = ref<string | null>(null)
const dragOverId = ref<string | null>(null)

function onDragStart(id: string, e: DragEvent): void {
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
    <div class="flex-1 overflow-y-auto overflow-x-hidden p-4">
      <!-- Focus hint -->
      <p v-if="activeTab === 'focus'" class="text-xs mb-4" style="color: hsl(var(--muted-foreground))">
        {{ t('manga.focusHint') }}
        <span v-if="isFocusFull" class="ml-2 font-medium" style="color: hsl(var(--primary))">
          {{ t('manga.focusFull') }}
        </span>
      </p>

      <!-- Manga grid -->
      <div v-if="filteredManga.length > 0" class="manga-grid">
        <div
          v-for="manga in filteredManga"
          :key="manga.id"
          class="drag-item"
          :class="{ 'drag-over': dragOverId === manga.id, 'is-dragging': draggedId === manga.id }"
          draggable="true"
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
        <button
          v-if="!isFocusFull"
          class="btn-add-first"
          @click="openAdd"
        >
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
    <MangaFormDialog
      v-model:open="showForm"
      :manga="editingManga"
    />
  </div>
</template>

<style scoped>
.fab {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px hsl(var(--primary) / 0.4);
  transition: opacity 0.15s, transform 0.15s;
}
.fab:hover {
  opacity: 0.9;
  transform: scale(1.05);
}
/* Auf Mobile: über der Tab-Bar positionieren (64px) + Safe Area Inset */
.fab-mobile {
  bottom: calc(64px + 16px + env(safe-area-inset-bottom, 0px));
}
.btn-add-first {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
  border: 1px solid hsl(var(--primary) / 0.3);
  cursor: pointer;
}
.manga-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: 1fr;
}
@media (min-width: 600px) {
  .manga-grid {
    grid-template-columns: repeat(auto-fill, minmax(max(220px, 16%), 1fr));
  }
}
.drag-item {
  border-radius: 8px;
  transition: opacity 0.15s;
}
.drag-item.is-dragging {
  opacity: 0.4;
}
.drag-item.drag-over {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}
</style>

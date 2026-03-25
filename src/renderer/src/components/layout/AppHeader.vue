<script setup lang="ts">
import { computed, ref } from 'vue'
import { Search, Upload, Download, RefreshCw, SlidersHorizontal, X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { useMangaStore } from '../../stores/manga.store'
import { useSkillTreeStore } from '../../stores/skill-tree.store'
import { useAdvFilter, type FilterPreset } from '../../composables/useAdvFilter'
import { getBridge } from '../../services/platform'
import { isMobile } from '../../composables/usePlatform'
import ScanResultModal from '../manga/ScanResultModal.vue'
import type { Manga } from '../../types/index'

const { t } = useI18n()
const route = useRoute()
const mangaStore = useMangaStore()
const skillTreeStore = useSkillTreeStore()
const { filter, presets, hasFilters, toggleTag, reset, savePreset, applyPreset, deletePreset } = useAdvFilter()

const isScanning = ref(false)
const scanResultManga = ref<Manga[]>([])
const showScanResult = ref(false)
const showFilter = ref(false)
const showPresetInput = ref(false)
const presetNameInput = ref('')

const isLibraryPage = computed(() => route.path === '/')

const allTags = computed(() => {
  const set = new Set<string>()
  mangaStore.items.forEach((m) => (m.tags ?? []).forEach((t) => set.add(t)))
  return [...set].sort()
})

const searchQuery = defineModel<string>('searchQuery', { default: '' })

async function handleScanNow(): Promise<void> {
  if (isScanning.value) return
  isScanning.value = true
  try {
    const newManga = await mangaStore.scanNow()
    scanResultManga.value = newManga
    showScanResult.value = true
  } finally {
    isScanning.value = false
  }
}

async function handleExport(): Promise<void> {
  const result = await getBridge().invoke<{ success: boolean; data: string }>('manga:export')
  if (!isMobile && result.success && result.data) {
    const blob = new Blob([result.data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'manga-list.json'
    a.click()
    URL.revokeObjectURL(url)
  }
}

async function handleImport(): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const text = await file.text()
    const result = await getBridge().invoke<{ success: boolean; data: any[] }>('manga:import', { json: text })
    if (result.success) await mangaStore.fetchAll()
  }
  input.click()
}

function confirmSavePreset(): void {
  const name = presetNameInput.value.trim()
  if (!name) return
  savePreset(name)
  presetNameInput.value = ''
  showPresetInput.value = false
}

function handleApplyPreset(p: FilterPreset): void {
  applyPreset(p)
}
</script>

<template>
  <div class="header-root">
    <!-- Header bar -->
    <header class="header-bar">
      <!-- Search + Filter -->
      <div class="search-group">
        <div class="search-wrap">
          <Search :size="15" class="search-icon" />
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('manga.search')"
            class="search-input"
          />
        </div>

        <!-- Filter toggle (adv_search skill, library page only) -->
        <button
          v-if="skillTreeStore.isUnlocked('adv_search') && isLibraryPage"
          class="filter-btn"
          :class="{ active: hasFilters, open: showFilter }"
          :title="t('manga.advFilter')"
          @click="showFilter = !showFilter"
        >
          <SlidersHorizontal :size="14" />
          <span v-if="hasFilters" class="filter-dot" />
        </button>
      </div>

      <div class="flex-1" />

      <!-- Scan Now -->
      <button class="icon-btn" :class="{ spinning: isScanning }" :title="t('manga.scanNow')" :disabled="isScanning" @click="handleScanNow">
        <RefreshCw :size="16" />
      </button>

      <!-- Export (export_list skill) -->
      <button v-if="skillTreeStore.isUnlocked('export_list')" class="icon-btn" :title="t('manga.export')" @click="handleExport">
        <Upload :size="16" />
      </button>

      <!-- Import (export_list skill) -->
      <button v-if="skillTreeStore.isUnlocked('export_list')" class="icon-btn" :title="t('manga.import')" @click="handleImport">
        <Download :size="16" />
      </button>
    </header>

    <!-- Filter dropdown (below header bar) -->
    <Transition name="filter-drop">
      <div v-if="showFilter && skillTreeStore.isUnlocked('adv_search') && isLibraryPage" class="filter-panel">
        <div class="filter-inner">

          <!-- Tags -->
          <div v-if="allTags.length > 0" class="filter-group">
            <span class="filter-label">{{ t('manga.filterTags') }}</span>
            <div class="tag-list">
              <button
                v-for="tag in allTags"
                :key="tag"
                class="tag-chip"
                :class="{ active: filter.tags.includes(tag) }"
                @click="toggleTag(tag)"
              >{{ tag }}</button>
            </div>
          </div>

          <!-- Chapter range -->
          <div class="filter-group filter-group-row">
            <span class="filter-label">{{ t('manga.filterChapter') }}</span>
            <div class="range-row">
              <input
                :value="filter.minChapter ?? ''"
                type="number"
                :placeholder="t('manga.filterMin')"
                class="chapter-input"
                min="0"
                @input="filter.minChapter = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
              />
              <span class="range-dash">–</span>
              <input
                :value="filter.maxChapter ?? ''"
                type="number"
                :placeholder="t('manga.filterMax')"
                class="chapter-input"
                min="0"
                @input="filter.maxChapter = ($event.target as HTMLInputElement).value ? Number(($event.target as HTMLInputElement).value) : null"
              />
            </div>
          </div>

          <!-- Presets (filter_presets skill) -->
          <div v-if="skillTreeStore.isUnlocked('filter_presets')" class="filter-group">
            <span class="filter-label">{{ t('manga.filterPresets') }}</span>
            <div class="preset-area">
              <div class="preset-chips">
                <div v-for="p in presets" :key="p.name" class="preset-item">
                  <button class="preset-load" @click="handleApplyPreset(p)">{{ p.name }}</button>
                  <button class="preset-del" @click="deletePreset(p.name)"><X :size="9" /></button>
                </div>
                <span v-if="presets.length === 0" class="no-presets">{{ t('manga.noPresets') }}</span>
              </div>

              <div v-if="!showPresetInput" class="preset-save-row">
                <button v-if="hasFilters" class="save-btn" @click="showPresetInput = true">
                  {{ t('manga.savePreset') }}
                </button>
              </div>
              <div v-else class="preset-input-row">
                <input
                  v-model="presetNameInput"
                  type="text"
                  :placeholder="t('manga.presetNamePlaceholder')"
                  class="preset-name-input"
                  @keydown.enter="confirmSavePreset"
                />
                <button class="btn-ok" @click="confirmSavePreset">{{ t('manga.save') }}</button>
                <button class="btn-x" @click="showPresetInput = false; presetNameInput = ''"><X :size="11" /></button>
              </div>
            </div>
          </div>

          <!-- Reset -->
          <button v-if="hasFilters" class="reset-btn" @click="reset">
            <X :size="11" /> {{ t('manga.resetFilter') }}
          </button>
        </div>
      </div>
    </Transition>
  </div>

  <ScanResultModal
    v-if="showScanResult"
    :manga="scanResultManga"
    @close="showScanResult = false"
  />
</template>

<style scoped>
.header-root {
  position: relative;
  flex-shrink: 0;
}
.header-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  height: 48px;
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
  padding-left: max(1rem, env(safe-area-inset-left, 0px));
  padding-right: max(1rem, env(safe-area-inset-right, 0px));
}
/* Search + filter toggle side by side */
.search-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  max-width: 26rem;
}
.search-wrap {
  position: relative;
  flex: 1;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: hsl(var(--muted-foreground));
  pointer-events: none;
}
.search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px 0 30px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--input));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  outline: none;
}
.search-input:focus { border-color: hsl(var(--primary)); box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15); }
/* Filter toggle button */
.filter-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.filter-btn:hover { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }
.filter-btn.active { color: hsl(var(--primary)); border-color: hsl(var(--primary) / 0.5); background: hsl(var(--primary) / 0.08); }
.filter-btn.open { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }
.filter-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: hsl(var(--primary));
}
/* Filter dropdown */
.filter-panel {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 50;
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
  box-shadow: 0 6px 16px hsl(0 0% 0% / 0.12);
}
.filter-inner {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 12px 20px;
  padding: 10px max(12px, env(safe-area-inset-left, 0px)) 10px max(12px, env(safe-area-inset-right, 0px));
}
.filter-group {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.filter-group-row { flex-direction: row; align-items: center; gap: 8px; }
.filter-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}
.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-width: 400px;
}
.tag-chip {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  background: hsl(var(--secondary));
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.tag-chip.active {
  background: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.4);
}
.range-row { display: flex; align-items: center; gap: 5px; }
.chapter-input {
  width: 64px; height: 26px; padding: 0 6px;
  border-radius: 5px; font-size: 12px;
  background: hsl(var(--input)); color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border)); outline: none;
}
.chapter-input:focus { border-color: hsl(var(--primary)); }
.range-dash { font-size: 12px; color: hsl(var(--muted-foreground)); }
/* Presets */
.preset-area { display: flex; flex-direction: column; gap: 5px; }
.preset-chips { display: flex; flex-wrap: wrap; gap: 4px; min-height: 20px; }
.preset-item { display: flex; align-items: stretch; }
.preset-load {
  padding: 2px 8px; border-radius: 4px 0 0 4px; font-size: 11px;
  background: hsl(var(--secondary)); color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border)); border-right: none; cursor: pointer;
}
.preset-load:hover { background: hsl(var(--primary) / 0.12); color: hsl(var(--primary)); }
.preset-del {
  display: flex; align-items: center; justify-content: center;
  padding: 0 4px; border-radius: 0 4px 4px 0;
  background: hsl(var(--secondary)); color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border)); cursor: pointer;
}
.preset-del:hover { color: hsl(0 70% 65%); background: hsl(var(--destructive) / 0.12); }
.no-presets { font-size: 11px; color: hsl(var(--muted-foreground)); align-self: center; }
.preset-save-row { display: flex; }
.save-btn {
  padding: 2px 8px; border-radius: 4px; font-size: 11px;
  background: transparent; color: hsl(var(--primary));
  border: 1px dashed hsl(var(--primary) / 0.5); cursor: pointer;
}
.save-btn:hover { background: hsl(var(--primary) / 0.08); }
.preset-input-row { display: flex; align-items: center; gap: 4px; }
.preset-name-input {
  width: 140px; height: 24px; padding: 0 6px;
  border-radius: 4px; font-size: 12px;
  background: hsl(var(--input)); color: hsl(var(--foreground));
  border: 1px solid hsl(var(--primary)); outline: none;
}
.btn-ok {
  padding: 2px 8px; border-radius: 4px; font-size: 11px;
  background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
  border: none; cursor: pointer;
}
.btn-x {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; border-radius: 4px;
  background: transparent; color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border)); cursor: pointer;
}
.reset-btn {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 8px; border-radius: 5px; font-size: 11px;
  background: transparent; color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border)); cursor: pointer;
  align-self: flex-end;
  margin-left: auto;
}
.reset-btn:hover { color: hsl(var(--foreground)); background: hsl(var(--secondary)); }
/* Transition */
.filter-drop-enter-active, .filter-drop-leave-active { transition: opacity 0.15s, transform 0.15s; }
.filter-drop-enter-from, .filter-drop-leave-to { opacity: 0; transform: translateY(-4px); }
/* Icon button */
.icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 6px;
  color: hsl(var(--muted-foreground));
  background: transparent; border: none; cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.icon-btn:hover { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }
.icon-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.spinning svg { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>

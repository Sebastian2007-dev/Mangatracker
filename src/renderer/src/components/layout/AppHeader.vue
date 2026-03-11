<script setup lang="ts">
import { Search, Upload, Download, RefreshCw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { ref } from 'vue'
import { useMangaStore } from '../../stores/manga.store'
import { getBridge } from '../../services/platform'
import { isMobile } from '../../composables/usePlatform'

const { t } = useI18n()
const mangaStore = useMangaStore()

const isScanning = ref(false)

async function handleScanNow(): Promise<void> {
  if (isScanning.value) return
  isScanning.value = true
  try {
    await getBridge().invoke('manga:scanNow')
    await mangaStore.fetchAll()
  } finally {
    isScanning.value = false
  }
}

const searchQuery = defineModel<string>('searchQuery', { default: '' })

async function handleExport(): Promise<void> {
  const result = await getBridge().invoke<{ success: boolean; data: string }>('manga:export')
  // Auf Mobile: Share-Dialog wurde bereits vom Capacitor-Adapter geöffnet
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
    if (result.success) {
      await mangaStore.fetchAll()
    }
  }
  input.click()
}
</script>

<template>
  <header
    class="flex items-center gap-3 px-4 h-12 border-b shrink-0"
    style="background: hsl(var(--card)); border-color: hsl(var(--border))"
  >
    <!-- Search -->
    <div class="relative flex-1 max-w-sm">
      <Search
        :size="15"
        class="absolute left-2.5 top-1/2 -translate-y-1/2"
        style="color: hsl(var(--muted-foreground))"
      />
      <input
        v-model="searchQuery"
        type="text"
        :placeholder="t('manga.search')"
        class="w-full h-8 pl-8 pr-3 rounded-md text-sm focus:outline-none focus:ring-1"
        style="background: hsl(var(--input)); color: hsl(var(--foreground)); border: 1px solid hsl(var(--border)); --tw-ring-color: hsl(var(--primary))"
      />
    </div>

    <div class="flex-1" />

    <!-- Scan Now -->
    <button class="icon-btn" :class="{ spinning: isScanning }" :title="t('manga.scanNow')" :disabled="isScanning" @click="handleScanNow">
      <RefreshCw :size="16" />
    </button>

    <!-- Export -->
    <button class="icon-btn" :title="t('manga.export')" @click="handleExport">
      <Upload :size="16" />
    </button>

    <!-- Import -->
    <button class="icon-btn" :title="t('manga.import')" @click="handleImport">
      <Download :size="16" />
    </button>
  </header>
</template>

<style scoped>
.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.icon-btn:hover {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}
.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.spinning svg {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>

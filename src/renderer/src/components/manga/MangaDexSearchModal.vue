<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { getBridge } from '../../services/platform'

const props = defineProps<{
  open: boolean
  initialQuery: string
  searchChannel?: string
  modalTitle?: string
}>()
const emit = defineEmits<{
  close: []
  select: [{ id: string; title: string; coverUrl: string | null }]
}>()

const { t } = useI18n()

let backdropDown = false
const query = ref('')
const results = ref<{ id: string; title: string; coverUrl: string | null }[]>([])
const searching = ref(false)
const error = ref('')

watch(
  () => props.open,
  async (v) => {
    if (v) {
      query.value = props.initialQuery
      results.value = []
      error.value = ''
      if (query.value.trim()) await doSearch()
    }
  }
)

async function doSearch(): Promise<void> {
  if (!query.value.trim() || searching.value) return
  searching.value = true
  error.value = ''
  try {
    const channel = props.searchChannel ?? 'mangadex:search'
    const res = (await getBridge().invoke(channel, { title: query.value.trim() })) as {
      success: boolean
      data?: { id: string; title: string; coverUrl: string | null }[]
      error?: string
    }
    if (res.success) {
      results.value = res.data ?? []
    } else {
      error.value = t('manga.mdxSearchError')
    }
  } catch {
    error.value = t('manga.mdxSearchError')
  } finally {
    searching.value = false
  }
}

function onSelect(item: { id: string; title: string; coverUrl: string | null }): void {
  emit('select', { id: item.id, title: item.title, coverUrl: item.coverUrl })
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="mdx-backdrop" @mousedown="backdropDown = ($event.target as Element) === ($event.currentTarget as Element)" @click.self="backdropDown && emit('close')">
      <div class="mdx-box">
        <!-- Header -->
        <div class="mdx-header">
          <span>{{ props.modalTitle ?? t('manga.mdxModalTitle') }}</span>
          <button class="mdx-close-btn" @click="emit('close')">
            <X :size="16" />
          </button>
        </div>

        <!-- Suchzeile -->
        <div class="mdx-search-row">
          <input
            v-model="query"
            type="text"
            class="mdx-input"
            :placeholder="t('manga.mdxSearchPlaceholder')"
            @keydown.enter="doSearch"
          />
          <button class="mdx-search-btn" :disabled="searching" @click="doSearch">
            {{ searching ? '...' : t('manga.mdxSearchBtn') }}
          </button>
        </div>

        <p v-if="error" class="mdx-msg mdx-error">{{ error }}</p>

        <!-- Ergebnis-Grid -->
        <div v-if="results.length" class="mdx-grid">
          <button
            v-for="r in results"
            :key="r.id"
            class="mdx-card"
            @click="onSelect({ id: r.id, title: r.title, coverUrl: r.coverUrl })"
          >
            <div class="mdx-cover">
              <img v-if="r.coverUrl" :src="r.coverUrl" :alt="r.title" loading="lazy" />
              <div v-else class="mdx-cover-placeholder">📖</div>
            </div>
            <span class="mdx-card-title">{{ r.title }}</span>
          </button>
        </div>

        <p v-else-if="!searching && !error" class="mdx-msg">
          {{ query.trim() ? t('manga.mdxNoResults') : t('manga.mdxStartSearch') }}
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.mdx-backdrop {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 300;
}
.mdx-box {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  padding: 20px;
  width: 520px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}
.mdx-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
  flex-shrink: 0;
}
.mdx-close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
}
.mdx-close-btn:hover {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}
.mdx-search-row {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
.mdx-input {
  flex: 1;
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--input));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  outline: none;
}
.mdx-input:focus {
  border-color: hsl(var(--primary));
}
.mdx-search-btn {
  flex-shrink: 0;
  padding: 0 14px;
  height: 36px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
}
.mdx-search-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.mdx-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
  gap: 12px;
  overflow-y: auto;
  padding-right: 2px;
}
.mdx-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 8px;
  cursor: pointer;
  transition: border-color 0.1s, background 0.1s;
}
.mdx-card:hover {
  background: hsl(var(--accent));
  border-color: hsl(var(--border));
}
.mdx-cover {
  width: 80px;
  height: 110px;
  border-radius: 4px;
  overflow: hidden;
  background: hsl(var(--secondary));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mdx-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mdx-cover-placeholder {
  font-size: 28px;
}
.mdx-card-title {
  font-size: 11px;
  color: hsl(var(--foreground));
  text-align: center;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}
.mdx-msg {
  font-size: 13px;
  text-align: center;
  color: hsl(var(--muted-foreground));
}
.mdx-error {
  color: hsl(0 70% 65%);
}
</style>

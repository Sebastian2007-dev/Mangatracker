<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { Manga, MangaStatus } from '../../types/index'
import { useMangaStore } from '../../stores/manga.store'
import { useSettingsStore } from '../../stores/settings.store'
import { getBridge } from '../../services/platform'
import MangaDexSearchModal from './MangaDexSearchModal.vue'

const props = defineProps<{ open: boolean; manga?: Manga | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { t } = useI18n()
const mangaStore = useMangaStore()
const settingsStore = useSettingsStore()

const title = ref('')
const mainUrl = ref('')
const chapterUrlTemplate = ref('')
const status = ref<MangaStatus>('reading')
const currentChapter = ref(0)
const errors = ref<Record<string, string>>({})
const mangaDexId = ref('')
const mangaDexTitle = ref('')
const mangaDexCoverUrl = ref<string | undefined>(undefined)
const showMdxModal = ref(false)
const comickHid = ref('')
const comickTitle = ref('')
const comickCoverUrl = ref<string | undefined>(undefined)
const showCkModal = ref(false)
const autoLinking = ref(false)
let backdropDown = false

type SearchItem = { id: string; title: string; coverUrl: string | null }

function titleSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const wa = new Set(normalize(a).split(' ').filter(Boolean))
  const wb = new Set(normalize(b).split(' ').filter(Boolean))
  if (wa.size === 0 || wb.size === 0) return 0
  const intersection = [...wa].filter((w) => wb.has(w)).length
  const union = new Set([...wa, ...wb]).size
  return intersection / union
}

async function autoLink(): Promise<void> {
  const q = title.value.trim()
  if (!q) return
  const bridge = getBridge()

  if (!mangaDexId.value) {
    try {
      const res = (await bridge.invoke('mangadex:search', { title: q })) as {
        success: boolean
        data?: SearchItem[]
      }
      if (res.success && res.data && res.data.length > 0) {
        const best = res.data.reduce(
          (b, item) => {
            const s = titleSimilarity(q, item.title)
            return s > b.score ? { score: s, item } : b
          },
          { score: 0, item: res.data[0] }
        )
        if (best.score >= 0.5) {
          mangaDexId.value = best.item.id
          mangaDexTitle.value = best.item.title
          mangaDexCoverUrl.value = best.item.coverUrl ?? undefined
        }
      }
    } catch { /* ignore */ }
  }

  if (!comickHid.value) {
    try {
      const res = (await bridge.invoke('comick:search', { title: q })) as {
        success: boolean
        data?: SearchItem[]
      }
      if (res.success && res.data && res.data.length > 0) {
        const best = res.data.reduce(
          (b, item) => {
            const s = titleSimilarity(q, item.title)
            return s > b.score ? { score: s, item } : b
          },
          { score: 0, item: res.data[0] }
        )
        if (best.score >= 0.5) {
          comickHid.value = best.item.id
          comickTitle.value = best.item.title
          comickCoverUrl.value = best.item.coverUrl ?? undefined
        }
      }
    } catch { /* ignore */ }
  }
}

const statuses: { value: MangaStatus; label: string }[] = [
  { value: 'reading', label: 'tabs.reading' },
  { value: 'plan_to_read', label: 'tabs.plan_to_read' },
  { value: 'hiatus', label: 'tabs.hiatus' },
  { value: 'completed', label: 'tabs.completed' },
  { value: 'rereading', label: 'tabs.rereading' }
]

watch(() => props.open, (open) => {
  if (open) {
    if (props.manga) {
      title.value = props.manga.title
      mainUrl.value = props.manga.mainUrl
      chapterUrlTemplate.value = props.manga.chapterUrlTemplate
      status.value = props.manga.status
      currentChapter.value = props.manga.currentChapter
      mangaDexId.value = props.manga.mangaDexId ?? ''
      mangaDexTitle.value = props.manga.mangaDexTitle ?? ''
      mangaDexCoverUrl.value = props.manga.mangaDexCoverUrl
      comickHid.value = props.manga.comickHid ?? ''
      comickTitle.value = props.manga.comickTitle ?? ''
      comickCoverUrl.value = props.manga.comickCoverUrl
    } else {
      title.value = ''
      mainUrl.value = ''
      chapterUrlTemplate.value = ''
      status.value = 'reading'
      currentChapter.value = 0
      mangaDexId.value = ''
      mangaDexTitle.value = ''
      mangaDexCoverUrl.value = undefined
      comickHid.value = ''
      comickTitle.value = ''
      comickCoverUrl.value = undefined
    }
    errors.value = {}
    showMdxModal.value = false
    showCkModal.value = false
  }
})

function validate(): boolean {
  errors.value = {}
  if (!title.value.trim()) errors.value.title = 'Pflichtfeld'
  if (!mainUrl.value.trim()) errors.value.mainUrl = 'Pflichtfeld'
  return Object.keys(errors.value).length === 0
}

async function handleSave(): Promise<void> {
  if (!validate()) return

  if (settingsStore.autoLinkEnabled) {
    autoLinking.value = true
    await autoLink()
    autoLinking.value = false
  }

  const payload = {
    title: title.value.trim(),
    mainUrl: mainUrl.value.trim(),
    chapterUrlTemplate: chapterUrlTemplate.value.trim(),
    status: status.value,
    isFocused: props.manga?.isFocused ?? false,
    currentChapter: currentChapter.value,
    hasNewChapter: false,
    lastCheckedChapter: currentChapter.value,
    mangaDexId: mangaDexId.value || undefined,
    mangaDexTitle: mangaDexTitle.value || undefined,
    mangaDexCoverUrl: mangaDexCoverUrl.value || undefined,
    comickHid: comickHid.value || undefined,
    comickTitle: comickTitle.value || undefined,
    comickCoverUrl: comickCoverUrl.value || undefined
  }

  if (props.manga) {
    await mangaStore.update(props.manga.id, payload)
  } else {
    await mangaStore.create(payload)
  }
  emit('update:open', false)
}

function onMdxSelect(item: { id: string; title: string; coverUrl: string | null }): void {
  mangaDexId.value = item.id
  mangaDexTitle.value = item.title
  mangaDexCoverUrl.value = item.coverUrl ?? undefined
}

function onCkSelect(item: { id: string; title: string; coverUrl: string | null }): void {
  comickHid.value = item.id
  comickTitle.value = item.title
  comickCoverUrl.value = item.coverUrl ?? undefined
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @mousedown="backdropDown = ($event.target as Element) === ($event.currentTarget as Element)" @click.self="backdropDown && emit('update:open', false)">
      <div class="modal-box">
        <!-- Header -->
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-base font-semibold" style="color: hsl(var(--foreground))">
            {{ manga ? t('manga.edit') : t('manga.new') }}
          </h2>
          <button class="close-btn" @click="emit('update:open', false)">
            <X :size="16" />
          </button>
        </div>

        <!-- Fields -->
        <div class="flex flex-col gap-4">
          <!-- Title -->
          <div>
            <label class="field-label">{{ t('manga.title') }} *</label>
            <input v-model="title" type="text" class="field-input" :class="{ error: errors.title }" />
            <p v-if="errors.title" class="field-error">{{ errors.title }}</p>
          </div>

          <!-- Main URL -->
          <div>
            <label class="field-label">{{ t('manga.mainUrl') }} *</label>
            <input v-model="mainUrl" type="url" class="field-input" :class="{ error: errors.mainUrl }" placeholder="https://example.com/manga/..." />
            <p v-if="errors.mainUrl" class="field-error">{{ errors.mainUrl }}</p>
          </div>

          <!-- Chapter URL Template -->
          <div>
            <label class="field-label">{{ t('manga.chapterUrlTemplate') }}</label>
            <input v-model="chapterUrlTemplate" type="text" class="field-input" placeholder="https://example.com/manga/$chapter" />
            <p class="text-xs mt-1" style="color: hsl(var(--muted-foreground))">{{ t('manga.chapterUrlHelp') }}</p>
          </div>

          <!-- Status -->
          <div>
            <label class="field-label">{{ t('manga.status') }}</label>
            <select v-model="status" class="field-input" :class="{ error: errors.status }">
              <option v-for="s in statuses" :key="s.value" :value="s.value">{{ t(s.label) }}</option>
            </select>
            <p v-if="errors.status" class="field-error">{{ errors.status }}</p>
          </div>

          <!-- Current Chapter -->
          <div>
            <label class="field-label">{{ t('manga.currentChapter') }}</label>
            <input v-model.number="currentChapter" type="number" min="0" step="0.5" class="field-input" />
          </div>

          <!-- MangaDex Verknüpfung -->
          <div>
            <label class="field-label">MangaDex</label>
            <div class="mdx-row">
              <span class="mdx-status" :class="{ linked: !!mangaDexId }">
                {{ mangaDexId ? '✓ ' + mangaDexTitle : t('manga.mdxNotLinked') }}
              </span>
              <button
                v-if="mangaDexId"
                type="button"
                class="mdx-btn"
                :title="t('manga.mdxUnlink')"
                @click="mangaDexId = ''; mangaDexTitle = ''; mangaDexCoverUrl = undefined"
              >✕</button>
              <button type="button" class="mdx-btn" @click="showMdxModal = true">
                {{ mangaDexId ? t('manga.mdxChange') : t('manga.mdxLink') }}
              </button>
            </div>
            <p v-if="!mangaDexId" class="text-xs mt-1" style="color: hsl(var(--muted-foreground))">
              {{ t('manga.mdxHint') }}
            </p>
          </div>

          <!-- ComicK.io Verknüpfung -->
          <div>
            <label class="field-label">ComicK.io</label>
            <div class="mdx-row">
              <span class="mdx-status" :class="{ linked: !!comickHid }">
                {{ comickHid ? '✓ ' + comickTitle : t('manga.ckNotLinked') }}
              </span>
              <button
                v-if="comickHid"
                type="button"
                class="mdx-btn"
                :title="t('manga.ckUnlink')"
                @click="comickHid = ''; comickTitle = ''; comickCoverUrl = undefined"
              >✕</button>
              <button type="button" class="mdx-btn" @click="showCkModal = true">
                {{ comickHid ? t('manga.ckChange') : t('manga.ckLink') }}
              </button>
            </div>
            <p v-if="!comickHid" class="text-xs mt-1" style="color: hsl(var(--muted-foreground))">
              {{ t('manga.ckHint') }}
            </p>
          </div>
        </div>

        <!-- Buttons -->
        <div class="flex gap-2 mt-6">
          <button class="btn-ghost flex-1" :disabled="autoLinking" @click="emit('update:open', false)">{{ t('manga.cancel') }}</button>
          <button class="btn-primary flex-1" :disabled="autoLinking" @click="handleSave">
            {{ autoLinking ? t('manga.autoLinking') : t('manga.save') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <MangaDexSearchModal
    :open="showMdxModal"
    :initial-query="title"
    @close="showMdxModal = false"
    @select="onMdxSelect"
  />

  <MangaDexSearchModal
    :open="showCkModal"
    :initial-query="title"
    search-channel="comick:search"
    :modal-title="t('manga.ckModalTitle')"
    @close="showCkModal = false"
    @select="onCkSelect"
  />
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}
.modal-box {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  padding: 20px;
  width: min(420px, 94vw);
  max-height: calc(90vh - env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
}
.field-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  margin-bottom: 4px;
}
.field-input {
  width: 100%;
  height: 36px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--input));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  outline: none;
  transition: border-color 0.15s;
}
.field-input:focus {
  border-color: hsl(var(--primary));
}
.field-input.error {
  border-color: hsl(var(--destructive));
}
.field-error {
  font-size: 11px;
  color: hsl(0 70% 65%);
  margin-top: 3px;
}
.close-btn {
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
.close-btn:hover {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}
.mdx-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
}
.mdx-status {
  flex: 1;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.mdx-status.linked {
  color: hsl(var(--primary));
}
.mdx-btn {
  flex-shrink: 0;
  padding: 0 10px;
  height: 28px;
  border-radius: 6px;
  font-size: 12px;
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
}
.mdx-btn:hover {
  background: hsl(var(--accent));
}
.btn-primary {
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
}
.btn-ghost {
  padding: 8px 14px;
  border-radius: 6px;
  font-size: 13px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
}
</style>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import type { Manga, MangaStatus } from '../../types/index'
import { useMangaStore } from '../../stores/manga.store'

const props = defineProps<{ open: boolean; manga?: Manga | null }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const { t } = useI18n()
const mangaStore = useMangaStore()

const title = ref('')
const mainUrl = ref('')
const chapterUrlTemplate = ref('')
const status = ref<MangaStatus>('reading')
const currentChapter = ref(0)
const errors = ref<Record<string, string>>({})

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
    } else {
      title.value = ''
      mainUrl.value = ''
      chapterUrlTemplate.value = ''
      status.value = 'reading'
      currentChapter.value = 0
    }
    errors.value = {}
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

  const payload = {
    title: title.value.trim(),
    mainUrl: mainUrl.value.trim(),
    chapterUrlTemplate: chapterUrlTemplate.value.trim(),
    status: status.value,
    isFocused: props.manga?.isFocused ?? false,
    currentChapter: currentChapter.value,
    hasNewChapter: false,
    lastCheckedChapter: currentChapter.value
  }

  if (props.manga) {
    await mangaStore.update(props.manga.id, payload)
  } else {
    await mangaStore.create(payload)
  }
  emit('update:open', false)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-backdrop" @click.self="emit('update:open', false)">
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
        </div>

        <!-- Buttons -->
        <div class="flex gap-2 mt-6">
          <button class="btn-ghost flex-1" @click="emit('update:open', false)">{{ t('manga.cancel') }}</button>
          <button class="btn-primary flex-1" @click="handleSave">{{ t('manga.save') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
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
  width: 420px;
  max-height: 90vh;
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

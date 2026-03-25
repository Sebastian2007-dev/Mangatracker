import { computed, reactive, ref } from 'vue'

export type FilterPreset = {
  name: string
  tags: string[]
  minChapter: number | null
  maxChapter: number | null
}

const PRESETS_KEY = 'mangatracker:filter_presets'

// Module-level singleton — shared between AppHeader and MangaListView
const filter = reactive<{ tags: string[]; minChapter: number | null; maxChapter: number | null }>({
  tags: [],
  minChapter: null,
  maxChapter: null
})

const presets = ref<FilterPreset[]>((() => {
  try { return JSON.parse(localStorage.getItem(PRESETS_KEY) ?? '[]') as FilterPreset[] } catch { return [] }
})())

function _persist(): void {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(presets.value))
}

export function useAdvFilter() {
  const hasFilters = computed(() =>
    filter.tags.length > 0 || filter.minChapter !== null || filter.maxChapter !== null
  )

  function toggleTag(tag: string): void {
    const i = filter.tags.indexOf(tag)
    if (i === -1) filter.tags.push(tag)
    else filter.tags.splice(i, 1)
  }

  function reset(): void {
    filter.tags = []
    filter.minChapter = null
    filter.maxChapter = null
  }

  function savePreset(name: string): void {
    presets.value = [
      ...presets.value.filter((p) => p.name !== name),
      { name, tags: [...filter.tags], minChapter: filter.minChapter, maxChapter: filter.maxChapter }
    ]
    _persist()
  }

  function applyPreset(p: FilterPreset): void {
    filter.tags = [...p.tags]
    filter.minChapter = p.minChapter
    filter.maxChapter = p.maxChapter
  }

  function deletePreset(name: string): void {
    presets.value = presets.value.filter((p) => p.name !== name)
    _persist()
  }

  return { filter, presets, hasFilters, toggleTag, reset, savePreset, applyPreset, deletePreset }
}

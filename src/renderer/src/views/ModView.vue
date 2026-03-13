<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings.store'

const route = useRoute()
const { t } = useI18n()
const settingsStore = useSettingsStore()

const modId = computed(() => String(route.params.modId ?? ''))

const selectedMod = computed(() =>
  settingsStore.loadedMods.find((mod) => mod.manifest.id === modId.value && mod.enabled)
)

function getModText(key: string, fallback: string): string {
  const mod = selectedMod.value
  if (!mod) return fallback
  const lang = settingsStore.language
  return mod.translations?.[lang]?.[key] ?? mod.translations?.en?.[key] ?? fallback
}

const modLabel = computed(() =>
  getModText('tabLabel', selectedMod.value?.manifest.sidebarTab?.label || selectedMod.value?.manifest.name || modId.value)
)

const modTitle = computed(() => getModText('tabTitle', modLabel.value))
const modSubtitle = computed(() => getModText('tabSubtitle', ''))
const modEmpty = computed(() => getModText('tabEmpty', ''))

onMounted(async () => {
  if (settingsStore.loadedMods.length === 0) {
    await settingsStore.fetchMods()
  }
})
</script>

<template>
  <div class="mod-view">
    <template v-if="selectedMod">
      <h1 class="mod-title">{{ modTitle }}</h1>
      <p v-if="modSubtitle" class="mod-subtitle">{{ modSubtitle }}</p>
      <div class="mod-empty-box">{{ modEmpty || modLabel }}</div>
    </template>

    <template v-else>
      <h1 class="mod-title">{{ t('mods.tabMissingTitle') }}</h1>
      <p class="mod-subtitle">{{ t('mods.tabMissingHint') }}</p>
    </template>
  </div>
</template>

<style scoped>
.mod-view {
  height: 100%;
  padding: 24px;
  overflow: auto;
}
.mod-title {
  font-size: 22px;
  font-weight: 700;
  color: hsl(var(--foreground));
  margin: 0 0 8px 0;
}
.mod-subtitle {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  margin: 0 0 16px 0;
}
.mod-empty-box {
  min-height: 160px;
  border-radius: 12px;
  border: 1px dashed hsl(var(--border));
  background: hsl(var(--card));
  color: hsl(var(--muted-foreground));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
}
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings.store'
import { getBridge } from '../services/platform'

const route = useRoute()
const { t } = useI18n()
const settingsStore = useSettingsStore()

const tabIframe = ref<HTMLIFrameElement | null>(null)
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

type ModIpcRequest = {
  type: 'mod-ipc'
  id: string
  channel: string
  payload?: unknown
  modId?: string
}

function resolveReplyTarget(event: MessageEvent): Window | null {
  const source = event.source as Window | null
  if (source && typeof source.postMessage === 'function') return source
  return tabIframe.value?.contentWindow ?? null
}

function onIframeMessage(event: MessageEvent): void {
  const data = event.data as Partial<ModIpcRequest> | null | undefined
  if (!data || data.type !== 'mod-ipc') return

  const { id, channel, payload, modId: requestModId } = data
  // Only relay channels that start with 'mod:' to prevent accidental IPC access
  if (typeof id !== 'string' || typeof channel !== 'string' || !channel.startsWith('mod:')) return
  if (typeof requestModId === 'string' && requestModId !== modId.value) return

  const replyTarget = resolveReplyTarget(event)
  if (!replyTarget) return

  getBridge()
    .invoke<unknown>(channel, payload)
    .then((result) => replyTarget.postMessage({ type: 'mod-ipc-reply', id, result }, '*'))
    .catch((e) => replyTarget.postMessage({ type: 'mod-ipc-reply', id, error: String(e) }, '*'))
}

onMounted(async () => {
  if (settingsStore.loadedMods.length === 0) {
    await settingsStore.fetchMods()
  }
  window.addEventListener('message', onIframeMessage)
})

onUnmounted(() => {
  window.removeEventListener('message', onIframeMessage)
})
</script>

<template>
  <div class="mod-view">
    <template v-if="selectedMod">
      <!-- Full HTML from mod file: render in sandboxed iframe -->
      <iframe
        v-if="selectedMod.tabHtml"
        ref="tabIframe"
        class="tab-iframe"
        :srcdoc="selectedMod.tabHtml"
        sandbox="allow-scripts"
      />
      <!-- Placeholder view when no HTML file is provided -->
      <template v-else>
        <h1 class="mod-title">{{ modTitle }}</h1>
        <p v-if="modSubtitle" class="mod-subtitle">{{ modSubtitle }}</p>
        <div class="mod-empty-box">{{ modEmpty || modLabel }}</div>
      </template>
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
.tab-iframe {
  width: 100%;
  height: 100%;
  border: none;
  border-radius: 8px;
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

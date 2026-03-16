<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { BookOpen, ChartColumn, Settings, ScrollText, Puzzle } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useLogStore } from '../../stores/log.store'
import { useSettingsStore } from '../../stores/settings.store'
import type { LoadedMod } from '../../../../types/mod'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const logStore = useLogStore()
const settingsStore = useSettingsStore()

const modTabs = computed(() =>
  settingsStore.loadedMods.filter((mod) => mod.enabled && !!mod.manifest.sidebarTab)
)

function getModTabLabel(mod: LoadedMod): string {
  const lang = settingsStore.language
  return (
    mod.translations?.[lang]?.tabLabel
    ?? mod.translations?.en?.tabLabel
    ?? mod.manifest.sidebarTab?.label
    ?? mod.manifest.name
  )
}

onMounted(async () => {
  await settingsStore.fetchMods()
})
</script>

<template>
  <nav
    class="flex flex-col items-center gap-2 py-4 border-r h-full"
    style="width: var(--sidebar-width); background: hsl(var(--card)); border-color: hsl(var(--border))"
  >
    <!-- Logo -->
    <div class="mb-4 flex items-center justify-center w-9 h-9 rounded-lg" style="background: hsl(var(--primary))">
      <BookOpen :size="18" style="color: hsl(var(--primary-foreground))" />
    </div>

    <!-- Library -->
    <button
      class="nav-btn"
      :class="{ active: route.path === '/' }"
      :title="t('nav.library')"
      @click="router.push('/')"
    >
      <BookOpen :size="20" />
    </button>

    <!-- Log -->
    <button
      class="nav-btn log-btn"
      :class="{ active: route.path === '/log' }"
      :title="t('nav.log')"
      @click="router.push('/log')"
    >
      <ScrollText :size="20" />
      <span v-if="logStore.unreadCount > 0 && route.path !== '/log'" class="unread-badge">
        {{ logStore.unreadCount > 99 ? '99+' : logStore.unreadCount }}
      </span>
    </button>

    <!-- Statistics -->
    <button
      class="nav-btn"
      :class="{ active: route.path === '/statistics' }"
      :title="t('nav.statistics')"
      @click="router.push('/statistics')"
    >
      <ChartColumn :size="20" />
    </button>

    <!-- Mod Tabs -->
    <button
      v-for="mod in modTabs"
      :key="mod.manifest.id"
      class="nav-btn"
      :class="{ active: route.path === `/mod/${mod.manifest.id}` }"
      :title="getModTabLabel(mod)"
      @click="router.push(`/mod/${mod.manifest.id}`)"
    >
      <Puzzle :size="20" />
    </button>

    <!-- Spacer -->
    <div class="flex-1" />

    <!-- Settings -->
    <button
      class="nav-btn"
      :class="{ active: route.path === '/settings' }"
      :title="t('nav.settings')"
      @click="router.push('/settings')"
    >
      <Settings :size="20" />
    </button>
  </nav>
</template>

<style scoped>
.nav-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.nav-btn:hover {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}
.nav-btn.active {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}
.unread-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  border-radius: 7px;
  background: hsl(0 70% 55%);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  pointer-events: none;
}
</style>

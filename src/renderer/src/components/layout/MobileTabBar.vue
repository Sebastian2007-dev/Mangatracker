<script setup lang="ts">
import { useRouter, useRoute } from 'vue-router'
import { BookOpen, ChartColumn, Settings, ScrollText, Terminal, Globe } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useLogStore } from '../../stores/log.store'
import { useSkillTreeStore } from '../../stores/skill-tree.store'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const logStore = useLogStore()
const skillTreeStore = useSkillTreeStore()
</script>

<template>
  <nav
    class="tab-bar"
    style="background: hsl(var(--card)); border-color: hsl(var(--border))"
  >
    <!-- Library -->
    <button
      class="tab-btn"
      :class="{ active: route.path === '/' }"
      :aria-label="t('nav.library')"
      @click="router.push('/')"
    >
      <BookOpen :size="22" />
      <span class="tab-label">{{ t('nav.library') }}</span>
    </button>

    <!-- Log (chronicle skill) -->
    <button
      v-if="skillTreeStore.isUnlocked('chronicle')"
      class="tab-btn"
      :class="{ active: route.path === '/log' }"
      :aria-label="t('nav.log')"
      @click="router.push('/log')"
    >
      <div class="relative">
        <ScrollText :size="22" />
        <span v-if="logStore.unreadCount > 0 && route.path !== '/log'" class="unread-badge">
          {{ logStore.unreadCount > 99 ? '99+' : logStore.unreadCount }}
        </span>
      </div>
      <span class="tab-label">{{ t('nav.log') }}</span>
    </button>

    <!-- Statistics -->
    <button
      class="tab-btn"
      :class="{ active: route.path === '/statistics' }"
      :aria-label="t('nav.statistics')"
      @click="router.push('/statistics')"
    >
      <ChartColumn :size="22" />
      <span class="tab-label">{{ t('nav.statistics') }}</span>
    </button>

    <!-- Debug -->
    <button
      class="tab-btn"
      :class="{ active: route.path === '/debug' }"
      aria-label="Debug"
      @click="router.push('/debug')"
    >
      <Terminal :size="22" />
      <span class="tab-label">Debug</span>
    </button>

    <!-- Tracking -->
    <button
      class="tab-btn"
      :class="{ active: route.path === '/tracking' }"
      :aria-label="t('nav.tracking')"
      @click="router.push('/tracking')"
    >
      <Globe :size="22" />
      <span class="tab-label">{{ t('nav.tracking') }}</span>
    </button>

    <!-- Settings -->
    <button
      class="tab-btn"
      :class="{ active: route.path === '/settings' }"
      :aria-label="t('nav.settings')"
      @click="router.push('/settings')"
    >
      <Settings :size="22" />
      <span class="tab-label">{{ t('nav.settings') }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tab-bar {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-around;
  height: 64px;
  border-top: 1px solid;
  padding-bottom: env(safe-area-inset-bottom, 0);
  padding-left: env(safe-area-inset-left, 0px);
  padding-right: env(safe-area-inset-right, 0px);
  flex-shrink: 0;
}
/* Im Querformat: Tab-Bar kleiner, damit mehr Content-Platz bleibt */
@media (orientation: landscape) {
  .tab-bar {
    height: 48px;
  }
}
.tab-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex: 1;
  height: 100%;
  min-height: 44px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  transition: color 0.15s;
  padding: 0;
}
.tab-btn.active {
  color: hsl(var(--primary));
}
.tab-label {
  font-size: 10px;
  font-weight: 500;
  line-height: 1;
}
.unread-badge {
  position: absolute;
  top: -4px;
  right: -6px;
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

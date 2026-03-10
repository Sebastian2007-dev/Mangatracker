<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { TabId } from '../../types/index'

const { t } = useI18n()

const activeTab = defineModel<TabId>({ default: 'reading' })

const tabs: { key: TabId; label: string }[] = [
  { key: 'reading', label: 'tabs.reading' },
  { key: 'plan_to_read', label: 'tabs.plan_to_read' },
  { key: 'hiatus', label: 'tabs.hiatus' },
  { key: 'completed', label: 'tabs.completed' },
  { key: 'rereading', label: 'tabs.rereading' },
  { key: 'focus', label: 'tabs.focus' }
]
</script>

<template>
  <div
    class="flex gap-1 px-4 border-b shrink-0 overflow-x-auto"
    style="background: hsl(var(--card)); border-color: hsl(var(--border))"
  >
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tab-btn"
      :class="{ active: activeTab === tab.key }"
      @click="activeTab = tab.key"
    >
      {{ t(tab.label) }}
    </button>
  </div>
</template>

<style scoped>
.tab-btn {
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.tab-btn:hover {
  color: hsl(var(--foreground));
}
.tab-btn.active {
  color: hsl(var(--primary));
  border-bottom-color: hsl(var(--primary));
}
</style>

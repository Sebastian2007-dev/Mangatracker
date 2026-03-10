<script setup lang="ts">
import { onMounted } from 'vue'
import { Trash2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useLogStore } from '../stores/log.store'
import type { LogEntry } from '../../../types/index'

const { t } = useI18n()
const logStore = useLogStore()

onMounted(() => {
  logStore.markAllRead()
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  const DD = String(d.getDate()).padStart(2, '0')
  const MM = String(d.getMonth() + 1).padStart(2, '0')
  return `${DD}.${MM} ${hh}:${mm}:${ss}`
}

function typeClass(entry: LogEntry): string {
  return `log-entry log-${entry.type}`
}
</script>

<template>
  <div class="log-view">
    <!-- Header -->
    <div class="log-header">
      <span class="log-title">{{ t('log.title') }}</span>
      <button
        class="clear-btn"
        :title="t('log.clear')"
        :disabled="logStore.entries.length === 0"
        @click="logStore.clear()"
      >
        <Trash2 :size="14" />
        {{ t('log.clear') }}
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="logStore.entries.length === 0" class="log-empty">
      <p>{{ t('log.empty') }}</p>
    </div>

    <!-- Log entries -->
    <div v-else class="log-list">
      <div v-for="entry in logStore.entries" :key="entry.id" :class="typeClass(entry)">
        <span class="log-dot" />
        <span class="log-time">{{ formatTime(entry.timestamp) }}</span>
        <span class="log-msg">{{ entry.message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.log-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.log-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
}

.log-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.clear-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 5px;
  transition: background 0.1s, color 0.1s;
}

.clear-btn:hover:not(:disabled) {
  background: hsl(var(--destructive) / 0.15);
  color: hsl(0 70% 70%);
}

.clear-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.log-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}

.log-entry {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 16px;
  font-size: 12px;
  line-height: 1.5;
  transition: background 0.1s;
}

.log-entry:hover {
  background: hsl(var(--secondary) / 0.5);
}

.log-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 4px;
}

.log-time {
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
}

.log-msg {
  color: hsl(var(--foreground));
  word-break: break-word;
}

/* Type colours */
.log-info .log-dot {
  background: hsl(210 80% 60%);
}
.log-success .log-dot {
  background: hsl(142 70% 50%);
}
.log-success .log-msg {
  color: hsl(142 60% 60%);
}
.log-error .log-dot {
  background: hsl(0 70% 60%);
}
.log-error .log-msg {
  color: hsl(0 70% 65%);
}
.log-warning .log-dot {
  background: hsl(43 96% 56%);
}
.log-warning .log-msg {
  color: hsl(43 90% 60%);
}
</style>

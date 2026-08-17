<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useReaderStore } from '../../stores/reader.store'

const { t } = useI18n()
const reader = useReaderStore()

const percent = computed(() => {
  const p = reader.scrollPositionAvailable?.scrollPercent ?? 0
  return Math.round(p * 100)
})
</script>

<template>
  <div v-if="reader.scrollPositionAvailable" class="scroll-restore-bar">
    <span class="scroll-restore-text">
      {{ t('reader.scrollRestoreHint', { percent }) }}
    </span>
    <div class="scroll-restore-actions">
      <button class="btn-yes" @click="reader.restoreScrollPosition()">
        {{ t('reader.scrollRestoreYes') }}
      </button>
      <button class="btn-no" @click="reader.dismissScrollPosition()">
        {{ t('reader.scrollRestoreNo') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.scroll-restore-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 14px;
  height: 38px;
  background: hsl(var(--primary) / 0.12);
  border-bottom: 1px solid hsl(var(--primary) / 0.25);
  flex-shrink: 0;
}
.scroll-restore-text {
  font-size: 12px;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.scroll-restore-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.btn-yes,
.btn-no {
  height: 24px;
  padding: 0 10px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s, color 0.1s;
}
.btn-yes {
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}
.btn-yes:hover {
  background: hsl(var(--primary) / 0.85);
}
.btn-no {
  background: transparent;
  color: hsl(var(--muted-foreground));
  border-color: hsl(var(--border));
}
.btn-no:hover {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}
</style>

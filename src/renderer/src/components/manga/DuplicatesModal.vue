<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Manga } from '../../types/index'

defineProps<{ pairs: Array<[Manga, Manga]> }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="emit('close')">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">⚠ {{ t('manga.duplicatesTitle') }}</span>
          <button class="close-x" @click="emit('close')">✕</button>
        </div>

        <p class="hint">{{ t('manga.duplicatesHint') }}</p>

        <ul class="pair-list">
          <li v-for="([a, b], i) in pairs" :key="i" class="pair-row">
            <div class="pair-entry">
              <span class="entry-title">{{ a.title }}</span>
              <span class="entry-url">{{ a.mainUrl }}</span>
            </div>
            <span class="pair-vs">≈</span>
            <div class="pair-entry">
              <span class="entry-title">{{ b.title }}</span>
              <span class="entry-url">{{ b.mainUrl }}</span>
            </div>
          </li>
        </ul>

        <button class="close-btn" @click="emit('close')">{{ t('manga.duplicatesClose') }}</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 16px;
}
.modal {
  background: hsl(var(--card));
  border: 1px solid hsl(43 96% 40%);
  border-radius: 14px;
  width: min(480px, 100%);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 10px;
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
}
.modal-title {
  font-size: 14px;
  font-weight: 600;
  color: hsl(43 96% 56%);
}
.close-x {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  padding: 2px 6px;
  border-radius: 4px;
}
.close-x:hover { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }
.hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  padding: 10px 18px 4px;
  flex-shrink: 0;
  line-height: 1.5;
}
.pair-list {
  overflow-y: auto;
  flex: 1;
  list-style: none;
  padding: 8px 18px;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.pair-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: hsl(43 96% 56% / 0.07);
  border: 1px solid hsl(43 96% 56% / 0.2);
  border-radius: 8px;
}
.pair-entry {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.entry-title {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.entry-url {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
}
.pair-vs {
  font-size: 18px;
  color: hsl(43 96% 56%);
  flex-shrink: 0;
  font-weight: 700;
}
.close-btn {
  margin: 10px 18px 14px;
  padding: 9px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  flex-shrink: 0;
}
.close-btn:hover { background: hsl(var(--accent)); }
</style>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMangaStore } from '../../stores/manga.store'

const { t } = useI18n()
const mangaStore = useMangaStore()

const visible = computed(() => mangaStore.recentlyDeleted !== null)
</script>

<template>
  <Transition name="toast">
    <div v-if="visible" class="toast">
      <span class="text-sm" style="color: hsl(var(--foreground))">
        {{ t('manga.deleted') }}: <strong>{{ mangaStore.recentlyDeleted?.title }}</strong>
      </span>
      <button class="undo-btn" @click="mangaStore.undoDelete()">
        {{ t('manga.undo') }}
      </button>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-radius: 8px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  box-shadow: 0 4px 20px hsl(0 0% 0% / 0.4);
  z-index: 300;
  white-space: nowrap;
}
.undo-btn {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--primary));
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.1s;
}
.undo-btn:hover {
  background: hsl(var(--primary) / 0.15);
}
.toast-enter-active, .toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.toast-enter-from, .toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(10px);
}
</style>

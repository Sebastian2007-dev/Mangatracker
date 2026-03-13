<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { Manga } from '../../types/index'

defineProps<{ manga: Manga[] }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" @click.self="emit('close')">
      <div class="modal">
        <!-- Header -->
        <div class="modal-header">
          <span class="modal-title">{{ t('manga.scanResultTitle') }}</span>
          <button class="close-x" @click="emit('close')">✕</button>
        </div>

        <!-- Leere Liste -->
        <div v-if="manga.length === 0" class="empty">
          {{ t('manga.scanResultEmpty') }}
        </div>

        <!-- Manga-Liste -->
        <ul v-else class="manga-list">
          <li v-for="m in manga" :key="m.id" class="manga-row">
            <img
              v-if="m.mangaDexCoverUrl || m.comickCoverUrl"
              :src="(m.mangaDexCoverUrl ?? m.comickCoverUrl)!"
              class="cover"
              loading="lazy"
            />
            <div v-else class="cover-placeholder">
              {{ m.title.charAt(0).toUpperCase() }}
            </div>
            <div class="info">
              <span class="title">{{ m.title }}</span>
              <span class="chapter">{{ t('manga.scanResultChapter') }} {{ m.lastCheckedChapter }}</span>
            </div>
          </li>
        </ul>

        <!-- Footer -->
        <button class="close-btn" @click="emit('close')">
          {{ t('manga.scanResultClose') }}
        </button>
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
  z-index: 400;
  padding: 16px;
}
.modal {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  width: min(400px, 100%);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 12px;
  border-bottom: 1px solid hsl(var(--border));
  flex-shrink: 0;
}
.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.close-x {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: hsl(var(--muted-foreground));
  padding: 2px 6px;
  border-radius: 4px;
  line-height: 1;
}
.close-x:hover {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}
.empty {
  padding: 28px 18px;
  text-align: center;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}
.manga-list {
  overflow-y: auto;
  flex: 1;
  list-style: none;
  padding: 8px 0;
  margin: 0;
}
.manga-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 18px;
}
.manga-row:not(:last-child) {
  border-bottom: 1px solid hsl(var(--border) / 0.5);
}
.cover {
  width: 40px;
  height: 56px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
  background: hsl(var(--secondary));
}
.cover-placeholder {
  width: 40px;
  height: 56px;
  border-radius: 4px;
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
  font-size: 18px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.title {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chapter {
  font-size: 12px;
  color: hsl(var(--primary));
  font-weight: 500;
}
.close-btn {
  margin: 12px 18px 16px;
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
.close-btn:hover {
  background: hsl(var(--accent));
}
</style>

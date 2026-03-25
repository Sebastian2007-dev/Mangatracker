<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Trash2 } from 'lucide-vue-next'
import { useMangaStore } from '../stores/manga.store'
import { useSettingsStore } from '../stores/settings.store'
import DomainListManager from '../components/settings/DomainListManager.vue'
import { platformFeatures, isMobile } from '../composables/usePlatform'

const { t } = useI18n()
const mangaStore = useMangaStore()
const settings = useSettingsStore()

const detectionManga = computed(() =>
  mangaStore.items.filter((m) => !!m.chapterDetectionTemplate)
)

async function clearDetectionTemplate(id: string): Promise<void> {
  await mangaStore.update(id, { chapterDetectionTemplate: '' })
}

async function updateWhitelist(list: string[]): Promise<void> {
  await settings.save({ domainWhitelist: list })
}

async function updateBlocklist(list: string[]): Promise<void> {
  await settings.save({ domainBlocklist: list })
}
</script>

<template>
  <div class="tracking-view" :class="isMobile ? 'p-4' : 'p-6'">
    <div class="content-scroll">

      <!-- Detection URLs -->
      <section class="tracking-section">
        <h2 class="section-title">{{ t('tracking.detectionTemplates') }}</h2>
        <p class="section-hint">{{ t('tracking.detectionHint') }}</p>

        <div v-if="detectionManga.length === 0" class="empty-state">
          {{ t('tracking.noTemplates') }}
        </div>
        <div v-else class="detection-list">
          <div v-for="manga in detectionManga" :key="manga.id" class="detection-row">
            <div class="detection-info">
              <span class="detection-title">{{ manga.title }}</span>
              <span class="detection-url">{{ manga.chapterDetectionTemplate }}</span>
            </div>
            <button
              class="remove-btn"
              :title="t('tracking.clearTemplate')"
              @click="clearDetectionTemplate(manga.id)"
            >
              <Trash2 :size="14" />
            </button>
          </div>
        </div>
      </section>

      <!-- Domain management (desktop only) -->
      <template v-if="platformFeatures.hasDomainGuard">
        <section class="tracking-section">
          <DomainListManager
            :title="t('settings.domainWhitelist')"
            :model-value="settings.domainWhitelist"
            @update:model-value="updateWhitelist"
          />
        </section>

        <section class="tracking-section">
          <DomainListManager
            :title="t('settings.domainBlocklist')"
            :model-value="settings.domainBlocklist"
            @update:model-value="updateBlocklist"
          />
        </section>
      </template>

    </div>
  </div>
</template>

<style scoped>
.tracking-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.content-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  max-width: 640px;
}
.tracking-section {
  margin-bottom: 28px;
  padding-bottom: 28px;
  border-bottom: 1px solid hsl(var(--border));
}
.tracking-section:last-child {
  border-bottom: none;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}
.section-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  margin-bottom: 14px;
  line-height: 1.5;
}
.empty-state {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  padding: 8px 0;
}
.detection-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.detection-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
}
.detection-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.detection-title {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.detection-url {
  font-size: 11px;
  font-family: monospace;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.remove-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 5px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}
.remove-btn:hover {
  color: hsl(0 70% 65%);
  background: hsl(var(--destructive) / 0.2);
}
@media (orientation: landscape) {
  .tracking-view {
    padding-left: max(1rem, env(safe-area-inset-left, 0px));
    padding-right: max(1rem, env(safe-area-inset-right, 0px));
  }
}
</style>

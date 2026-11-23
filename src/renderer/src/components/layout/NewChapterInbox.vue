<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Bell, BookOpen, Check } from 'lucide-vue-next'
import type { Manga } from '../../types/index'
import { useMangaStore } from '../../stores/manga.store'
import { useReaderStore } from '../../stores/reader.store'
import { buildChapterUrl } from '../../composables/useChapterUrl'
import { coverUrlFor, onCoverError } from '../../composables/useCoverUrl'
import { isMobile } from '../../composables/usePlatform'
import { Browser } from '@capacitor/browser'

const { t } = useI18n()
const mangaStore = useMangaStore()
const readerStore = useReaderStore()

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)

const entries = computed(() => mangaStore.items.filter((m) => m.hasNewChapter))

function onOutsideClick(e: MouseEvent): void {
  if (rootEl.value && !rootEl.value.contains(e.target as Node)) {
    open.value = false
  }
}

watch(open, (v) => {
  if (v) document.addEventListener('click', onOutsideClick)
  else document.removeEventListener('click', onOutsideClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onOutsideClick)
})

async function openManga(manga: Manga): Promise<void> {
  open.value = false
  const nextChapter = Math.floor(manga.currentChapter) + 1
  const url = manga.chapterUrlTemplate
    ? buildChapterUrl(manga.chapterUrlTemplate, nextChapter)
    : manga.mainUrl
  if (isMobile) {
    await Browser.open({ url, presentationStyle: 'fullscreen' })
  } else {
    await readerStore.open(manga.id, url)
  }
}

async function markSeen(manga: Manga): Promise<void> {
  await mangaStore.clearNewChapter(manga.id)
}
</script>

<template>
  <div ref="rootEl" class="inbox-root">
    <button class="icon-btn" :title="t('inbox.title')" @click="open = !open">
      <Bell :size="16" />
      <span v-if="entries.length > 0" class="inbox-count">{{ entries.length > 9 ? '9+' : entries.length }}</span>
    </button>

    <Transition name="inbox-drop">
      <div v-if="open" class="inbox-panel">
        <p class="inbox-heading">{{ t('inbox.title') }}</p>

        <p v-if="entries.length === 0" class="inbox-empty">{{ t('inbox.empty') }}</p>

        <div v-else class="inbox-list">
          <div v-for="manga in entries" :key="manga.id" class="inbox-row">
            <img
              v-if="coverUrlFor(manga)"
              :key="coverUrlFor(manga)!"
              class="inbox-cover"
              :src="coverUrlFor(manga)!"
              :alt="manga.title"
              @error="onCoverError"
            />
            <div v-else class="inbox-cover inbox-cover-placeholder" />
            <div class="inbox-text">
              <p class="inbox-title" :title="manga.title">{{ manga.title }}</p>
              <p class="inbox-sub">
                {{ t('inbox.chapterAvailable', { chapter: manga.lastCheckedChapter || Math.floor(manga.currentChapter) + 1 }) }}
              </p>
            </div>
            <button class="inbox-action" :title="t('inbox.open')" @click="openManga(manga)">
              <BookOpen :size="14" />
            </button>
            <button class="inbox-action" :title="t('inbox.markSeen')" @click="markSeen(manga)">
              <Check :size="14" />
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.inbox-root {
  position: relative;
}
.icon-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: hsl(var(--muted-foreground));
  transition: background 0.15s, color 0.15s;
}
.icon-btn:hover {
  background: hsl(var(--muted) / 0.6);
  color: hsl(var(--foreground));
}
.inbox-count {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  border-radius: 999px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 10px;
  font-weight: 600;
  line-height: 15px;
  text-align: center;
}
.inbox-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 320px;
  max-width: 90vw;
  max-height: 420px;
  overflow-y: auto;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.25);
  padding: 10px;
  z-index: 60;
}
.inbox-heading {
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--foreground));
  padding: 2px 6px 8px;
}
.inbox-empty {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  padding: 6px;
}
.inbox-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.inbox-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px;
  border-radius: 8px;
}
.inbox-row:hover {
  background: hsl(var(--muted) / 0.4);
}
.inbox-cover {
  width: 30px;
  height: 42px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}
.inbox-cover-placeholder {
  background: hsl(var(--muted));
}
.inbox-text {
  flex: 1;
  min-width: 0;
}
.inbox-title {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.inbox-sub {
  font-size: 11px;
  color: hsl(var(--primary));
}
.inbox-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}
.inbox-action:hover {
  background: hsl(var(--muted) / 0.7);
  color: hsl(var(--foreground));
}
.inbox-drop-enter-active,
.inbox-drop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.inbox-drop-enter-from,
.inbox-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

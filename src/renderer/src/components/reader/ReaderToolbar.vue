<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronLeft, ChevronRight, RotateCw, X, Loader2 } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useReaderStore } from '../../stores/reader.store'

const { t } = useI18n()
const reader = useReaderStore()

const urlInput = ref(reader.currentUrl)

watch(() => reader.currentUrl, (url) => {
  urlInput.value = url
})

function navigateToUrl(): void {
  let url = urlInput.value.trim()
  if (!url.startsWith('http')) url = 'https://' + url
  reader.navigate(url)
}
</script>

<template>
  <div
    class="flex items-center gap-2 px-3 shrink-0"
    style="height: 48px; background: hsl(var(--card)); border-bottom: 1px solid hsl(var(--border)); position: relative; z-index: 50"
  >
    <!-- Back -->
    <button class="tb-btn" :disabled="!reader.canGoBack" @click="reader.goBack()">
      <ChevronLeft :size="16" />
    </button>

    <!-- Forward -->
    <button class="tb-btn" :disabled="!reader.canGoForward" @click="reader.goForward()">
      <ChevronRight :size="16" />
    </button>

    <!-- Reload -->
    <button class="tb-btn" @click="reader.reload()">
      <Loader2 v-if="reader.isLoading" :size="15" class="animate-spin" />
      <RotateCw v-else :size="15" />
    </button>

    <!-- URL bar -->
    <input
      v-model="urlInput"
      type="text"
      class="url-bar"
      @keydown.enter="navigateToUrl"
    />

    <!-- Close reader -->
    <button class="tb-btn close" :title="t('reader.close')" @click="reader.close()">
      <X :size="16" />
    </button>
  </div>
</template>

<style scoped>
.tb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: hsl(var(--muted-foreground));
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
}
.tb-btn:hover:not(:disabled) {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}
.tb-btn:disabled {
  opacity: 0.3;
  cursor: default;
}
.tb-btn.close:hover {
  background: hsl(var(--destructive) / 0.3);
  color: hsl(0 70% 70%);
}
.url-bar {
  flex: 1;
  height: 28px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 12px;
  background: hsl(var(--input));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  outline: none;
  min-width: 0;
}
.url-bar:focus {
  border-color: hsl(var(--primary));
}
</style>

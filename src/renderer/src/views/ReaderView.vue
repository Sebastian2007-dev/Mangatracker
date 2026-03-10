<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useReaderStore } from '../stores/reader.store'
import ReaderToolbar from '../components/reader/ReaderToolbar.vue'
import DomainGuardDialog from '../components/reader/DomainGuardDialog.vue'

const reader = useReaderStore()

let cleanupListeners: (() => void) | null = null

onMounted(() => {
  cleanupListeners = reader.setupListeners()
})

onUnmounted(() => {
  cleanupListeners?.()
})
</script>

<template>
  <!-- This overlay sits on top of the native WebContentsView.
       The actual web content is rendered by Electron below this div.
       Only the toolbar and dialogs are Vue-rendered. -->
  <div
    v-if="reader.isOpen"
    class="reader-overlay"
  >
    <ReaderToolbar />
    <!-- The area below toolbar is transparent — the native view shows through -->
    <div class="reader-content-area" />
    <DomainGuardDialog />
  </div>
</template>

<style scoped>
.reader-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  z-index: 40;
  pointer-events: none;
}
.reader-overlay > * {
  pointer-events: auto;
}
.reader-content-area {
  flex: 1;
  /* transparent — the native WebContentsView renders here */
  pointer-events: none;
}
</style>

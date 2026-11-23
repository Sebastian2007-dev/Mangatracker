<script setup lang="ts">
import { computed, ref, watch } from 'vue'

// Zeigt das Cover eines Mangas mit Quellen-Fallback: schlaegt MangaDex fehl
// (z. B. weil ein Netzwerkfilter uploads.mangadex.org blockt), wird automatisch
// auf das ComicK-Cover umgeschaltet. Sind alle Quellen tot, rendert der Slot
// den Platzhalter des jeweiligen Aufrufers statt eines kaputten Bild-Icons.
defineOptions({ inheritAttrs: false })

const props = defineProps<{
  mangaDexCoverUrl?: string
  comickCoverUrl?: string
  alt?: string
}>()

const candidates = computed(() =>
  [props.mangaDexCoverUrl, props.comickCoverUrl].filter((u): u is string => !!u)
)

const index = ref(0)
const src = computed<string | undefined>(() => candidates.value[index.value])

// Neue URLs (Manga verknuepft/entkoppelt) => wieder mit der ersten Quelle starten.
watch(
  () => [props.mangaDexCoverUrl, props.comickCoverUrl].join('|'),
  () => {
    index.value = 0
  }
)

// index laeuft bis candidates.length: dann greift der Slot-Platzhalter.
function onError(): void {
  index.value++
}
</script>

<template>
  <img v-if="src" v-bind="$attrs" :key="src" :src="src" :alt="alt" @error="onError" />
  <slot v-else />
</template>

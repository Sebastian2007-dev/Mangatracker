import { defineStore } from 'pinia'
import { ref } from 'vue'

const STORAGE_KEY = 'mangatracker:known_level'

export const useLevelUpStore = defineStore('levelUp', () => {
  const visible = ref(false)
  const oldLevel = ref(0)
  const newLevel = ref(0)

  function checkLevel(level: number): void {
    const stored = localStorage.getItem(STORAGE_KEY)

    // First time: silently store current level, no animation
    if (stored === null) {
      localStorage.setItem(STORAGE_KEY, String(level))
      return
    }

    const knownLevel = parseInt(stored, 10)
    if (level > knownLevel) {
      // Update stored level immediately to prevent double-triggering
      localStorage.setItem(STORAGE_KEY, String(level))
      oldLevel.value = knownLevel
      newLevel.value = level
      showWhenFocused()
    }
  }

  function showWhenFocused(): void {
    if (document.hasFocus()) {
      visible.value = true
      return
    }
    const onFocus = (): void => {
      window.removeEventListener('focus', onFocus)
      visible.value = true
    }
    window.addEventListener('focus', onFocus)
  }

  function forceShow(from: number, to: number): void {
    oldLevel.value = from
    newLevel.value = to
    visible.value = true
  }

  function dismiss(): void {
    visible.value = false
  }

  return { visible, oldLevel, newLevel, checkLevel, forceShow, dismiss }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { StatisticsAchievement } from '../types/index'

const STORAGE_KEY = 'mangatracker:seen_achievements'
const TOAST_DURATION_MS = 5000
const BETWEEN_TOAST_MS = 450

function getSeenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set<string>(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

function persistSeen(ids: string[]): void {
  try {
    const current = getSeenIds()
    for (const id of ids) current.add(id)
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...current]))
  } catch { /* ignore */ }
}

export const useAchievementToastStore = defineStore('achievementToast', () => {
  const queue = ref<StatisticsAchievement[]>([])
  const current = ref<StatisticsAchievement | null>(null)
  let dismissTimer: ReturnType<typeof setTimeout> | null = null
  let focusListenerActive = false

  function showNext(): void {
    if (queue.value.length === 0) {
      current.value = null
      return
    }
    if (!document.hasFocus()) {
      if (!focusListenerActive) {
        focusListenerActive = true
        const onFocus = (): void => {
          focusListenerActive = false
          window.removeEventListener('focus', onFocus)
          showNext()
        }
        window.addEventListener('focus', onFocus)
      }
      return
    }
    current.value = queue.value.shift()!
    if (dismissTimer !== null) clearTimeout(dismissTimer)
    dismissTimer = setTimeout(dismiss, TOAST_DURATION_MS)
  }

  function dismiss(): void {
    if (dismissTimer !== null) { clearTimeout(dismissTimer); dismissTimer = null }
    current.value = null
    if (queue.value.length > 0) {
      setTimeout(showNext, BETWEEN_TOAST_MS)
    }
  }

  function checkNew(achievements: StatisticsAchievement[]): void {
    const unlockedAchievements = achievements.filter((a) => a.unlocked)

    // First time this feature runs: silently mark all current achievements as seen
    if (localStorage.getItem(STORAGE_KEY) === null) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(unlockedAchievements.map((a) => a.id)))
      return
    }

    const seen = getSeenIds()
    const newlyUnlocked = unlockedAchievements.filter((a) => !seen.has(a.id))
    if (newlyUnlocked.length === 0) return

    persistSeen(newlyUnlocked.map((a) => a.id))
    queue.value.push(...newlyUnlocked)
    if (!current.value) showNext()
  }

  function forceShow(id: string, icon: string): void {
    queue.value.push({ id, icon, name: id, hint: '', unlocked: true })
    if (!current.value) showNext()
  }

  return { current, checkNew, forceShow, dismiss }
})

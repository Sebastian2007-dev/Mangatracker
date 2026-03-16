import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { StatisticsAchievement } from '../../../types/index'
import { SKILLS, calcBonusSP, canUnlock, getMaxFocusSlots, hasSkill } from '../../../shared/skill-tree'

const STORAGE_KEY = 'mangatracker:skill_tree'

export const useSkillTreeStore = defineStore('skillTree', () => {
  const unlockedSkills = ref<string[]>([])
  const bonusSP = ref(0)

  // ── Persistence ───────────────────────────────────────────────────

  function load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as { unlockedSkills?: unknown; bonusSP?: unknown }
      if (Array.isArray(parsed.unlockedSkills)) {
        unlockedSkills.value = parsed.unlockedSkills.filter((s): s is string => typeof s === 'string')
      }
    } catch {
      // ignore corrupt data
    }
  }

  function save(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlockedSkills: unlockedSkills.value }))
  }

  // ── Computed ──────────────────────────────────────────────────────

  const spentPoints = computed(() =>
    unlockedSkills.value.reduce((sum, id) => {
      const skill = SKILLS.find((s) => s.id === id)
      return sum + (skill?.cost ?? 0)
    }, 0)
  )

  function totalSP(level: number): number {
    return level + bonusSP.value
  }

  function availableSP(level: number): number {
    return totalSP(level) - spentPoints.value
  }

  const maxFocusSlots = computed(() => getMaxFocusSlots(unlockedSkills.value))

  function isUnlocked(id: string): boolean {
    return hasSkill(unlockedSkills.value, id)
  }

  function isAvailable(id: string, level: number): boolean {
    return canUnlock(unlockedSkills.value, id, level, availableSP(level))
  }

  // ── Actions ───────────────────────────────────────────────────────

  function unlockSkill(id: string, level: number): boolean {
    if (!canUnlock(unlockedSkills.value, id, level, availableSP(level))) return false
    unlockedSkills.value = [...unlockedSkills.value, id]
    save()
    return true
  }

  function updateBonusSP(achievements: StatisticsAchievement[]): void {
    bonusSP.value = calcBonusSP(achievements)
  }

  function reset(): void {
    unlockedSkills.value = []
    bonusSP.value = 0
    localStorage.removeItem(STORAGE_KEY)
  }

  // Load on store creation
  load()

  return {
    unlockedSkills,
    bonusSP,
    spentPoints,
    maxFocusSlots,
    totalSP,
    availableSP,
    isUnlocked,
    isAvailable,
    unlockSkill,
    updateBonusSP,
    reset,
    load,
    save
  }
})

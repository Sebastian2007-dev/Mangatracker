import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { SkillTreeState, StatisticsAchievement } from '../../../types/index'
import {
  SKILLS,
  calcBonusSP,
  canUnlock,
  getMaxFocusSlots,
  hasSkill,
  normalizeUnlockedSkills
} from '../../../shared/skill-tree'
import { getBridge } from '../services/platform'

// Alter Speicherort: der Baum lag nur im localStorage des Renderers und war damit
// weder fuer den Main-Prozess noch fuer den Gist-Sync erreichbar. Wird beim ersten
// load() in den plattform-Store uebernommen und danach entfernt.
const LEGACY_STORAGE_KEY = 'mangatracker:skill_tree'

export const useSkillTreeStore = defineStore('skillTree', () => {
  const api = getBridge()
  const unlockedSkills = ref<string[]>([])
  const bonusSP = ref(0)

  // ── Persistence ───────────────────────────────────────────────────

  function readLegacySkills(): string[] {
    try {
      const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as { unlockedSkills?: unknown }
      return Array.isArray(parsed.unlockedSkills)
        ? parsed.unlockedSkills.filter((s): s is string => typeof s === 'string')
        : []
    } catch {
      return []
    }
  }

  /**
   * Laedt den Baum und wirft dabei nie.
   *
   * load() laeuft beim App-Start vor mangaStore.fetchAll() (die Focus-Obergrenze
   * haengt an den Skills). Eine Exception hier wuerde den restlichen onMounted-Block
   * mitreissen — keine Bibliothek, keine Listener. Der Baum ist Kosmetik; er darf
   * den Start nicht blockieren, also bleibt es im Fehlerfall beim leeren Stand.
   */
  async function load(): Promise<void> {
    try {
      const result = await api.invoke<{ success: boolean; data?: SkillTreeState }>('skillTree:get')
      const stored = result?.success && result.data ? result.data.unlockedSkills : []
      const legacy = readLegacySkills()
      const combined = legacy.length > 0 ? [...stored, ...legacy] : stored

      // Alte IDs aus der Zeit, als der Baum Kernfunktionen gesperrt hat, migrieren
      // bzw. verwerfen — verworfene Skills geben ihre SP damit wieder frei.
      const normalized = normalizeUnlockedSkills(combined)
      unlockedSkills.value = normalized

      // Nur zurueckschreiben, wenn sich tatsaechlich etwas geaendert hat
      const changed =
        normalized.length !== stored.length || normalized.some((id) => !stored.includes(id))
      if (changed) await save()

      if (legacy.length > 0) {
        try {
          localStorage.removeItem(LEGACY_STORAGE_KEY)
        } catch {
          // localStorage nicht verfuegbar — Migration hat trotzdem gegriffen
        }
      }
    } catch (error) {
      console.error('Skill-Tree konnte nicht geladen werden:', error)
    }
  }

  async function save(): Promise<void> {
    await api.invoke('skillTree:set', {
      unlockedSkills: unlockedSkills.value,
      version: 1
    } satisfies SkillTreeState)
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
    // Nie negativ — z. B. wenn Bonus-SP-Quellen (Achievements) nachträglich wegfallen
    return Math.max(0, totalSP(level) - spentPoints.value)
  }

  const maxFocusSlots = computed(() => getMaxFocusSlots(unlockedSkills.value))

  function isUnlocked(id: string): boolean {
    return hasSkill(unlockedSkills.value, id)
  }

  function isAvailable(id: string, level: number): boolean {
    return canUnlock(unlockedSkills.value, id, level, availableSP(level))
  }

  // ── Actions ───────────────────────────────────────────────────────

  async function unlockSkill(id: string, level: number): Promise<boolean> {
    if (!canUnlock(unlockedSkills.value, id, level, availableSP(level))) return false
    const previous = unlockedSkills.value
    unlockedSkills.value = [...previous, id]
    try {
      await save()
    } catch (error) {
      // Persistenz fehlgeschlagen — zuruecknehmen, sonst zeigt die UI einen Skill
      // als freigeschaltet, der nach dem naechsten Start wieder weg ist.
      unlockedSkills.value = previous
      console.error('Skill konnte nicht gespeichert werden:', error)
      return false
    }
    return true
  }

  function updateBonusSP(achievements: StatisticsAchievement[]): void {
    bonusSP.value = calcBonusSP(achievements)
  }

  async function reset(): Promise<void> {
    unlockedSkills.value = []
    bonusSP.value = 0
    await save()
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // ignorieren
    }
  }

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

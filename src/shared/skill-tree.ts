import type { StatisticsAchievement } from '../types/index'

export type SkillBranch = 'focus' | 'archive' | 'analytics' | 'library' | 'profile'

export interface SkillDefinition {
  id: string
  name: string
  description: string
  icon: string
  cost: number
  requiresLevel: number
  requiresSkills: string[]
  branch: SkillBranch
  tier: 1 | 2 | 3 | 4
}

export const SKILLS: SkillDefinition[] = [
  // ── Branch 1: Fokus ─────────────────────────────────────────────
  {
    id: 'focus_1',
    name: 'Fokus-Erweiterung I',
    description: 'Erhöhe die maximale Anzahl an Focus-Slots von 3 auf 4.',
    icon: 'Target',
    cost: 2,
    requiresLevel: 3,
    requiresSkills: [],
    branch: 'focus',
    tier: 1
  },
  {
    id: 'focus_2',
    name: 'Fokus-Erweiterung II',
    description: 'Erhöhe die maximale Anzahl an Focus-Slots von 4 auf 5.',
    icon: 'Target',
    cost: 3,
    requiresLevel: 7,
    requiresSkills: ['focus_1'],
    branch: 'focus',
    tier: 2
  },
  {
    id: 'focus_3',
    name: 'Fokus-Erweiterung III',
    description: 'Erhöhe die maximale Anzahl an Focus-Slots von 5 auf 6.',
    icon: 'Target',
    cost: 5,
    requiresLevel: 12,
    requiresSkills: ['focus_2'],
    branch: 'focus',
    tier: 3
  },
  {
    id: 'focus_4',
    name: 'Fokus-Meister',
    description: 'Maximiere deine Focus-Kapazität auf 8 Slots — für wahre Leser.',
    icon: 'Target',
    cost: 8,
    requiresLevel: 18,
    requiresSkills: ['focus_3'],
    branch: 'focus',
    tier: 4
  },

  // ── Branch 2: Archiv ─────────────────────────────────────────────
  {
    id: 'bookmark',
    name: 'Lesezeichen',
    description: 'Speichere ein Lieblingskapitel separat vom aktuellen Kapitel für jeden Manga.',
    icon: 'Bookmark',
    cost: 2,
    requiresLevel: 4,
    requiresSkills: [],
    branch: 'archive',
    tier: 1
  },
  {
    id: 'note',
    name: 'Lesenotiz',
    description: 'Hinterlasse persönliche Notizen zu jedem Manga.',
    icon: 'FileText',
    cost: 3,
    requiresLevel: 7,
    requiresSkills: ['bookmark'],
    branch: 'archive',
    tier: 2
  },
  {
    id: 'history',
    name: 'Kapitel-Verlauf',
    description: 'Zeige die letzten 5 gelesenen Kapitel pro Manga an.',
    icon: 'History',
    cost: 5,
    requiresLevel: 11,
    requiresSkills: ['note'],
    branch: 'archive',
    tier: 3
  },
  {
    id: 'journal',
    name: 'Manga-Tagebuch',
    description: 'Erweitertes Notizfeld mit persönlicher Bewertung (1–5 Sterne) pro Manga.',
    icon: 'BookMarked',
    cost: 7,
    requiresLevel: 17,
    requiresSkills: ['history'],
    branch: 'archive',
    tier: 4
  },

  // ── Branch 3: Analytik ───────────────────────────────────────────
  {
    id: 'tag_insights',
    name: 'Tag-Analyse',
    description: 'Schalte erweiterte Genre-Statistiken in der Statistik-Ansicht frei.',
    icon: 'BarChart3',
    cost: 2,
    requiresLevel: 5,
    requiresSkills: [],
    branch: 'analytics',
    tier: 1
  },
  {
    id: 'heatmap',
    name: 'Aktivitäts-Karte',
    description: 'Zeige einen Aktivitäts-Kalender mit täglicher Leseintensität.',
    icon: 'CalendarDays',
    cost: 3,
    requiresLevel: 9,
    requiresSkills: ['tag_insights'],
    branch: 'analytics',
    tier: 2
  },
  {
    id: 'deep_stats',
    name: 'Tiefenanalyse',
    description: 'Schalte alle versteckten Rekorde und detaillierte Verlaufsstatistiken frei.',
    icon: 'TrendingUp',
    cost: 4,
    requiresLevel: 13,
    requiresSkills: ['heatmap'],
    branch: 'analytics',
    tier: 3
  },
  {
    id: 'forecast',
    name: 'Prophezeiung',
    description: 'Berechne deine durchschnittliche Lesegeschwindigkeit und Prognosen.',
    icon: 'Telescope',
    cost: 6,
    requiresLevel: 18,
    requiresSkills: ['deep_stats'],
    branch: 'analytics',
    tier: 4
  },

  // ── Branch 4: Bibliothek ─────────────────────────────────────────
  {
    id: 'adv_search',
    name: 'Erweiterte Suche',
    description: 'Durchsuche deine Bibliothek nach Tags, Status und Kapitelbereich.',
    icon: 'SearchCheck',
    cost: 2,
    requiresLevel: 5,
    requiresSkills: [],
    branch: 'library',
    tier: 1
  },
  {
    id: 'filter_presets',
    name: 'Filter-Profile',
    description: 'Speichere häufig genutzte Filterkombinationen als benannte Profile.',
    icon: 'SlidersHorizontal',
    cost: 3,
    requiresLevel: 8,
    requiresSkills: ['adv_search'],
    branch: 'library',
    tier: 2
  },
  {
    id: 'export_list',
    name: 'Listen-Export',
    description: 'Exportiere deine Bibliothek als JSON- oder CSV-Datei.',
    icon: 'Download',
    cost: 4,
    requiresLevel: 12,
    requiresSkills: ['filter_presets'],
    branch: 'library',
    tier: 3
  },
  {
    id: 'chronicle',
    name: 'Bibliotheks-Chronik',
    description: 'Durchsuche die vollständige Aktivitäts-Timeline deiner Bibliothek.',
    icon: 'ScrollText',
    cost: 6,
    requiresLevel: 16,
    requiresSkills: ['export_list'],
    branch: 'library',
    tier: 4
  },

  // ── Branch 5: Profil ─────────────────────────────────────────────
  {
    id: 'avatar_frame',
    name: 'Profil-Rahmen',
    description: 'Verleihe deinem Avatar einen leuchtenden Rahmen in der Statistik-Ansicht.',
    icon: 'Sparkles',
    cost: 2,
    requiresLevel: 6,
    requiresSkills: [],
    branch: 'profile',
    tier: 1
  },
  {
    id: 'custom_title',
    name: 'Benutzertitel',
    description: 'Füge deinem Profil einen individuellen Titel hinzu.',
    icon: 'Pen',
    cost: 3,
    requiresLevel: 10,
    requiresSkills: ['avatar_frame'],
    branch: 'profile',
    tier: 2
  },
  {
    id: 'extra_theme',
    name: 'Sonder-Thema',
    description: 'Schalte zusätzliche Farbschemata frei (Sepia, Mitternacht, Wald).',
    icon: 'Palette',
    cost: 5,
    requiresLevel: 14,
    requiresSkills: ['custom_title'],
    branch: 'profile',
    tier: 3
  },
  {
    id: 'legendary',
    name: 'Legendärer Status',
    description: 'Schalte besondere Partikeleffekte und ein Glanz-Overlay für dein Profil frei.',
    icon: 'Crown',
    cost: 8,
    requiresLevel: 19,
    requiresSkills: ['extra_theme'],
    branch: 'profile',
    tier: 4
  }
]

// SP earned per achievement unlock (0 = no bonus)
export const ACHIEVEMENT_SP: Record<string, number> = {
  // Library milestones
  first_steps: 0,
  bookworm: 1,
  manga_addict: 1,
  grand_library: 2,
  manga_baron: 2,
  library_king: 3,
  // Chapter milestones
  chapter_rookie: 1,
  speed_reader: 1,
  thousand_club: 2,
  binge_mode: 2,
  chapter_master: 3,
  chapter_god: 3,
  // Tag milestones
  tag_explorer: 0,
  tag_connoisseur: 1,
  tag_master: 1,
  // Completion milestones
  completer: 0,
  series_ender: 1,
  completionist: 2,
  // Behavior
  planner: 0,
  hoarder: 1,
  in_the_zone: 0,
  multitasker: 1,
  rereader: 0,
  on_focus: 1,
  // Streaks & time
  daily_reader: 0,
  on_a_roll: 1,
  marathon: 2,
  week_warrior: 0,
  regular: 1,
  veteran: 2,
  dedicated: 3,
  // Level (no bonus — SP already comes from leveling)
  apprentice: 0,
  adept: 0,
  elite_reader: 0,
  legend: 0,
  // Links
  mdx_enthusiast: 0,
  comic_k_fan: 0,
  fully_linked: 1,
  cross_platform: 1,
  cloud_sync: 1
}

export const FOCUS_BASE = 3
export const FOCUS_PER_TIER: Record<string, number> = {
  focus_1: 1,
  focus_2: 1,
  focus_3: 1,
  focus_4: 2
}

export function getMaxFocusSlots(unlockedSkills: string[]): number {
  return unlockedSkills.reduce(
    (total, id) => total + (FOCUS_PER_TIER[id] ?? 0),
    FOCUS_BASE
  )
}

export function hasSkill(unlockedSkills: string[], id: string): boolean {
  return unlockedSkills.includes(id)
}

export function canUnlock(
  unlockedSkills: string[],
  id: string,
  level: number,
  availableSP: number
): boolean {
  if (unlockedSkills.includes(id)) return false
  const skill = SKILLS.find((s) => s.id === id)
  if (!skill) return false
  if (level < skill.requiresLevel) return false
  if (availableSP < skill.cost) return false
  return skill.requiresSkills.every((req) => unlockedSkills.includes(req))
}

export function calcBonusSP(achievements: StatisticsAchievement[]): number {
  return achievements
    .filter((a) => a.unlocked)
    .reduce((sum, a) => sum + (ACHIEVEMENT_SP[a.id] ?? 0), 0)
}

export const SKILLS_BY_BRANCH: Record<SkillBranch, SkillDefinition[]> = {
  focus: SKILLS.filter((s) => s.branch === 'focus'),
  archive: SKILLS.filter((s) => s.branch === 'archive'),
  analytics: SKILLS.filter((s) => s.branch === 'analytics'),
  library: SKILLS.filter((s) => s.branch === 'library'),
  profile: SKILLS.filter((s) => s.branch === 'profile')
}

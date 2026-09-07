import type { StatisticsAchievement } from '../types/index'

export type SkillBranch = 'focus' | 'palette' | 'card' | 'ambient' | 'profile'

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

// Der Baum vergibt ausschliesslich Focus-Slots und Kosmetik. Funktionen, die zum
// Kern der App gehoeren (Suche, Filter, Export/Import, Lesezeichen, Notizen,
// Statistik-Panels), sind immer verfuegbar und stehen bewusst nicht hier.
export const SKILLS: SkillDefinition[] = [
  // ── Branch 1: Fokus — mehr Focus-Slots (3 → 8) ───────────────────
  {
    id: 'focus_1',
    name: 'Fokus-Erweiterung I',
    description: 'Erhöhe die maximale Anzahl an Focus-Slots von 3 auf 4.',
    icon: 'Target',
    cost: 1,
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
    cost: 2,
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
    cost: 3,
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
    cost: 4,
    requiresLevel: 18,
    requiresSkills: ['focus_3'],
    branch: 'focus',
    tier: 4
  },

  // ── Branch 2: Palette — Akzentfarbe der gesamten App ─────────────
  {
    id: 'palette_ember',
    name: 'Palette: Glut',
    description: 'Schalte die Akzentfarbe "Glut" frei — warmes Orange-Rot.',
    icon: 'Flame',
    cost: 1,
    requiresLevel: 2,
    requiresSkills: [],
    branch: 'palette',
    tier: 1
  },
  {
    id: 'palette_ocean',
    name: 'Palette: Ozean',
    description: 'Schalte die Akzentfarbe "Ozean" frei — kühles Türkis-Blau.',
    icon: 'Waves',
    cost: 2,
    requiresLevel: 6,
    requiresSkills: ['palette_ember'],
    branch: 'palette',
    tier: 2
  },
  {
    id: 'palette_forest',
    name: 'Palette: Wald',
    description: 'Schalte die Akzentfarbe "Wald" frei — tiefes Smaragdgrün.',
    icon: 'Trees',
    cost: 3,
    requiresLevel: 11,
    requiresSkills: ['palette_ocean'],
    branch: 'palette',
    tier: 3
  },
  {
    id: 'palette_gold',
    name: 'Palette: Gold',
    description: 'Schalte die Akzentfarbe "Gold" frei — legendäres Bernsteingold.',
    icon: 'Crown',
    cost: 4,
    requiresLevel: 16,
    requiresSkills: ['palette_forest'],
    branch: 'palette',
    tier: 4
  },

  // ── Branch 3: Karten-Design — Optik der Manga-Karten ─────────────
  {
    id: 'card_glow',
    name: 'Karten-Glanz',
    description: 'Manga-Karten leuchten beim Überfahren in der Akzentfarbe.',
    icon: 'Sparkle',
    cost: 1,
    requiresLevel: 3,
    requiresSkills: [],
    branch: 'card',
    tier: 1
  },
  {
    id: 'card_gradient',
    name: 'Karten-Verlauf',
    description: 'Karten erhalten einen weichen Farbverlauf in der Akzentfarbe.',
    icon: 'Blend',
    cost: 2,
    requiresLevel: 7,
    requiresSkills: ['card_glow'],
    branch: 'card',
    tier: 2
  },
  {
    id: 'card_frame',
    name: 'Karten-Rahmen',
    description: 'Karten bekommen einen feinen Rahmen in der Akzentfarbe.',
    icon: 'Frame',
    cost: 3,
    requiresLevel: 12,
    requiresSkills: ['card_gradient'],
    branch: 'card',
    tier: 3
  },
  {
    id: 'card_holo',
    name: 'Holo-Karten',
    description: 'Karten schimmern in einem beweglichen Regenbogen-Effekt.',
    icon: 'Gem',
    cost: 4,
    requiresLevel: 17,
    requiresSkills: ['card_frame'],
    branch: 'card',
    tier: 4
  },

  // ── Branch 4: Ambiente — Hintergrund & Bewegung ──────────────────
  {
    id: 'ambient_grain',
    name: 'Filmkorn',
    description: 'Legt eine feine Korn-Textur über den Hintergrund.',
    icon: 'Grip',
    cost: 1,
    requiresLevel: 4,
    requiresSkills: [],
    branch: 'ambient',
    tier: 1
  },
  {
    id: 'ambient_aurora',
    name: 'Aurora',
    description: 'Ein langsam wandernder Farbschimmer im Hintergrund.',
    icon: 'Sunrise',
    cost: 2,
    requiresLevel: 8,
    requiresSkills: ['ambient_grain'],
    branch: 'ambient',
    tier: 2
  },
  {
    id: 'ambient_motion',
    name: 'Sanfte Bewegung',
    description: 'Weichere, längere Übergänge in der gesamten Oberfläche.',
    icon: 'Wind',
    cost: 3,
    requiresLevel: 13,
    requiresSkills: ['ambient_aurora'],
    branch: 'ambient',
    tier: 3
  },
  {
    id: 'ambient_stars',
    name: 'Sternenfeld',
    description: 'Ein ruhiges, funkelndes Sternenfeld hinter der Oberfläche.',
    icon: 'MoonStar',
    cost: 4,
    requiresLevel: 18,
    requiresSkills: ['ambient_motion'],
    branch: 'ambient',
    tier: 4
  },

  // ── Branch 5: Profil — Auftritt in der Statistik-Ansicht ─────────
  {
    id: 'avatar_frame',
    name: 'Profil-Rahmen',
    description: 'Verleihe deinem Avatar einen leuchtenden Rahmen.',
    icon: 'Sparkles',
    cost: 1,
    requiresLevel: 2,
    requiresSkills: [],
    branch: 'profile',
    tier: 1
  },
  {
    id: 'custom_title',
    name: 'Benutzertitel',
    description: 'Füge deinem Profil einen individuellen Titel hinzu.',
    icon: 'Pen',
    cost: 2,
    requiresLevel: 5,
    requiresSkills: ['avatar_frame'],
    branch: 'profile',
    tier: 2
  },
  {
    id: 'profile_aura',
    name: 'Profil-Aura',
    description: 'Eine pulsierende Aura in der Akzentfarbe hinter dem Avatar.',
    icon: 'Orbit',
    cost: 3,
    requiresLevel: 10,
    requiresSkills: ['custom_title'],
    branch: 'profile',
    tier: 3
  },
  {
    id: 'profile_legendary',
    name: 'Legendärer Status',
    description: 'Partikeleffekte und ein Glanz-Overlay für dein Profil.',
    icon: 'Crown',
    cost: 4,
    requiresLevel: 15,
    requiresSkills: ['profile_aura'],
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

/** Gesamtkosten aller Skills — muss im SP-Budget liegen, damit der Baum komplett wird. */
export const TOTAL_SKILL_COST = SKILLS.reduce((sum, skill) => sum + skill.cost, 0)

export function getMaxFocusSlots(unlockedSkills: string[]): number {
  return unlockedSkills.reduce(
    (total, id) => total + (FOCUS_PER_TIER[id] ?? 0),
    FOCUS_BASE
  )
}

export function hasSkill(unlockedSkills: string[], id: string): boolean {
  return unlockedSkills.includes(id)
}

/**
 * Umbenennungen aus der Zeit, als der Baum noch Kernfunktionen freigeschaltet hat.
 * Nur Skills mit gleicher Rolle werden uebertragen; alle uebrigen alten IDs fallen
 * weg — die dafuer ausgegebenen SP stehen damit automatisch wieder zur Verfuegung,
 * weil spentPoints nur bekannte Skills zaehlt.
 */
export const LEGACY_SKILL_RENAMES: Record<string, string> = {
  legendary: 'profile_legendary'
}

/** Migriert alte IDs und entfernt solche, die es im aktuellen Baum nicht mehr gibt. */
export function normalizeUnlockedSkills(unlockedSkills: string[]): string[] {
  const known = new Set(SKILLS.map((skill) => skill.id))
  const migrated = unlockedSkills.map((id) => LEGACY_SKILL_RENAMES[id] ?? id)
  return [...new Set(migrated.filter((id) => known.has(id)))]
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
  palette: SKILLS.filter((s) => s.branch === 'palette'),
  card: SKILLS.filter((s) => s.branch === 'card'),
  ambient: SKILLS.filter((s) => s.branch === 'ambient'),
  profile: SKILLS.filter((s) => s.branch === 'profile')
}

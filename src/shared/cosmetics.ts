/**
 * Kosmetik-Optionen des Skill-Trees.
 *
 * Jede Option nennt die Skill-ID, die sie freischaltet (`requiresSkill: null` =
 * immer verfuegbar). Die Auswahl selbst liegt in den AppSettings und wird vom
 * Renderer als data-Attribut auf <html> gesetzt; das CSS in main.css haengt daran.
 */

export type AccentPalette = 'default' | 'ember' | 'ocean' | 'forest' | 'gold'
export type CardStyle = 'plain' | 'glow' | 'gradient' | 'frame' | 'holo'
export type AmbientEffect = 'none' | 'grain' | 'aurora' | 'motion' | 'stars'
export type ProfileEffect = 'none' | 'aura' | 'legendary'

export interface CosmeticOption<T extends string> {
  value: T
  /** Skill, der die Option freischaltet — null heisst: von Anfang an nutzbar. */
  requiresSkill: string | null
}

export const ACCENT_PALETTES: CosmeticOption<AccentPalette>[] = [
  { value: 'default', requiresSkill: null },
  { value: 'ember', requiresSkill: 'palette_ember' },
  { value: 'ocean', requiresSkill: 'palette_ocean' },
  { value: 'forest', requiresSkill: 'palette_forest' },
  { value: 'gold', requiresSkill: 'palette_gold' }
]

export const CARD_STYLES: CosmeticOption<CardStyle>[] = [
  { value: 'plain', requiresSkill: null },
  { value: 'glow', requiresSkill: 'card_glow' },
  { value: 'gradient', requiresSkill: 'card_gradient' },
  { value: 'frame', requiresSkill: 'card_frame' },
  { value: 'holo', requiresSkill: 'card_holo' }
]

export const AMBIENT_EFFECTS: CosmeticOption<AmbientEffect>[] = [
  { value: 'none', requiresSkill: null },
  { value: 'grain', requiresSkill: 'ambient_grain' },
  { value: 'aurora', requiresSkill: 'ambient_aurora' },
  { value: 'motion', requiresSkill: 'ambient_motion' },
  { value: 'stars', requiresSkill: 'ambient_stars' }
]

export const PROFILE_EFFECTS: CosmeticOption<ProfileEffect>[] = [
  { value: 'none', requiresSkill: null },
  { value: 'aura', requiresSkill: 'profile_aura' },
  { value: 'legendary', requiresSkill: 'profile_legendary' }
]

export function isCosmeticUnlocked<T extends string>(
  option: CosmeticOption<T>,
  unlockedSkills: string[]
): boolean {
  return option.requiresSkill === null || unlockedSkills.includes(option.requiresSkill)
}

/**
 * Faellt auf die Standard-Option zurueck, wenn die gewaehlte nicht (mehr)
 * freigeschaltet ist — etwa nach einem `skills reset` oder einem Sync von
 * einem Geraet mit weniger Skills.
 */
export function resolveCosmetic<T extends string>(
  options: CosmeticOption<T>[],
  selected: T | undefined,
  unlockedSkills: string[]
): T {
  const match = options.find((option) => option.value === selected)
  if (match && isCosmeticUnlocked(match, unlockedSkills)) return match.value
  return options[0].value
}

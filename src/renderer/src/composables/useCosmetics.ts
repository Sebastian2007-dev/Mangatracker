import { watchEffect } from 'vue'
import { useSettingsStore } from '../stores/settings.store'
import { useSkillTreeStore } from '../stores/skill-tree.store'
import {
  ACCENT_PALETTES,
  AMBIENT_EFFECTS,
  CARD_STYLES,
  PROFILE_EFFECTS,
  resolveCosmetic
} from '../../../shared/cosmetics'

/**
 * Spiegelt die gewaehlte Kosmetik als data-Attribute auf <html> bzw. <body>;
 * das CSS in main.css haengt daran.
 *
 * resolveCosmetic() faellt auf die Standard-Option zurueck, wenn der noetige
 * Skill (noch) nicht freigeschaltet ist — etwa nach `skills reset` oder einem
 * Sync von einem Geraet mit weniger Skills. So bleibt nie ein Effekt aktiv,
 * der nicht bezahlt ist.
 */
export function useCosmetics(): void {
  const settings = useSettingsStore()
  const skillTree = useSkillTreeStore()

  watchEffect(() => {
    const root = document.documentElement
    const unlocked = skillTree.unlockedSkills

    const palette = resolveCosmetic(ACCENT_PALETTES, settings.accentPalette, unlocked)
    const cardStyle = resolveCosmetic(CARD_STYLES, settings.cardStyle, unlocked)
    const ambient = resolveCosmetic(AMBIENT_EFFECTS, settings.ambientEffect, unlocked)
    const profileFx = resolveCosmetic(PROFILE_EFFECTS, settings.profileEffect, unlocked)

    // Standardwerte setzen kein Attribut — so bleiben die Basis-CSS-Regeln unberuehrt
    if (palette === 'default') root.removeAttribute('data-palette')
    else root.setAttribute('data-palette', palette)

    if (cardStyle === 'plain') root.removeAttribute('data-card-style')
    else root.setAttribute('data-card-style', cardStyle)

    if (profileFx === 'none') root.removeAttribute('data-profile-fx')
    else root.setAttribute('data-profile-fx', profileFx)

    // "motion" wirkt ueber :root, die Hintergrund-Overlays ueber body
    if (ambient === 'motion') {
      root.setAttribute('data-ambient', 'motion')
      document.body.removeAttribute('data-ambient')
    } else {
      root.removeAttribute('data-ambient')
      if (ambient === 'none') document.body.removeAttribute('data-ambient')
      else document.body.setAttribute('data-ambient', ambient)
    }
  })
}

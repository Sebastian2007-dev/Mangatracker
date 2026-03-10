import { watch, onMounted } from 'vue'
import { useSettingsStore } from '../stores/settings.store'

export function useTheme(): void {
  const settings = useSettingsStore()

  function applyTheme(theme: string): void {
    const root = document.documentElement
    root.classList.remove('light', 'dark')

    if (theme === 'light') {
      root.classList.add('light')
    } else if (theme === 'dark') {
      // dark is default (no class needed, CSS vars are dark by default)
    } else {
      // system
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (!prefersDark) root.classList.add('light')
    }
  }

  onMounted(() => applyTheme(settings.theme))
  watch(() => settings.theme, applyTheme)

  // Listen for OS theme changes when in system mode
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'system') applyTheme('system')
  })
}

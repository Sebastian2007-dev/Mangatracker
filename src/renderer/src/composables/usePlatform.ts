/**
 * Composable zur Plattformerkennung.
 * isMobile: true wenn die App in Capacitor (Android/iOS) läuft.
 * isElectron: true wenn die App in Electron läuft.
 */
export const isElectron: boolean =
  typeof window !== 'undefined' && typeof (window as any).api !== 'undefined'

export const isMobile: boolean =
  typeof window !== 'undefined' && typeof (window as any).Capacitor !== 'undefined'

/** Features die nur auf Desktop (Electron) verfügbar sind. */
export const platformFeatures = {
  hasDesktopReader: isElectron,
  hasElementPicker: isElectron,
  hasDesktopNotifications: isElectron,
  hasReaderWindowMode: isElectron,
  hasDomainGuard: isElectron,
  hasNativeShare: isMobile
}

export function usePlatform() {
  return { isElectron, isMobile, features: platformFeatures }
}

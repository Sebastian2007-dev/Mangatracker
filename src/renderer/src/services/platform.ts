export interface PlatformBridge {
  invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>
  on(channel: string, handler: (...args: unknown[]) => void): () => void
  off(channel: string, handler: (...args: unknown[]) => void): void
}

let _bridge: PlatformBridge | null = null

/** Muss vor App-Mount aufgerufen werden (nur für Capacitor/Mobile). */
export function setBridge(bridge: PlatformBridge): void {
  _bridge = bridge
}

/** Gibt die aktive Platform-Bridge zurück. */
export function getBridge(): PlatformBridge {
  if (_bridge) return _bridge

  // Electron: window.api wird vom Preload injiziert
  if (typeof window !== 'undefined' && (window as any).api) {
    _bridge = (window as any).api as PlatformBridge
    return _bridge
  }

  throw new Error('[Platform] Keine Bridge verfügbar. Weder Electron noch Capacitor erkannt.')
}

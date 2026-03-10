export {}

declare global {
  interface Window {
    api: {
      invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>
      on(channel: string, handler: (...args: unknown[]) => void): () => void
      off(channel: string, handler: (...args: unknown[]) => void): void
    }
  }
}

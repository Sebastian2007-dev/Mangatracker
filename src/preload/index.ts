import { contextBridge, ipcRenderer } from 'electron'

// Maps each renderer-side handler to its wrapped IPC listener per channel,
// so off() can remove exactly that listener instead of all of them.
const listenerMap = new Map<string, Map<(...args: unknown[]) => void, (...args: any[]) => void>>()

contextBridge.exposeInMainWorld('api', {
  invoke: (channel: string, payload?: unknown) => ipcRenderer.invoke(channel, payload),
  on: (channel: string, handler: (...args: unknown[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, ...args: unknown[]) => handler(...args)
    let channelMap = listenerMap.get(channel)
    if (!channelMap) {
      channelMap = new Map()
      listenerMap.set(channel, channelMap)
    }
    channelMap.set(handler, listener)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
      listenerMap.get(channel)?.delete(handler)
    }
  },
  off: (channel: string, handler: (...args: unknown[]) => void) => {
    const channelMap = listenerMap.get(channel)
    const listener = channelMap?.get(handler)
    if (listener) {
      ipcRenderer.removeListener(channel, listener)
      channelMap?.delete(handler)
    }
  }
})

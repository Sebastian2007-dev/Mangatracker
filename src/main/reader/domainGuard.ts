import { BrowserView, BrowserWindow, ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import store from '../store'

interface PendingNav {
  url: string
  originDomain: string
}

const pendingNavigations = new Map<string, PendingNav>()
const allowOnce = new Set<string>()

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function getBaseDomain(hostname: string): string {
  const parts = hostname.split('.')
  if (parts.length <= 2) return hostname
  return parts.slice(-2).join('.')
}

export function setupDomainGuard(
  view: BrowserView,
  originDomain: string,
  mainWindow: BrowserWindow
): void {
  const wc = view.webContents

  wc.on('will-navigate', (event, url) => {
    const targetDomain = extractDomain(url)
    const targetBase = getBaseDomain(targetDomain)
    const originBase = getBaseDomain(originDomain)

    // Same domain → allow
    if (targetBase === originBase) return

    // Check allow-once set
    if (allowOnce.has(url)) {
      allowOnce.delete(url)
      return
    }

    const settings = store.get('settings')

    // Blocklist check
    if (settings.domainBlocklist.some((d) => targetDomain.endsWith(d))) {
      event.preventDefault()
      return
    }

    // Whitelist check
    if (settings.domainWhitelist.some((d) => targetDomain.endsWith(d))) {
      return
    }

    // Unknown domain → ask user
    event.preventDefault()
    const requestId = randomUUID()
    pendingNavigations.set(requestId, { url, originDomain })

    mainWindow.webContents.send('reader:domainGuardRequest', {
      requestId,
      targetDomain,
      originDomain
    })
  })
}

export function registerDomainGuardReplyHandler(
  getView: () => BrowserView | null,
  _mainWindow: BrowserWindow
): void {
  ipcMain.handle('reader:domainGuardReply', (_event, { requestId, choice }: { requestId: string; choice: string }) => {
    const pending = pendingNavigations.get(requestId)
    if (!pending) return { success: false }

    pendingNavigations.delete(requestId)
    const settings = store.get('settings')

    if (choice === 'yes' || choice === 'yes_always') {
      if (choice === 'yes_always') {
        const domain = getBaseDomain(extractDomain(pending.url))
        if (!settings.domainWhitelist.includes(domain)) {
          store.set('settings', {
            ...settings,
            domainWhitelist: [...settings.domainWhitelist, domain]
          })
        }
      }
      allowOnce.add(pending.url)
      const view = getView()
      if (view) {
        view.webContents.loadURL(pending.url)
      }
    } else if (choice === 'no_block') {
      const domain = getBaseDomain(extractDomain(pending.url))
      if (!settings.domainBlocklist.includes(domain)) {
        store.set('settings', {
          ...settings,
          domainBlocklist: [...settings.domainBlocklist, domain]
        })
      }
    }

    return { success: true }
  })
}

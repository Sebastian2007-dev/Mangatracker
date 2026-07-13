import { BrowserWindow, WebContents, dialog, ipcMain, webContents } from 'electron'
import { randomUUID } from 'crypto'
import { getDomain } from 'tldts'
import store from '../store'
import { broadcastSettingsChanged } from '../ipc/settings.ipc'

interface PendingNav {
  url: string
  originDomain: string
  webContentsId: number
  createdAt: number
}

// Unbeantwortete Guard-Anfragen (Dialog verloren gegangen o. ä.) blockieren die URL
// sonst dauerhaft — nach Ablauf gilt die Anfrage als stale und wird neu gestellt.
const PENDING_NAV_TTL_MS = 2 * 60 * 1000

function hasFreshPending(url: string, webContentsId: number): boolean {
  const now = Date.now()
  for (const [requestId, pending] of pendingNavigations.entries()) {
    if (pending.url !== url || pending.webContentsId !== webContentsId) continue
    if (now - pending.createdAt > PENDING_NAV_TTL_MS) {
      pendingNavigations.delete(requestId)
      continue
    }
    return true
  }
  return false
}

interface GuardState {
  currentDomain: string
  allowOnce: Set<string>
}

type DomainGuardChoice = 'yes' | 'yes_always' | 'no' | 'no_block'

const pendingNavigations = new Map<string, PendingNav>()
const guardStates = new Map<number, GuardState>()

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

function getBaseDomain(hostname: string): string {
  // Public-Suffix-List statt "letzte zwei Segmente" — sonst wird foo.co.uk
  // zu co.uk und "immer erlauben" whitelistet eine ganze ccSLD.
  return getDomain(hostname) ?? hostname
}

function matchesDomain(targetDomain: string, listedDomain: string): boolean {
  return targetDomain === listedDomain || targetDomain.endsWith('.' + listedDomain)
}

function isAuthorizedDomain(targetDomain: string, originDomain: string): boolean {
  const targetBase = getBaseDomain(targetDomain)
  const originBase = getBaseDomain(originDomain)
  if (targetBase === originBase) return true

  const settings = store.get('settings')
  return settings.domainWhitelist.some((d) => matchesDomain(targetDomain, d))
}

function getGuardState(contents: WebContents, initialDomain: string): GuardState {
  const existing = guardStates.get(contents.id)
  if (existing) return existing

  const created: GuardState = {
    currentDomain: initialDomain,
    allowOnce: new Set<string>()
  }

  guardStates.set(contents.id, created)
  return created
}

function removePendingForContents(contentsId: number): void {
  for (const [requestId, pending] of pendingNavigations.entries()) {
    if (pending.webContentsId === contentsId) {
      pendingNavigations.delete(requestId)
    }
  }
}

function applyDomainGuardChoice(requestId: string, choice: DomainGuardChoice): { success: boolean } {
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
        broadcastSettingsChanged()
      }
    }

    const targetContents = webContents.fromId(pending.webContentsId)
    if (targetContents && !targetContents.isDestroyed()) {
      const state = getGuardState(targetContents, pending.originDomain)
      state.allowOnce.add(pending.url)

      // Programmatic loadURL typically skips will-navigate.
      targetContents.loadURL(pending.url)
    }
  } else if (choice === 'no_block') {
    const domain = getBaseDomain(extractDomain(pending.url))
    if (!settings.domainBlocklist.includes(domain)) {
      store.set('settings', {
        ...settings,
        domainBlocklist: [...settings.domainBlocklist, domain]
      })
      broadcastSettingsChanged()
    }
  }

  return { success: true }
}

function showNativeDomainGuardDialog(
  ownerWindow: BrowserWindow,
  requestId: string,
  targetDomain: string,
  originDomain: string
): void {
  void dialog
    .showMessageBox(ownerWindow, {
      type: 'question',
      buttons: ['Ja', 'Ja, immer', 'Nein', 'Nein, blockieren'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Andere Domain',
      message: `Du navigierst zu einer anderen Domain: ${targetDomain}`,
      detail: `Von: ${originDomain}`
    })
    .then(({ response }) => {
      const choiceMap: DomainGuardChoice[] = ['yes', 'yes_always', 'no', 'no_block']
      const choice = choiceMap[response] ?? 'no'
      applyDomainGuardChoice(requestId, choice)
    })
    .catch(() => {
      applyDomainGuardChoice(requestId, 'no')
    })
}

export function setupDomainGuard(
  contents: WebContents,
  initialDomain: string,
  mainWindow: BrowserWindow
): void {
  const state = getGuardState(contents, initialDomain)

  const alreadyBound = (contents as any).__mangaDomainGuardBound === true
  if (alreadyBound) return
  ;(contents as any).__mangaDomainGuardBound = true

  function sendGuardRequest(url: string, targetDomain: string): void {
    const requestId = randomUUID()
    const originDomain = state.currentDomain

    pendingNavigations.set(requestId, {
      url,
      originDomain,
      webContentsId: contents.id,
      createdAt: Date.now()
    })

    const ownerWindow = BrowserWindow.fromWebContents(contents)
    const isSeparateReaderWindow =
      !!ownerWindow && !ownerWindow.isDestroyed() && ownerWindow.id !== mainWindow.id

    if (isSeparateReaderWindow && ownerWindow) {
      showNativeDomainGuardDialog(ownerWindow, requestId, targetDomain, originDomain)
      return
    }

    mainWindow.webContents.send('reader:domainGuardRequest', {
      requestId,
      targetDomain,
      originDomain
    })
  }

  // Layer 1: prevent navigation before it starts.
  function handleNavigation(event: Electron.Event, url: string): void {
    const targetDomain = extractDomain(url)
    if (!targetDomain) return

    const originDomain = state.currentDomain
    if (!originDomain) return

    if (isAuthorizedDomain(targetDomain, originDomain)) return

    // User explicitly allowed this URL once via dialog.
    if (state.allowOnce.has(url)) return

    if (hasFreshPending(url, contents.id)) {
      event.preventDefault()
      return
    }

    const settings = store.get('settings')

    if (settings.domainBlocklist.some((d) => matchesDomain(targetDomain, d))) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    sendGuardRequest(url, targetDomain)
  }

  contents.on('will-navigate', handleNavigation)

  // Layer 2: catch server-side redirects to foreign domains.
  contents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame) handleNavigation(event, url)
  })

  // Layer 3: if navigation happened anyway, detect and revert.
  contents.on('did-navigate', (_event, url) => {
    const targetDomain = extractDomain(url)
    if (!targetDomain) return

    const originDomain = state.currentDomain
    if (!originDomain || isAuthorizedDomain(targetDomain, originDomain)) {
      state.currentDomain = targetDomain
      return
    }

    if (state.allowOnce.has(url)) {
      state.allowOnce.delete(url)
      state.currentDomain = targetDomain
      return
    }

    const settings = store.get('settings')

    if (settings.domainBlocklist.some((d) => matchesDomain(targetDomain, d))) {
      if (contents.canGoBack()) contents.goBack()
      return
    }

    if (contents.canGoBack()) contents.goBack()

    if (!hasFreshPending(url, contents.id)) {
      sendGuardRequest(url, targetDomain)
    }
  })

  contents.on('did-navigate-in-page', (_event, url) => {
    const targetDomain = extractDomain(url)
    if (!targetDomain) return
    state.currentDomain = targetDomain
  })

  contents.once('destroyed', () => {
    guardStates.delete(contents.id)
    removePendingForContents(contents.id)
  })
}

export function setDomainGuardContext(contents: WebContents, url: string): void {
  const domain = extractDomain(url)
  if (!domain) return

  const state = getGuardState(contents, domain)
  state.currentDomain = domain
}

export function registerDomainGuardReplyHandler(_mainWindow: BrowserWindow): void {
  ipcMain.removeHandler('reader:domainGuardReply')
  ipcMain.handle(
    'reader:domainGuardReply',
    (_event, { requestId, choice }: { requestId: string; choice: DomainGuardChoice }) => {
      return applyDomainGuardChoice(requestId, choice)
    }
  )
}

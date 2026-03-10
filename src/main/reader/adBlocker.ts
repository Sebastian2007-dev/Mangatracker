import { ElectronBlocker } from '@cliqz/adblocker-electron'
import { app } from 'electron'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { Session } from 'electron'

let blocker: ElectronBlocker | null = null

export async function initAdBlocker(session: Session): Promise<void> {
  try {
    const cachePath = path.join(app.getPath('userData'), 'adblocker-cache.dat')
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch as any, {
      path: cachePath,
      read: (p) => fs.readFile(p),
      write: (p, data) => fs.writeFile(p, data)
    })
    blocker.enableBlockingInSession(session)
    console.log('[AdBlocker] Initialized successfully')
  } catch (err) {
    console.error('[AdBlocker] Failed to initialize:', err)
  }
}

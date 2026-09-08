import { registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

/**
 * Typisierte Bruecke zum nativen Reader-WebView
 * (android/app/src/main/java/com/mangaTracker/app/ReaderPlugin.java).
 *
 * Ersetzt @capacitor/browser fuers Lesen: Custom Tabs geben die navigierte URL
 * nicht heraus, erlauben kein JS und keine Request-Interception.
 */

export interface ReaderOpenOptions {
  url: string
  mangaId: string
  /** Host-Blockliste; das Plugin prueft Host und alle Elterndomains. */
  blockedHosts: string[]
  blockPopups?: boolean
  /**
   * Fremde Skripte/iframes blocken, ausser die Domain steht in allowedThirdParty.
   * Der wirksame Schutz gegen rotierende Werbedomains.
   */
  strictThirdParty?: boolean
  allowedThirdParty?: string[]
  /** Domain Guard: 'ask' | 'block' | 'off' */
  guardMode?: string
  /** Dauerhaft erlaubte bzw. gesperrte Domains (registrierbare Domain). */
  allowedDomains?: string[]
  blockedDomains?: string[]
}

export interface ReaderNavigationBlockedEvent {
  url: string
  /** Registrierbare Domain des Ziels; leer bei fremden Schemata. */
  domain: string
  /**
   * 'scheme' | 'adhost' | 'blocklist' | 'auto' | 'mode' | 'ask'
   * Nur 'ask' soll den Dialog zeigen — der Rest ist bereits entschieden.
   */
  reason: string
  /** false = automatische Umleitung (der Scroll-Redirect). */
  hasGesture: boolean
  mangaId: string
}

export interface ReaderUrlChangedEvent {
  url: string
  mangaId: string
}

export interface ReaderMessageEvent {
  /** Rohe console-Nachricht der Seite, inklusive Praefix. */
  message: string
  mangaId: string
}

export interface ReaderClosedEvent {
  mangaId: string
}

export interface ReaderPageFinishedEvent {
  url: string
}

export interface ReaderWebViewPlugin {
  open(options: ReaderOpenOptions): Promise<void>
  close(): Promise<void>
  isOpen(): Promise<{ open: boolean }>
  executeScript(options: { code: string }): Promise<void>
  setBlockedHosts(options: { blockedHosts: string[] }): Promise<void>
  /** Navigiert gezielt — nach einem "ja" im Guard-Dialog. */
  setUrl(options: { url: string }): Promise<void>
  updateGuardLists(options: {
    guardMode?: string
    allowedDomains?: string[]
    blockedDomains?: string[]
  }): Promise<void>
  reload(): Promise<void>

  addListener(
    eventName: 'readerUrlChanged',
    listener: (event: ReaderUrlChangedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'readerPageFinished',
    listener: (event: ReaderPageFinishedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'readerMessage',
    listener: (event: ReaderMessageEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'readerClosed',
    listener: (event: ReaderClosedEvent) => void
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'readerNavigationBlocked',
    listener: (event: ReaderNavigationBlockedEvent) => void
  ): Promise<PluginListenerHandle>
}

export const ReaderWebView = registerPlugin<ReaderWebViewPlugin>('ReaderWebView')

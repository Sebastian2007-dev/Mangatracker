/**
 * Mobile App-Einstiegspunkt (für vite.mobile.config.ts).
 * Registriert den Capacitor-Adapter BEVOR die Vue-App mountet.
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { i18n } from './i18n/index'
import router from './router/index'
import App from './App.vue'
import './assets/main.css'
import { setBridge } from './services/platform'
import { capacitorAdapter, emitBridgeEvent } from './services/capacitor.adapter'
import { onLogEntry, onNewChapter, initPollerLifecycle } from './services/mobile/poller.service'
import { purgeExpiredTrash } from './services/mobile/manga.service'
import { notifyStatsUpdated } from './services/mobile/stats.service'
import { useLogStore } from './stores/log.store'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { LogEntry } from '../../types/index'

// Bridge setzen bevor irgendein Store initialisiert wird
setBridge(capacitorAdapter)

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(i18n)
app.mount('#app')

// Notification-Berechtigung anfragen (Android 13+ braucht POST_NOTIFICATIONS)
LocalNotifications.requestPermissions().catch(() => {
  // Abgelehnt oder Gerät unterstützt es nicht — kein Fehler werfen
})

// Poller-Events nach App-Mount in den Log-Store weiterleiten
onLogEntry((entry: LogEntry) => {
  const logStore = useLogStore()
  logStore.addEntry(entry)
})

onNewChapter((data) => {
  // Wie auf Desktop: Event an die Stores weiterreichen (manga.store setzt hasNewChapter)
  emitBridgeEvent('notifications:newChapter', data)
  notifyStatsUpdated()
})

// Abgelaufene Trash-Einträge (Tombstone-Retention) beim Start aufräumen
void purgeExpiredTrash()

// App-Lifecycle für Poller initialisieren
initPollerLifecycle()

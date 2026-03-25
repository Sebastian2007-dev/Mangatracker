<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings.store'
import { useMangaStore } from '../stores/manga.store'
import type { Theme, Language, ReadBehavior } from '../types/index'
import { platformFeatures, isMobile } from '../composables/usePlatform'

const { t, locale } = useI18n()
const settings = useSettingsStore()
const mangaStore = useMangaStore()

// Mobile: aktueller Benachrichtigungs-Berechtigungsstatus
const notifPermissionDenied = ref(false)
const modsScanning = ref(false)
const metadataRefreshStatus = ref<'idle' | 'running' | 'ok' | 'fail'>('idle')
const metadataRefreshMessage = ref('')

onMounted(async () => {
  if (!isMobile) {
    // Fetch installed mods (desktop only — IPC not available on mobile)
    await settings.fetchMods()
    return
  }
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications')
    const { display } = await LocalNotifications.checkPermissions()
    notifPermissionDenied.value = display !== 'granted' && settings.notificationsEnabled
  } catch { /* ignorieren */ }
})

// Theme
const themes: { value: Theme; label: string }[] = [
  { value: 'light', label: 'settings.themeLight' },
  { value: 'dark', label: 'settings.themeDark' },
  { value: 'system', label: 'settings.themeSystem' }
]

// Language
const languages: { value: Language; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' }
]

// Read behavior
const readBehaviors: { value: ReadBehavior; label: string }[] = [
  { value: 'main', label: 'settings.readMain' },
  { value: 'chapter', label: 'settings.readChapter' },
  { value: 'ask', label: 'settings.readAsk' }
]

async function setTheme(theme: Theme): Promise<void> {
  await settings.save({ theme })
}

async function setLanguage(lang: Language): Promise<void> {
  await settings.save({ language: lang })
  locale.value = lang
}

async function setReadBehavior(rb: ReadBehavior): Promise<void> {
  await settings.save({ readBehavior: rb })
}

async function setNotificationsEnabled(v: boolean): Promise<void> {
  if (v && isMobile) {
    try {
      const { LocalNotifications } = await import('@capacitor/local-notifications')
      let { display } = await LocalNotifications.checkPermissions()
      if (display !== 'granted') {
        const result = await LocalNotifications.requestPermissions()
        display = result.display
      }
      notifPermissionDenied.value = display !== 'granted'
    } catch {
      notifPermissionDenied.value = true
    }
  } else {
    notifPermissionDenied.value = false
  }
  await settings.save({ notificationsEnabled: v })
}

async function setAutoLinkEnabled(v: boolean): Promise<void> {
  await settings.save({ autoLinkEnabled: v })
}

async function setBackgroundNotificationsEnabled(v: boolean): Promise<void> {
  await settings.save({ backgroundNotificationsEnabled: v })
}

async function setDesktopNotificationsEnabled(v: boolean): Promise<void> {
  await settings.save({ desktopNotificationsEnabled: v })
}

const intervalHours = computed({
  get: () => settings.notificationIntervalMs / 3_600_000,
  set: async (h) => {
    await settings.save({ notificationIntervalMs: Math.max(0.25, h) * 3_600_000 })
  }
})

async function setReaderInSeparateWindow(v: boolean): Promise<void> {
  await settings.save({ readerInSeparateWindow: v })
}

async function setElementPickerEnabled(v: boolean): Promise<void> {
  await settings.save({ elementPickerEnabled: v })
}

async function setBlockNewWindows(v: boolean): Promise<void> {
  await settings.save({ blockNewWindows: v })
}

async function setTitleExpand(v: boolean): Promise<void> {
  await settings.save({ titleExpand: v })
}

// ─── Gist Sync ────────────────────────────────────────────────────────────

const tokenInput = ref(settings.githubToken)
const showToken = ref(false)
const authStatus = ref<'idle' | 'testing' | 'ok' | 'fail'>('idle')
const authUsername = ref('')
const syncStatus = ref<'idle' | 'running' | 'ok' | 'fail'>('idle')
const syncError = ref('')

async function testAuth(): Promise<void> {
  if (!tokenInput.value) return
  authStatus.value = 'testing'
  const result = await settings.testGistAuth(tokenInput.value)
  if (result.success && result.username) {
    authStatus.value = 'ok'
    authUsername.value = result.username
    await settings.save({ githubToken: tokenInput.value })
  } else {
    authStatus.value = 'fail'
  }
}

async function syncNow(): Promise<void> {
  syncStatus.value = 'running'
  syncError.value = ''
  const result = await settings.syncGist()
  if (result.success) {
    syncStatus.value = 'ok'
    await mangaStore.fetchAll()
  } else {
    syncStatus.value = 'fail'
    syncError.value = result.error ?? ''
  }
}

async function disconnectGist(): Promise<void> {
  await settings.disconnectGist()
  tokenInput.value = ''
  authStatus.value = 'idle'
  authUsername.value = ''
  syncStatus.value = 'idle'
}

async function setSyncEnabled(v: boolean): Promise<void> {
  await settings.save({ gistSyncEnabled: v })
}

async function setAutoSync(v: boolean): Promise<void> {
  await settings.save({ gistAutoSync: v })
}

async function scanModsNow(): Promise<void> {
  if (modsScanning.value) return
  modsScanning.value = true
  try {
    await settings.scanMods()
  } finally {
    modsScanning.value = false
  }
}

async function refreshMetadataNow(): Promise<void> {
  metadataRefreshStatus.value = 'running'
  metadataRefreshMessage.value = ''

  const result = await mangaStore.refreshMetadata()
  if (!result.success) {
    metadataRefreshStatus.value = 'fail'
    metadataRefreshMessage.value = result.error ?? t('settings.metadataRefreshFail')
    return
  }

  metadataRefreshStatus.value = 'ok'
  if (!result.scannedCount) {
    metadataRefreshMessage.value = t('settings.metadataRefreshNoLinks')
  } else if (!result.updatedCount) {
    metadataRefreshMessage.value = t('settings.metadataRefreshNoChanges', { scanned: result.scannedCount })
  } else {
    metadataRefreshMessage.value = t('settings.metadataRefreshDone', {
      updated: result.updatedCount,
      scanned: result.scannedCount
    })
  }
}

function formatLastSync(ts: number): string {
  if (!ts) return t('settings.syncNever')
  const diff = Math.floor((Date.now() - ts) / 60000)
  if (diff < 1) return '< 1 min'
  if (diff < 60) return `${diff} min`
  const h = Math.floor(diff / 60)
  return h === 1 ? '1 Std.' : `${h} Std.`
}
</script>

<template>
  <div class="h-full overflow-hidden flex gap-6 settings-outer" :class="isMobile ? 'p-4' : 'p-6'">
    <!-- Left column: settings content -->
    <div class="flex-1 min-h-0 overflow-y-auto min-w-0 max-w-2xl">
    <h1 class="text-xl font-bold mb-6" style="color: hsl(var(--foreground))">{{ t('settings.title') }}</h1>

    <!-- Theme -->
    <section class="settings-section">
      <h2 class="section-title">{{ t('settings.theme') }}</h2>
      <div class="flex gap-2">
        <button
          v-for="th in themes"
          :key="th.value"
          class="option-btn"
          :class="{ active: settings.theme === th.value }"
          @click="setTheme(th.value)"
        >
          {{ t(th.label) }}
        </button>
      </div>
    </section>

    <!-- Language -->
    <section class="settings-section">
      <h2 class="section-title">{{ t('settings.language') }}</h2>
      <div class="flex gap-2">
        <button
          v-for="lang in languages"
          :key="lang.value"
          class="option-btn"
          :class="{ active: settings.language === lang.value }"
          @click="setLanguage(lang.value)"
        >
          {{ lang.label }}
        </button>
      </div>
    </section>

    <!-- Library -->
    <section class="settings-section">
      <h2 class="section-title">{{ t('settings.library') }}</h2>
      <div class="flex items-center justify-between mb-3">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.titleExpand') }}</span>
          <p class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">{{ t('settings.titleExpandHint') }}</p>
        </div>
        <button
          class="toggle"
          :class="{ on: settings.titleExpand }"
          @click="setTitleExpand(!settings.titleExpand)"
        />
      </div>
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">
            {{ t('settings.autoLinkEnabled') }}
            <span class="beta-badge">Beta</span>
          </span>
          <p class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">{{ t('settings.autoLinkHint') }}</p>
        </div>
        <button
          class="toggle"
          :class="{ on: settings.autoLinkEnabled }"
          @click="setAutoLinkEnabled(!settings.autoLinkEnabled)"
        />
      </div>
      <div class="library-action-row">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.metadataRefresh') }}</span>
          <p class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">{{ t('settings.metadataRefreshHint') }}</p>
        </div>
        <button class="action-btn" :disabled="metadataRefreshStatus === 'running'" @click="refreshMetadataNow">
          {{ metadataRefreshStatus === 'running' ? t('settings.metadataRefreshRunning') : t('settings.metadataRefreshBtn') }}
        </button>
      </div>
      <div v-if="metadataRefreshStatus === 'ok'" class="status-badge status-ok mt-3">{{ metadataRefreshMessage }}</div>
      <div v-else-if="metadataRefreshStatus === 'fail'" class="status-badge status-fail mt-3">{{ metadataRefreshMessage }}</div>
    </section>

    <!-- Read Behavior -->
    <section class="settings-section">
      <h2 class="section-title">{{ t('settings.readBehavior') }}</h2>
      <div class="flex flex-col gap-1">
        <button
          v-for="rb in readBehaviors"
          :key="rb.value"
          class="option-btn-full"
          :class="{ active: settings.readBehavior === rb.value }"
          @click="setReadBehavior(rb.value)"
        >
          {{ t(rb.label) }}
        </button>
      </div>
    </section>

    <!-- Reader (nur Desktop) -->
    <section v-if="platformFeatures.hasDesktopReader" class="settings-section">
      <h2 class="section-title">{{ t('settings.reader') }}</h2>
      <div class="flex items-center justify-between mb-3">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.readerSeparateWindow') }}</span>
          <p class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">{{ t('settings.readerSeparateWindowHint') }}</p>
        </div>
        <button
          class="toggle"
          :class="{ on: settings.readerInSeparateWindow }"
          @click="setReaderInSeparateWindow(!settings.readerInSeparateWindow)"
        />
      </div>
      <div class="flex items-center justify-between mb-3">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.elementPickerEnabled') }}</span>
          <p class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">{{ t('settings.elementPickerEnabledHint') }}</p>
        </div>
        <button
          class="toggle"
          :class="{ on: settings.elementPickerEnabled }"
          @click="setElementPickerEnabled(!settings.elementPickerEnabled)"
        />
      </div>
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.blockNewWindows') }}</span>
          <p class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">{{ t('settings.blockNewWindowsHint') }}</p>
        </div>
        <button
          class="toggle"
          :class="{ on: settings.blockNewWindows }"
          @click="setBlockNewWindows(!settings.blockNewWindows)"
        />
      </div>
    </section>

    <!-- Notifications -->
    <section class="settings-section">
      <h2 class="section-title">{{ t('settings.notifications') }}</h2>

      <!-- Kapitel-Scan Toggle -->
      <div class="flex items-center justify-between" :class="isMobile ? 'mb-1' : 'mb-3'">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.notificationsEnabled') }}</span>
          <p v-if="isMobile" class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">
            {{ t('settings.mobileNotificationsHint') }}
          </p>
        </div>
        <button
          class="toggle"
          :class="{ on: settings.notificationsEnabled }"
          @click="setNotificationsEnabled(!settings.notificationsEnabled)"
        />
      </div>

      <!-- Warnmeldung wenn Permission abgelehnt (nur Mobile) -->
      <div v-if="isMobile && notifPermissionDenied" class="notif-warning mb-3">
        <span>⚠ {{ t('settings.notifPermissionDenied') }}</span>
      </div>

      <!-- Hintergrund-Benachrichtigungen Toggle (nur Mobile) -->
      <div v-if="isMobile" class="flex items-center justify-between mb-3">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.backgroundNotificationsEnabled') }}</span>
          <p class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">{{ t('settings.backgroundNotificationsHint') }}</p>
        </div>
        <button
          class="toggle"
          :class="{ on: settings.backgroundNotificationsEnabled }"
          @click="setBackgroundNotificationsEnabled(!settings.backgroundNotificationsEnabled)"
        />
      </div>

      <!-- Desktop-Benachrichtigungen Toggle (nur Desktop) -->
      <div v-if="platformFeatures.hasDesktopNotifications" class="flex items-center justify-between mb-3">
        <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.desktopNotificationsEnabled') }}</span>
        <button
          class="toggle"
          :class="{ on: settings.desktopNotificationsEnabled }"
          @click="setDesktopNotificationsEnabled(!settings.desktopNotificationsEnabled)"
        />
      </div>

      <div class="flex items-center gap-3">
        <label class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.checkInterval') }}</label>
        <input
          v-model.number="intervalHours"
          type="number"
          min="0.25"
          step="0.25"
          class="field-input w-24"
        />
        <span class="text-sm" style="color: hsl(var(--muted-foreground))">{{ t('settings.intervalHours') }}</span>
      </div>
    </section>

    <!-- Gist Sync -->
    <section class="settings-section">
      <h2 class="section-title">{{ t('settings.sync') }}</h2>

      <!-- Sync aktivieren -->
      <div class="flex items-center justify-between mb-3">
        <div>
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.syncEnabled') }}</span>
          <p class="text-xs mt-0.5" style="color: hsl(var(--muted-foreground))">{{ t('settings.syncEnabledHint') }}</p>
        </div>
        <button class="toggle" :class="{ on: settings.gistSyncEnabled }" @click="setSyncEnabled(!settings.gistSyncEnabled)" />
      </div>

      <template v-if="settings.gistSyncEnabled">
        <!-- Token-Eingabe -->
        <div class="mb-3">
          <label class="text-xs font-medium mb-1 block" style="color: hsl(var(--muted-foreground))">
            {{ t('settings.syncToken') }}
          </label>
          <p class="text-xs mb-2" style="color: hsl(var(--muted-foreground))">{{ t('settings.syncTokenHint') }}</p>
          <div class="flex gap-2">
            <div class="flex-1 relative">
              <input
                v-model="tokenInput"
                :type="showToken ? 'text' : 'password'"
                :placeholder="t('settings.syncTokenPlaceholder')"
                class="field-input w-full pr-8"
                @keyup.enter="testAuth"
              />
              <button
                class="token-eye-btn"
                @click="showToken = !showToken"
                :title="showToken ? 'Verbergen' : 'Anzeigen'"
              >{{ showToken ? '🙈' : '👁' }}</button>
            </div>
            <button
              class="action-btn"
              :disabled="!tokenInput || authStatus === 'testing'"
              @click="testAuth"
            >
              {{ authStatus === 'testing' ? '…' : t('settings.syncTestBtn') }}
            </button>
          </div>

          <!-- Auth-Status -->
          <div v-if="authStatus === 'ok'" class="status-badge status-ok mt-2">
            ✓ {{ t('settings.syncTestOk') }} @{{ authUsername }}
          </div>
          <div v-else-if="authStatus === 'fail'" class="status-badge status-fail mt-2">
            ✗ {{ t('settings.syncTestFail') }}
          </div>
        </div>

        <!-- Auto-Sync -->
        <div class="flex items-center justify-between mb-3">
          <span class="text-sm" style="color: hsl(var(--foreground))">{{ t('settings.syncAutoSync') }}</span>
          <button class="toggle" :class="{ on: settings.gistAutoSync }" @click="setAutoSync(!settings.gistAutoSync)" />
        </div>

        <!-- Letzter Sync + Gist-ID -->
        <div class="sync-info mb-3">
          <div class="flex justify-between text-xs" style="color: hsl(var(--muted-foreground))">
            <span>{{ t('settings.syncLastSync') }}</span>
            <span>{{ formatLastSync(settings.lastGistSync ?? 0) }}</span>
          </div>
          <div v-if="settings.gistId" class="flex justify-between text-xs mt-1" style="color: hsl(var(--muted-foreground))">
            <span>{{ t('settings.syncGistId') }}</span>
            <span class="font-mono">{{ settings.gistId.slice(0, 12) }}…</span>
          </div>
        </div>

        <!-- Sync-Aktionen -->
        <div class="flex gap-2">
          <button
            class="action-btn flex-1"
            :disabled="!settings.githubToken || syncStatus === 'running'"
            @click="syncNow"
          >
            {{ syncStatus === 'running' ? t('settings.syncRunning') : t('settings.syncNowBtn') }}
          </button>
          <button class="action-btn-ghost" @click="disconnectGist">
            {{ t('settings.syncDisconnectBtn') }}
          </button>
        </div>

        <!-- Sync-Status -->
        <div v-if="syncStatus === 'ok'" class="status-badge status-ok mt-2">✓ {{ t('settings.syncSuccess') }}</div>
        <div v-else-if="syncStatus === 'fail'" class="status-badge status-fail mt-2">
          ✗ {{ t('settings.syncError') }}<span v-if="syncError">: {{ syncError }}</span>
        </div>
      </template>
    </section>

    </div><!-- end left column -->

    <!-- Right column: Mods sidebar (desktop only) -->
    <aside v-if="!isMobile" class="mods-sidebar">
      <div class="mods-header">
        <span class="mods-title">🧩 {{ t('mods.title') }}</span>
        <div class="mods-actions">
          <button class="mods-folder-btn" @click="settings.openModsFolder()">{{ t('mods.openFolder') }}</button>
          <button class="mods-folder-btn" :disabled="modsScanning" @click="scanModsNow">
            {{ modsScanning ? t('mods.scanning') : t('mods.scan') }}
          </button>
        </div>
      </div>

      <p v-if="settings.loadedMods.length === 0" class="mods-empty">
        {{ t('mods.empty') }}<br>
        <span class="mods-empty-hint">{{ t('mods.emptyHint') }}</span>
      </p>

      <div v-for="mod in settings.loadedMods" :key="mod.manifest.id" class="mod-card">
        <div class="mod-card-header">
          <span class="mod-status-dot" :class="mod.enabled ? 'dot-on' : 'dot-off'" />
          <span class="mod-name">{{ mod.manifest.name }}</span>
          <button
            class="toggle mod-toggle"
            :class="{ on: mod.enabled }"
            @click="settings.setModEnabled(mod.manifest.id, !mod.enabled)"
          />
        </div>
        <div class="mod-meta">
          <span class="mod-version">v{{ mod.manifest.version }}</span>
          <span v-if="mod.manifest.author" class="mod-author">{{ t('mods.by') }} {{ mod.manifest.author }}</span>
        </div>
        <p v-if="mod.manifest.description" class="mod-desc">{{ mod.manifest.description }}</p>
        <p v-if="mod.error" class="mod-error">⚠ {{ mod.error }}</p>
        <p v-if="mod.enabled !== mod.enabled" class="mod-restart-hint">{{ t('mods.restartHint') }}</p>
      </div>

      <p v-if="settings.loadedMods.some(m => !m.enabled)" class="mods-restart-hint">
        {{ t('mods.restartHint') }}
      </p>
    </aside>
  </div>
</template>

<style scoped>
/* Safe Area für Querformat (p-4 bleibt Minimum) */
@media (orientation: landscape) {
  .settings-outer {
    padding-left: max(1rem, env(safe-area-inset-left, 0px));
    padding-right: max(1rem, env(safe-area-inset-right, 0px));
  }
}
.settings-section {
  margin-bottom: 28px;
  padding-bottom: 28px;
  border-bottom: 1px solid hsl(var(--border));
}
.settings-section:last-child {
  border-bottom: none;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}
.option-btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  transition: background 0.1s;
}
.option-btn:hover { background: hsl(var(--accent)); }
.option-btn.active {
  background: hsl(var(--primary) / 0.2);
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.4);
}
.option-btn-full {
  padding: 9px 14px;
  border-radius: 6px;
  font-size: 13px;
  text-align: left;
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  transition: background 0.1s;
}
.option-btn-full:hover { background: hsl(var(--accent)); }
.option-btn-full.active {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
  border-color: hsl(var(--primary) / 0.4);
}
.toggle {
  width: 40px;
  min-width: 40px;
  height: 22px;
  border-radius: 11px;
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
  flex-shrink: 0;
  margin-left: 12px;
}
.toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: hsl(var(--muted-foreground));
  transition: transform 0.2s, background 0.2s;
}
.toggle.on {
  background: hsl(var(--primary) / 0.25);
  border-color: hsl(var(--primary) / 0.5);
}
.toggle.on::after {
  transform: translateX(18px);
  background: hsl(var(--primary));
}
.field-input {
  height: 32px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--input));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  outline: none;
}
.field-input:focus { border-color: hsl(var(--primary)); }
.beta-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background: hsl(270 70% 55% / 0.15);
  color: hsl(270 70% 65%);
  border: 1px solid hsl(270 70% 55% / 0.3);
  vertical-align: middle;
}
.library-action-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
  flex-wrap: wrap;
}
.library-action-row .action-btn {
  flex-shrink: 0;
}
.notif-warning {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  background: hsl(43 96% 56% / 0.12);
  color: hsl(43 80% 55%);
  border: 1px solid hsl(43 96% 56% / 0.3);
}
.action-btn {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
  transition: opacity 0.1s;
  white-space: nowrap;
}
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.action-btn:not(:disabled):hover { opacity: 0.85; }
.action-btn-ghost {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  white-space: nowrap;
}
.action-btn-ghost:hover { background: hsl(var(--accent)); }
.token-eye-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 0;
  line-height: 1;
}
.status-badge {
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12px;
}
.status-ok {
  background: hsl(142 76% 36% / 0.12);
  color: hsl(142 76% 36%);
  border: 1px solid hsl(142 76% 36% / 0.3);
}
.status-fail {
  background: hsl(0 84% 60% / 0.12);
  color: hsl(0 72% 50%);
  border: 1px solid hsl(0 84% 60% / 0.3);
}
.sync-info {
  padding: 8px 10px;
  border-radius: 6px;
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
}

/* ─── Mods sidebar ─────────────────────────────────────────────────── */
.mods-sidebar {
  width: 224px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 2px;
}
.mods-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}
.mods-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mods-title {
  font-size: 13px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.mods-folder-btn {
  padding: 3px 8px;
  border-radius: 5px;
  font-size: 11px;
  background: hsl(var(--secondary));
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  white-space: nowrap;
}
.mods-folder-btn:hover { background: hsl(var(--accent)); color: hsl(var(--foreground)); }
.mods-folder-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.mods-empty {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
  text-align: center;
  padding: 12px 8px;
}
.mods-empty-hint {
  font-size: 11px;
  opacity: 0.7;
}
.mod-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.mod-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
}
.mod-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.dot-on { background: hsl(142 76% 36%); }
.dot-off { background: hsl(var(--muted-foreground)); opacity: 0.5; }
.mod-name {
  font-size: 12px;
  font-weight: 500;
  color: hsl(var(--foreground));
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mod-toggle {
  margin-left: 0;
  width: 36px;
  min-width: 36px;
  height: 20px;
}
.mod-toggle::after {
  width: 14px;
  height: 14px;
}
.mod-meta {
  display: flex;
  gap: 6px;
  align-items: center;
}
.mod-version {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--secondary));
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid hsl(var(--border));
}
.mod-author {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mod-desc {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  line-height: 1.4;
  margin-top: 2px;
}
.mod-error {
  font-size: 11px;
  color: hsl(0 72% 50%);
  background: hsl(0 84% 60% / 0.1);
  border: 1px solid hsl(0 84% 60% / 0.2);
  border-radius: 4px;
  padding: 4px 6px;
  line-height: 1.4;
  word-break: break-word;
}
.mods-restart-hint {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  opacity: 0.7;
  padding: 4px 0;
}
</style>

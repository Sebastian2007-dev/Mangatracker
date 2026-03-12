<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings.store'
import type { Theme, Language, ReadBehavior } from '../types/index'
import DomainListManager from '../components/settings/DomainListManager.vue'
import { platformFeatures, isMobile } from '../composables/usePlatform'

const { t, locale } = useI18n()
const settings = useSettingsStore()

// Mobile: aktueller Benachrichtigungs-Berechtigungsstatus
const notifPermissionDenied = ref(false)

onMounted(async () => {
  if (!isMobile) return
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

async function updateWhitelist(list: string[]): Promise<void> {
  await settings.save({ domainWhitelist: list })
}

async function updateBlocklist(list: string[]): Promise<void> {
  await settings.save({ domainBlocklist: list })
}
</script>

<template>
  <div class="h-full overflow-y-auto p-6 max-w-2xl">
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

    <!-- Domain Whitelist (nur Desktop) -->
    <section v-if="platformFeatures.hasDomainGuard" class="settings-section">
      <DomainListManager
        :title="t('settings.domainWhitelist')"
        :model-value="settings.domainWhitelist"
        @update:model-value="updateWhitelist"
      />
    </section>

    <!-- Domain Blocklist (nur Desktop) -->
    <section v-if="platformFeatures.hasDomainGuard" class="settings-section">
      <DomainListManager
        :title="t('settings.domainBlocklist')"
        :model-value="settings.domainBlocklist"
        @update:model-value="updateBlocklist"
      />
    </section>
  </div>
</template>

<style scoped>
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
  height: 22px;
  border-radius: 11px;
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
  position: relative;
  transition: background 0.2s;
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
.notif-warning {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  background: hsl(43 96% 56% / 0.12);
  color: hsl(43 80% 55%);
  border: 1px solid hsl(43 96% 56% / 0.3);
}
</style>

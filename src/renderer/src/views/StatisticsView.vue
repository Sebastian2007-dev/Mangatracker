<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import type { Component } from 'vue'
import { useCountUp } from '../composables/useCountUp'
import {
  BookOpen,
  Camera,
  Castle,
  Cloud,
  X,
  ChartColumn,
  CircleCheck,
  Clock3,
  Compass,
  Cpu,
  Crown,
  Flame,
  Gem,
  Heart,
  Library,
  Link,
  MoonStar,
  Palette,
  Pencil,
  RefreshCw,
  ScrollText,
  Search,
  Shield,
  Sparkles,
  Sword,
  Target,
  Trophy,
  Zap
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useStatisticsStore } from '../stores/statistics.store'
import { useSettingsStore } from '../stores/settings.store'
import { useSkillTreeStore } from '../stores/skill-tree.store'

const { t, locale } = useI18n()
const statisticsStore = useStatisticsStore()
const settingsStore = useSettingsStore()
const skillTreeStore = useSkillTreeStore()
const mode = ref<'game' | 'plain'>('game')
let cleanupListener: (() => void) | null = null

const showAllAchievements = ref(false)
const ACHIEVEMENTS_PREVIEW = 24

const avatarInput = ref<HTMLInputElement | null>(null)
const editingName = ref(false)
const tempName = ref('')
const nameInputEl = ref<HTMLInputElement | null>(null)

const editingCustomTitle = ref(false)
const tempCustomTitle = ref('')
const customTitleInputEl = ref<HTMLInputElement | null>(null)

function startEditCustomTitle(): void {
  tempCustomTitle.value = settingsStore.customTitle ?? ''
  editingCustomTitle.value = true
  nextTick(() => customTitleInputEl.value?.select())
}

async function saveCustomTitle(): Promise<void> {
  await settingsStore.save({ customTitle: tempCustomTitle.value.trim() })
  editingCustomTitle.value = false
}

function cancelEditCustomTitle(): void {
  editingCustomTitle.value = false
}

function triggerAvatarUpload(): void {
  avatarInput.value?.click()
}

function onAvatarChange(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = async () => {
    await settingsStore.save({ profileAvatar: reader.result as string })
  }
  reader.readAsDataURL(file)
}

function startEditName(): void {
  tempName.value = settingsStore.profileName
  editingName.value = true
  nextTick(() => nameInputEl.value?.select())
}

async function saveName(): Promise<void> {
  await settingsStore.save({ profileName: tempName.value.trim() })
  editingName.value = false
}

function cancelEditName(): void {
  editingName.value = false
}

const overview = computed(() => statisticsStore.overview)

const overviewLevel = computed(() => overview.value?.level)
const overviewChapters = computed(() => overview.value?.chapters.allTime)
const overviewManga = computed(() => overview.value?.counts.current)
const animatedLevel = useCountUp(overviewLevel)
const animatedChapters = useCountUp(overviewChapters)
const animatedManga = useCountUp(overviewManga)

const iconMap: Record<string, Component> = {
  Book: BookOpen,
  BookOpen,
  Library,
  Castle,
  Zap,
  Flame,
  Gem,
  Compass,
  Palette,
  CheckCircle2: CircleCheck,
  Target,
  Clock3,
  Crown,
  Link,
  Sword,
  Heart,
  Dragon: Shield,
  Circuit: Cpu,
  Moon: MoonStar,
  Spark: Sparkles,
  Sparkles,
  Trophy,
  Search,
  Scroll: ScrollText,
  RefreshCw,
  Cloud
}

const statCards = computed(() => {
  if (!overview.value) return []
  return [
    { key: 'pwr', label: t('statistics.attributes.pwr'), value: overview.value.stats.pwr, tone: 'gold' },
    { key: 'spd', label: t('statistics.attributes.spd'), value: overview.value.stats.spd, tone: 'blue' },
    { key: 'wis', label: t('statistics.attributes.wis'), value: overview.value.stats.wis, tone: 'green' },
    { key: 'stm', label: t('statistics.attributes.stm'), value: overview.value.stats.stm, tone: 'gold' },
    { key: 'end', label: t('statistics.attributes.end'), value: overview.value.stats.end, tone: 'green' },
    { key: 'arc', label: t('statistics.attributes.arc'), value: overview.value.stats.arc, tone: 'blue' }
  ]
})

const topTags = computed(() => {
  if (!overview.value) return []
  return Object.entries(overview.value.tags)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name, count }))
})

const monthTimeline = computed(() => {
  if (!overview.value) return []

  const entries = Object.entries(overview.value.activityByMonth).sort(([left], [right]) => left.localeCompare(right))
  const lastEntries = entries.slice(-8)
  const maxCount = Math.max(...lastEntries.map(([, count]) => count), 1)

  return lastEntries.map(([key, count]) => ({
    key,
    label: formatMonth(key),
    count,
    height: `${Math.max(12, Math.round((count / maxCount) * 100))}%`
  }))
})

const statusRows = computed(() => {
  if (!overview.value) return []

  const total = Math.max(overview.value.counts.current, 1)
  return [
    { key: 'reading', label: t('tabs.reading'), count: overview.value.statusCounts.reading, ratio: (overview.value.statusCounts.reading / total) * 100, tone: 'reading' },
    { key: 'plan_to_read', label: t('tabs.plan_to_read'), count: overview.value.statusCounts.plan_to_read, ratio: (overview.value.statusCounts.plan_to_read / total) * 100, tone: 'plan' },
    { key: 'completed', label: t('tabs.completed'), count: overview.value.statusCounts.completed, ratio: (overview.value.statusCounts.completed / total) * 100, tone: 'completed' },
    { key: 'hiatus', label: t('tabs.hiatus'), count: overview.value.statusCounts.hiatus, ratio: (overview.value.statusCounts.hiatus / total) * 100, tone: 'hiatus' },
    { key: 'rereading', label: t('tabs.rereading'), count: overview.value.statusCounts.rereading, ratio: (overview.value.statusCounts.rereading / total) * 100, tone: 'rereading' }
  ]
})

const summaryCards = computed(() => {
  if (!overview.value) return []
  return [
    { key: 'current', label: t('statistics.cards.currentLibrary'), value: formatNumber(overview.value.counts.current), tone: 'gold' },
    { key: 'allTime', label: t('statistics.cards.allTimeLibrary'), value: formatNumber(overview.value.counts.allTime), tone: 'blue' },
    { key: 'chapters', label: t('statistics.cards.allTimeChapters'), value: formatNumber(overview.value.chapters.allTime), tone: 'green' },
    { key: 'streak', label: t('statistics.cards.currentStreak'), value: formatNumber(overview.value.currentStreak), tone: 'gold' }
  ]
})

const tagMeta = computed(() => {
  if (!overview.value) return ''
  if (statisticsStore.refreshingTags) return t('statistics.tagRefreshing')
  if (!overview.value.tagCache.fetchedAt) return t('statistics.tagNotLoaded')
  if (overview.value.tagCache.stale) {
    return t('statistics.tagStale', { minutes: overview.value.tagCache.ageMinutes ?? 0 })
  }
  return t('statistics.tagFresh', { minutes: overview.value.tagCache.ageMinutes ?? 0 })
})

function resolveIcon(name: string): Component {
  return iconMap[name] ?? BookOpen
}

function formatNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat(locale.value).format(value ?? 0)
}

function formatDate(timestamp: number | null): string {
  if (!timestamp) return t('statistics.never')
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(timestamp)
}

function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split('-').map((value) => Number.parseInt(value, 10))
  return new Intl.DateTimeFormat(locale.value, {
    month: 'short',
    year: '2-digit'
  }).format(new Date(year, month - 1, 1))
}

function formatDayKey(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map((value) => Number.parseInt(value, 10))
  return new Intl.DateTimeFormat(locale.value, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(new Date(year, month - 1, day))
}

async function refreshTags(): Promise<void> {
  await statisticsStore.refreshTags()
}

onMounted(async () => {
  await statisticsStore.fetchOverview()
})

onUnmounted(() => {
  cleanupListener?.()
})
</script>

<template>
  <div class="statistics-view">
    <div class="stats-shell">
      <header class="stats-header">
        <div class="stats-header-copy">
          <div class="stats-header-icon">
            <ChartColumn :size="18" />
          </div>
          <div>
            <p class="eyebrow">{{ t('statistics.eyebrow') }}</p>
            <h1>{{ t('statistics.title') }}</h1>
            <p class="subtitle">{{ t('statistics.subtitle') }}</p>
          </div>
        </div>

        <div class="stats-header-actions">
          <button class="ghost-btn" :disabled="statisticsStore.refreshingTags" @click="refreshTags">
            <RefreshCw :size="14" :class="{ spin: statisticsStore.refreshingTags }" />
            <span>{{ t('statistics.refreshTags') }}</span>
          </button>

          <div class="toggle">
            <button :class="{ active: mode === 'game' }" @click="mode = 'game'">{{ t('statistics.modeGame') }}</button>
            <button :class="{ active: mode === 'plain' }" @click="mode = 'plain'">{{ t('statistics.modePlain') }}</button>
          </div>
        </div>
      </header>

      <div v-if="statisticsStore.loading && !overview" class="state-box">
        <p>{{ t('statistics.loading') }}</p>
      </div>

      <div v-else-if="statisticsStore.error && !overview" class="state-box error">
        <p>{{ statisticsStore.error }}</p>
      </div>

      <template v-else-if="overview">
        <section class="hero-card">
          <div class="hero-avatar-wrap" :class="{ 'has-avatar-frame': skillTreeStore.isUnlocked('avatar_frame') }" :title="t('statistics.changeAvatar')" @click="triggerAvatarUpload">
            <img v-if="settingsStore.profileAvatar" :src="settingsStore.profileAvatar" class="hero-avatar-img" />
            <div v-else class="hero-orb">
              <component :is="resolveIcon(overview.jobIcon)" :size="26" />
            </div>
            <div class="hero-avatar-overlay">
              <Camera :size="16" />
            </div>
            <input ref="avatarInput" type="file" accept="image/*" class="hidden-input" @change="onAvatarChange" />
          </div>

          <div class="hero-copy">
            <p class="hero-level">{{ animatedLevel >= 20 ? t('statistics.maxLevel') : t('statistics.levelLabel', { level: formatNumber(animatedLevel) }) }}</p>
            <div v-if="editingName" class="hero-name-edit">
              <input
                ref="nameInputEl"
                v-model="tempName"
                class="name-input"
                :placeholder="t('statistics.namePlaceholder')"
                @keydown.enter="saveName"
                @keydown.escape="cancelEditName"
                @blur="saveName"
              />
            </div>
            <h2 v-else class="hero-name" :title="t('statistics.editName')" @click="startEditName">
              {{ settingsStore.profileName || overview.jobClass }}
              <span class="edit-hint"><Pencil :size="13" /></span>
            </h2>

            <template v-if="skillTreeStore.isUnlocked('custom_title')">
              <div v-if="editingCustomTitle" class="hero-custom-title-edit">
                <input
                  ref="customTitleInputEl"
                  v-model="tempCustomTitle"
                  class="name-input"
                  :placeholder="t('statistics.customTitlePlaceholder')"
                  @keydown.enter="saveCustomTitle"
                  @keydown.escape="cancelEditCustomTitle"
                  @blur="saveCustomTitle"
                />
              </div>
              <p v-else class="hero-custom-title" @click="startEditCustomTitle">
                {{ settingsStore.customTitle || t('statistics.customTitlePlaceholder') }}
                <span class="edit-hint"><Pencil :size="11" /></span>
              </p>
            </template>

            <p class="hero-secondary">
              {{ overview.jobClass }}{{ overview.secondaryClass ? ' · ' + overview.secondaryClass : '' }}
            </p>

            <div class="hero-badges">
              <span>{{ t('statistics.badges.currentLibrary', { value: formatNumber(animatedManga) }) }}</span>
              <span>{{ t('statistics.badges.allTimeChapters', { value: formatNumber(animatedChapters) }) }}</span>
              <span>{{ overview.favoriteTag?.name || t('statistics.badges.noTag') }}</span>
            </div>

            <div class="xp-track">
              <div class="xp-bar">
                <div class="xp-bar-fill" :style="{ width: `${overview.xpPercent}%` }" />
              </div>
              <span>{{ t('statistics.xpLabel', { current: formatNumber(overview.xpCurrent), target: formatNumber(overview.xpRequired) }) }}</span>
            </div>
          </div>
        </section>

        <div v-if="mode === 'game'" class="game-layout">
          <!-- Left column: Attributes + Activity stacked -->
          <div class="game-col">
            <section class="panel">
              <div class="panel-head">
                <p class="panel-eyebrow">{{ t('statistics.sections.attributes') }}</p>
              </div>

              <div class="attribute-grid">
                <article v-for="card in statCards" :key="card.key" class="attribute-card" :data-tone="card.tone">
                  <p>{{ card.label }}</p>
                  <strong>{{ formatNumber(card.value) }}</strong>
                  <div class="attribute-track">
                    <div class="attribute-fill" :style="{ width: `${card.value}%` }" />
                  </div>
                </article>
              </div>
            </section>

            <section class="panel">
              <div class="panel-head">
                <p class="panel-eyebrow">{{ t('statistics.sections.activity') }}</p>
              </div>

              <div class="streak-grid">
                <article>
                  <span>{{ t('statistics.metrics.activeDays') }}</span>
                  <strong>{{ formatNumber(overview.activeDays) }}</strong>
                </article>
                <article>
                  <span>{{ t('statistics.metrics.currentStreak') }}</span>
                  <strong>{{ formatNumber(overview.currentStreak) }}</strong>
                </article>
                <article>
                  <span>{{ t('statistics.metrics.bestStreak') }}</span>
                  <strong>{{ formatNumber(overview.bestStreak) }}</strong>
                </article>
                <article>
                  <span>{{ t('statistics.metrics.busiestDay') }}</span>
                  <strong>{{ overview.busiestDay ? formatDayKey(overview.busiestDay.date) : t('statistics.never') }}</strong>
                </article>
              </div>

              <div v-if="monthTimeline.length > 0" class="timeline">
                <div v-for="month in monthTimeline" :key="month.key" class="timeline-column">
                  <div class="timeline-bar" :style="{ height: month.height }" />
                  <span>{{ month.label }}</span>
                </div>
              </div>
              <p v-else class="empty-note">{{ t('statistics.noActivity') }}</p>
            </section>
          </div>

          <!-- Middle column: Achievements -->
          <section class="panel">
            <div class="panel-head">
              <p class="panel-eyebrow">{{ t('statistics.sections.achievements') }}</p>
            </div>

            <div class="achievement-grid">
              <article
                v-for="achievement in overview.achievements.slice(0, ACHIEVEMENTS_PREVIEW)"
                :key="achievement.id"
                class="achievement-card"
                :class="{ locked: !achievement.unlocked }"
              >
                <div class="achievement-icon">
                  <component :is="resolveIcon(achievement.icon)" :size="13" />
                </div>
                <strong>{{ t('statistics.achievements.' + achievement.id + '.name') }}</strong>
                <span>{{ t('statistics.achievements.' + achievement.id + '.hint') }}</span>
              </article>
            </div>

            <button
              v-if="overview.achievements.length > ACHIEVEMENTS_PREVIEW"
              class="show-all-btn"
              @click="showAllAchievements = true"
            >
              {{ t('statistics.showAllAchievements', { count: overview.achievements.length }) }}
            </button>
          </section>

          <!-- Right column: Tags -->
          <section class="panel side-panel">
            <div class="panel-head split">
              <div>
                <p class="panel-eyebrow">{{ t('statistics.sections.tags') }}</p>
                <p class="panel-sub">{{ tagMeta }}</p>
              </div>
            </div>

            <div v-if="topTags.length > 0" class="genre-list">
              <div v-for="genre in topTags" :key="genre.name" class="genre-row">
                <span>{{ genre.name }}</span>
                <div class="genre-track">
                  <div
                    class="genre-fill"
                    :style="{ width: `${Math.max(16, Math.round((genre.count / topTags[0].count) * 100))}%` }"
                  />
                </div>
                <strong>{{ formatNumber(genre.count) }}</strong>
              </div>
            </div>
            <p v-else class="empty-note">{{ t('statistics.noTags') }}</p>
          </section>
        </div>

        <div v-else class="plain-layout">
          <section class="summary-grid">
            <article v-for="card in summaryCards" :key="card.key" class="summary-card" :data-tone="card.tone">
              <span>{{ card.label }}</span>
              <strong>{{ card.value }}</strong>
            </article>
          </section>

          <div class="plain-columns">
            <section class="panel">
              <div class="panel-head">
                <p class="panel-eyebrow">{{ t('statistics.sections.collection') }}</p>
              </div>
              <div class="metric-list">
                <div><span>{{ t('statistics.plain.currentLibrary') }}</span><strong>{{ formatNumber(overview.counts.current) }}</strong></div>
                <div><span>{{ t('statistics.plain.deletedLibrary') }}</span><strong>{{ formatNumber(overview.counts.deleted) }}</strong></div>
                <div><span>{{ t('statistics.plain.allTimeLibrary') }}</span><strong>{{ formatNumber(overview.counts.allTime) }}</strong></div>
                <div><span>{{ t('statistics.plain.focusCount') }}</span><strong>{{ formatNumber(overview.focusCount) }}</strong></div>
                <div><span>{{ t('statistics.plain.mangadexLinks') }}</span><strong>{{ formatNumber(overview.linked.mangaDex) }}</strong></div>
                <div><span>{{ t('statistics.plain.comickLinks') }}</span><strong>{{ formatNumber(overview.linked.comick) }}</strong></div>
              </div>
            </section>

            <section class="panel">
              <div class="panel-head">
                <p class="panel-eyebrow">{{ t('statistics.sections.chapters') }}</p>
              </div>
              <div class="metric-list">
                <div><span>{{ t('statistics.plain.currentChapters') }}</span><strong>{{ formatNumber(overview.chapters.current) }}</strong></div>
                <div><span>{{ t('statistics.plain.allTimeChapters') }}</span><strong>{{ formatNumber(overview.chapters.allTime) }}</strong></div>
                <div><span>{{ t('statistics.plain.trackedChapters') }}</span><strong>{{ formatNumber(overview.chapters.tracked) }}</strong></div>
                <div><span>{{ t('statistics.plain.unreadBacklog') }}</span><strong>{{ formatNumber(overview.chapters.unread) }}</strong></div>
                <div><span>{{ t('statistics.plain.averagePerManga') }}</span><strong>{{ formatNumber(overview.chapters.averagePerManga) }}</strong></div>
                <div><span>{{ t('statistics.plain.historyEvents') }}</span><strong>{{ formatNumber(overview.historyEventCount) }}</strong></div>
              </div>
            </section>
          </div>

          <div class="plain-columns">
            <section class="panel">
              <div class="panel-head">
                <p class="panel-eyebrow">{{ t('statistics.sections.statusBreakdown') }}</p>
              </div>
              <div class="status-list">
                <div v-for="row in statusRows" :key="row.key" class="status-row">
                  <div class="status-label">
                    <span>{{ row.label }}</span>
                    <strong>{{ formatNumber(row.count) }}</strong>
                  </div>
                  <div class="status-track">
                    <div class="status-fill" :data-tone="row.tone" :style="{ width: `${Math.max(row.count > 0 ? 8 : 0, row.ratio)}%` }" />
                  </div>
                </div>
              </div>
            </section>

            <section class="panel">
              <div class="panel-head">
                <p class="panel-eyebrow">{{ t('statistics.sections.records') }}</p>
              </div>
              <div class="metric-list">
                <div><span>{{ t('statistics.plain.longestManga') }}</span><strong>{{ overview.longestManga.title }}</strong></div>
                <div><span>{{ t('statistics.plain.longestMangaChapters') }}</span><strong>{{ formatNumber(overview.longestManga.chapters) }}</strong></div>
                <div><span>{{ t('statistics.plain.favoriteTag') }}</span><strong>{{ overview.favoriteTag?.name || t('statistics.badges.noTag') }}</strong></div>
                <div><span>{{ t('statistics.plain.firstTracked') }}</span><strong>{{ formatDate(overview.firstTrackedAt) }}</strong></div>
                <div><span>{{ t('statistics.plain.bestStreak') }}</span><strong>{{ formatNumber(overview.bestStreak) }}</strong></div>
                <div><span>{{ t('statistics.plain.currentClass') }}</span><strong>{{ overview.jobClass }}</strong></div>
              </div>
            </section>
          </div>

          <section class="panel">
            <div class="panel-head">
              <p class="panel-eyebrow">{{ t('statistics.sections.activityTimeline') }}</p>
            </div>
            <div v-if="monthTimeline.length > 0" class="timeline plain-timeline">
              <div v-for="month in monthTimeline" :key="month.key" class="timeline-column">
                <div class="timeline-bar" :style="{ height: month.height }" />
                <strong>{{ formatNumber(month.count) }}</strong>
                <span>{{ month.label }}</span>
              </div>
            </div>
            <p v-else class="empty-note">{{ t('statistics.noActivity') }}</p>
          </section>

          <section class="panel">
            <div class="panel-head split">
              <div>
                <p class="panel-eyebrow">{{ t('statistics.sections.tags') }}</p>
                <p class="panel-sub">{{ tagMeta }}</p>
              </div>
            </div>

            <div v-if="topTags.length > 0" class="genre-list plain-genres">
              <div v-for="genre in topTags" :key="genre.name" class="genre-row">
                <span>{{ genre.name }}</span>
                <div class="genre-track">
                  <div
                    class="genre-fill"
                    :style="{ width: `${Math.max(16, Math.round((genre.count / topTags[0].count) * 100))}%` }"
                  />
                </div>
                <strong>{{ formatNumber(genre.count) }}</strong>
              </div>
            </div>
            <p v-else class="empty-note">{{ t('statistics.noTags') }}</p>
          </section>
        </div>
      </template>
    </div>
  <Teleport to="body">
    <div v-if="showAllAchievements" class="achievement-modal-backdrop" @click.self="showAllAchievements = false">
      <div class="achievement-modal">
        <div class="achievement-modal-head">
          <p class="panel-eyebrow" style="margin:0">{{ t('statistics.sections.achievements') }}</p>
          <button class="modal-close-btn" @click="showAllAchievements = false">
            <X :size="16" />
          </button>
        </div>
        <div class="achievement-grid">
          <article
            v-for="achievement in overview.achievements"
            :key="achievement.id"
            class="achievement-card"
            :class="{ locked: !achievement.unlocked }"
          >
            <div class="achievement-icon">
              <component :is="resolveIcon(achievement.icon)" :size="17" />
            </div>
            <strong>{{ t('statistics.achievements.' + achievement.id + '.name') }}</strong>
            <span>{{ t('statistics.achievements.' + achievement.id + '.hint') }}</span>
          </article>
        </div>
      </div>
    </div>
  </Teleport>
  </div>
</template>

<style scoped>
.statistics-view {
  height: 100%;
  overflow-y: auto;
  padding: 24px;
  background:
    radial-gradient(circle at top right, hsl(var(--primary) / 0.14), transparent 36%),
    radial-gradient(circle at bottom left, hsl(var(--primary) / 0.06), transparent 28%),
    hsl(var(--background));
}

.stats-shell {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-height: 100%;
}

.stats-header,
.hero-card,
.panel,
.summary-card,
.state-box {
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card) / 0.98);
  box-shadow: 0 16px 40px hsl(0 0% 0% / 0.18);
}

.stats-header,
.hero-card,
.panel,
.state-box {
  border-radius: 18px;
}

.stats-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 22px;
}

.stats-header-copy {
  display: flex;
  align-items: center;
  gap: 14px;
}

.stats-header-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

.eyebrow,
.panel-eyebrow,
.hero-level {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 10px;
  font-weight: 700;
  color: hsl(var(--primary));
}

.stats-header h1,
.hero-card h2 {
  margin: 0;
  color: hsl(var(--foreground));
}

.stats-header h1 {
  font-size: 26px;
  line-height: 1;
}

.subtitle,
.panel-sub,
.hero-secondary,
.achievement-card span,
.empty-note {
  margin: 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  line-height: 1.5;
}

.stats-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ghost-btn,
.toggle button {
  border: 1px solid hsl(var(--border));
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  border-radius: 12px;
  cursor: pointer;
  transition: transform 0.18s, background 0.18s, border-color 0.18s;
}

.ghost-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
}

.ghost-btn:hover,
.toggle button:hover {
  transform: translateY(-1px);
  background: hsl(var(--accent));
}

.ghost-btn:disabled {
  opacity: 0.65;
  cursor: progress;
}

.toggle {
  display: inline-flex;
  padding: 4px;
  gap: 4px;
  border-radius: 14px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
}

.toggle button {
  padding: 9px 14px;
  font-size: 12px;
  font-weight: 700;
}

.toggle button.active {
  background: hsl(var(--primary));
  color: hsl(var(--background));
  border-color: transparent;
}

.hero-card {
  display: flex;
  gap: 18px;
  padding: 24px;
  overflow: hidden;
}

.hero-orb {
  width: 88px;
  height: 88px;
  border-radius: 28px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, hsl(var(--primary) / 0.9), hsl(var(--primary) / 0.5));
  color: hsl(var(--background));
  box-shadow: inset 0 1px 0 hsl(0 0% 100% / 0.18);
}

.hero-copy {
  flex: 1;
  min-width: 0;
}

.hero-card h2 {
  font-size: 28px;
  margin-top: 6px;
  margin-bottom: 4px;
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.hero-badges span {
  padding: 7px 10px;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
  font-size: 11px;
  font-weight: 600;
}

.xp-track {
  margin-top: 18px;
}

.xp-track span {
  display: inline-block;
  margin-top: 8px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.xp-bar {
  height: 12px;
  border-radius: 999px;
  background: hsl(var(--secondary));
  overflow: hidden;
}

.xp-bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, hsl(var(--primary)), hsl(var(--primary) / 0.65));
}

.game-layout,
.plain-layout {
  display: grid;
  gap: 18px;
}

.game-layout {
  grid-template-columns: 1fr 1.5fr 1fr;
  align-items: start;
}

.game-col {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.plain-layout,
.plain-columns {
  grid-template-columns: 1fr;
}

.panel {
  padding: 18px;
}

.panel-head {
  margin-bottom: 14px;
}

.panel-head.split {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.attribute-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.attribute-card,
.achievement-card,
.summary-card {
  border-radius: 16px;
}

.attribute-card {
  padding: 14px;
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
}

.attribute-card p,
.summary-card span,
.metric-list span,
.status-label span,
.streak-grid span {
  margin: 0;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.attribute-card strong,
.summary-card strong,
.metric-list strong,
.status-label strong,
.streak-grid strong {
  display: block;
  margin-top: 8px;
  font-size: 24px;
  color: hsl(var(--foreground));
}

.attribute-card[data-tone='gold'] strong,
.summary-card[data-tone='gold'] strong {
  color: hsl(42 88% 58%);
}

.attribute-card[data-tone='blue'] strong,
.summary-card[data-tone='blue'] strong {
  color: hsl(206 90% 61%);
}

.attribute-card[data-tone='green'] strong,
.summary-card[data-tone='green'] strong {
  color: hsl(143 62% 52%);
}

.attribute-track,
.status-track,
.genre-track {
  height: 8px;
  margin-top: 10px;
  border-radius: 999px;
  background: hsl(var(--background));
  overflow: hidden;
}

.attribute-fill,
.genre-fill,
.timeline-bar,
.status-fill {
  height: 100%;
  border-radius: inherit;
}

.attribute-fill,
.genre-fill {
  background: hsl(var(--primary));
}

.achievement-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  justify-content: center;
}

.achievement-card {
  flex: 0 0 160px;
  width: 160px;
  padding: 11px 10px;
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
  position: relative;
  overflow: hidden;
}

.show-all-btn {
  margin-top: 10px;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.show-all-btn:hover {
  background: hsl(var(--secondary));
  color: hsl(var(--foreground));
}

.achievement-modal-backdrop {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.55);
  z-index: 999;
  display: grid;
  place-items: center;
  padding: 20px;
}

.achievement-modal {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 18px;
  padding: 24px;
  max-width: 700px;
  width: 100%;
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  box-shadow: 0 24px 64px hsl(0 0% 0% / 0.4);
}

.achievement-modal-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.modal-close-btn {
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  padding: 5px;
  border-radius: 6px;
  transition: background 0.15s, color 0.15s;
}

.modal-close-btn:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--secondary));
}

.achievement-modal .achievement-grid {
  justify-content: center;
}

.achievement-modal .achievement-card {
  flex: 0 0 190px;
  width: 190px;
  padding: 14px 13px;
}

.achievement-modal .achievement-icon {
  width: 34px;
  height: 34px;
  border-radius: 11px;
  margin-bottom: 10px;
}

.achievement-modal .achievement-card strong {
  font-size: 13px;
  margin-bottom: 5px;
}

.achievement-modal .achievement-card span {
  font-size: 11px;
}

.achievement-card.locked {
  opacity: 0.45;
}

.achievement-icon {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
  margin-bottom: 7px;
}

.achievement-card strong {
  display: block;
  color: hsl(var(--foreground));
  font-size: 11px;
  margin-bottom: 3px;
}

.achievement-card span {
  font-size: 10px;
  line-height: 1.3;
}

.genre-list,
.status-list,
.metric-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.genre-row,
.metric-list > div,
.status-row {
  display: grid;
  gap: 10px;
  align-items: center;
}

.genre-row {
  grid-template-columns: minmax(0, 100px) 1fr auto;
}

.genre-row span:first-child,
.metric-list span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.genre-row strong,
.metric-list strong {
  font-size: 14px;
}

.streak-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.streak-grid article,
.summary-card {
  padding: 16px;
  background: hsl(var(--secondary));
  border: 1px solid hsl(var(--border));
}

.timeline {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(56px, 1fr));
  gap: 10px;
  align-items: end;
  min-height: 180px;
}

.timeline-column {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8px;
  min-height: 180px;
  text-align: center;
}

.timeline-column span,
.timeline-column strong {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.timeline-column strong {
  color: hsl(var(--foreground));
}

.timeline-bar {
  background: hsl(var(--primary) / 0.7);
  min-height: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.plain-columns {
  display: grid;
  gap: 18px;
}

.status-fill[data-tone='reading'] {
  background: hsl(206 90% 61%);
}

.status-fill[data-tone='plan'] {
  background: hsl(280 65% 62%);
}

.status-fill[data-tone='completed'] {
  background: hsl(143 62% 52%);
}

.status-fill[data-tone='hiatus'] {
  background: hsl(31 82% 56%);
}

.status-fill[data-tone='rereading'] {
  background: hsl(190 70% 56%);
}

.status-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.state-box {
  padding: 38px 20px;
  text-align: center;
}

.state-box.error {
  border-color: hsl(0 68% 42% / 0.4);
  color: hsl(0 88% 75%);
}

.empty-note {
  padding: 12px 0 4px;
}

.hero-avatar-wrap {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
  width: 88px;
  height: 88px;
  border-radius: 28px;
  overflow: hidden;
}

.hero-avatar-wrap:hover .hero-avatar-overlay {
  opacity: 1;
}

.hero-avatar-wrap.has-avatar-frame {
  box-shadow:
    0 0 0 3px #f59e0b,
    0 0 0 6px #f59e0b33,
    0 0 20px 4px #f59e0b66;
  animation: avatar-frame-pulse 2.4s ease-in-out infinite;
}

@keyframes avatar-frame-pulse {
  0%, 100% {
    box-shadow:
      0 0 0 3px #f59e0b,
      0 0 0 6px #f59e0b33,
      0 0 20px 4px #f59e0b66;
  }
  50% {
    box-shadow:
      0 0 0 3px #fcd34d,
      0 0 0 8px #fcd34d44,
      0 0 32px 8px #f59e0b99;
  }
}

.hero-custom-title {
  font-size: 11px;
  color: hsl(var(--primary));
  font-style: italic;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 2px 0 4px;
  opacity: 0.9;
}

.hero-custom-title-edit {
  margin: 2px 0 4px;
}

.hero-avatar-overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: hsl(0 0% 0% / 0.5);
  opacity: 0;
  transition: opacity 0.18s;
  color: hsl(var(--foreground));
  border-radius: 28px;
}

.hero-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hidden-input {
  display: none;
}

.hero-name {
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.edit-hint {
  color: hsl(var(--muted-foreground));
  opacity: 0.5;
  line-height: 1;
}

.hero-name-edit {
  margin-top: 6px;
  margin-bottom: 4px;
}

.name-input {
  font-size: 28px;
  font-weight: 700;
  background: transparent;
  border: none;
  border-bottom: 2px solid hsl(var(--primary));
  color: hsl(var(--foreground));
  outline: none;
  width: 100%;
  padding: 0;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 1100px) {
  .game-layout {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .game-layout {
    grid-template-columns: 1fr;
  }
}

/* ── Bar fill animations ── */
@keyframes bar-fill { from { width: 0; } }
@keyframes bar-rise { from { height: 0; } }

.xp-bar-fill {
  animation: bar-fill 1.1s cubic-bezier(0.4, 0, 0.2, 1) both;
}
.attribute-fill {
  animation: bar-fill 0.9s cubic-bezier(0.4, 0, 0.2, 1) both;
}
.genre-fill {
  animation: bar-fill 0.8s cubic-bezier(0.4, 0, 0.2, 1) both;
}
.status-fill {
  animation: bar-fill 0.8s cubic-bezier(0.4, 0, 0.2, 1) both;
}
.timeline-bar {
  animation: bar-rise 0.7s cubic-bezier(0.4, 0, 0.2, 1) both;
}

.attribute-card:nth-child(1) .attribute-fill { animation-delay: 0.00s; }
.attribute-card:nth-child(2) .attribute-fill { animation-delay: 0.06s; }
.attribute-card:nth-child(3) .attribute-fill { animation-delay: 0.12s; }
.attribute-card:nth-child(4) .attribute-fill { animation-delay: 0.18s; }
.attribute-card:nth-child(5) .attribute-fill { animation-delay: 0.24s; }
.attribute-card:nth-child(6) .attribute-fill { animation-delay: 0.30s; }

.timeline-column:nth-child(1) .timeline-bar { animation-delay: 0.00s; }
.timeline-column:nth-child(2) .timeline-bar { animation-delay: 0.05s; }
.timeline-column:nth-child(3) .timeline-bar { animation-delay: 0.10s; }
.timeline-column:nth-child(4) .timeline-bar { animation-delay: 0.15s; }
.timeline-column:nth-child(5) .timeline-bar { animation-delay: 0.20s; }
.timeline-column:nth-child(6) .timeline-bar { animation-delay: 0.25s; }
.timeline-column:nth-child(7) .timeline-bar { animation-delay: 0.30s; }
.timeline-column:nth-child(8) .timeline-bar { animation-delay: 0.35s; }

/* ── Achievement card shine on hover ── */
.achievement-card::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 40%, hsl(0 0% 100% / 0.08) 50%, transparent 60%);
  transform: translateX(-100%);
  transition: transform 0s;
  pointer-events: none;
}
.achievement-card:not(.locked):hover::after {
  transform: translateX(100%);
  transition: transform 0.4s ease;
}

@media (max-width: 920px) {
  .statistics-view {
    padding: 16px;
  }

  .stats-header,
  .hero-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats-header-actions,
  .stats-header {
    width: 100%;
  }

  .stats-header-actions {
    justify-content: space-between;
    flex-wrap: wrap;
  }

  .game-layout,
  .attribute-grid,
  .achievement-grid,
  .summary-grid,
  .plain-columns {
    grid-template-columns: 1fr;
  }

  .hero-avatar-wrap,
  .hero-orb {
    width: 72px;
    height: 72px;
    border-radius: 22px;
  }

  .hero-card h2 {
    font-size: 24px;
  }
}
</style>

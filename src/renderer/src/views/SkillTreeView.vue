<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Target, Bookmark, FileText, History, BookMarked,
  BarChart3, CalendarDays, TrendingUp, Telescope,
  SearchCheck, SlidersHorizontal, Download, ScrollText,
  Sparkles, Pen, Palette, Crown,
  Lock, Check, Zap, GitBranch
} from 'lucide-vue-next'
import { useSkillTreeStore } from '../stores/skill-tree.store'
import { useStatisticsStore } from '../stores/statistics.store'
import { SKILLS, SKILLS_BY_BRANCH } from '../../../shared/skill-tree'
import type { SkillDefinition } from '../../../shared/skill-tree'

const { t } = useI18n()
const skillTreeStore = useSkillTreeStore()
const statsStore = useStatisticsStore()

const level = computed(() => statsStore.overview?.level ?? 1)
const totalSP = computed(() => skillTreeStore.totalSP(level.value))
const spentSP = computed(() => skillTreeStore.spentPoints)
const availSP = computed(() => skillTreeStore.availableSP(level.value))

// Tooltip & long-press state
const justUnlocked = ref<string | null>(null)
const activeTooltip = ref<string | null>(null)
const longPressId = ref<string | null>(null)
const longPressProgress = ref(0)

const LONG_PRESS_MS = 650
let longPressStart = 0
let longPressRaf: number | null = null
let longPressTimer: ReturnType<typeof setTimeout> | null = null
let wasLongPress = false

function onNodeClick(skill: SkillDefinition): void {
  if (wasLongPress) { wasLongPress = false; return }
  activeTooltip.value = activeTooltip.value === skill.id ? null : skill.id
}

function startLongPress(skill: SkillDefinition): void {
  if (nodeState(skill) !== 'available') return
  wasLongPress = false
  longPressId.value = skill.id
  longPressStart = Date.now()
  longPressProgress.value = 0

  function tick(): void {
    const elapsed = Date.now() - longPressStart
    longPressProgress.value = Math.min(100, (elapsed / LONG_PRESS_MS) * 100)
    if (longPressProgress.value < 100) longPressRaf = requestAnimationFrame(tick)
  }
  longPressRaf = requestAnimationFrame(tick)

  longPressTimer = setTimeout(() => {
    if (longPressRaf !== null) { cancelAnimationFrame(longPressRaf); longPressRaf = null }
    longPressTimer = null
    longPressProgress.value = 0
    longPressId.value = null
    wasLongPress = true
    const ok = skillTreeStore.unlockSkill(skill.id, level.value)
    if (ok) {
      justUnlocked.value = skill.id
      activeTooltip.value = null
      setTimeout(() => { justUnlocked.value = null }, 800)
    }
  }, LONG_PRESS_MS)
}

function cancelLongPress(): void {
  if (longPressRaf !== null) { cancelAnimationFrame(longPressRaf); longPressRaf = null }
  if (longPressTimer !== null) { clearTimeout(longPressTimer); longPressTimer = null }
  longPressProgress.value = 0
  longPressId.value = null
}

onUnmounted(cancelLongPress)

function getIcon(iconName: string) {
  const map: Record<string, unknown> = {
    Target, Bookmark, FileText, History, BookMarked,
    BarChart3, CalendarDays, TrendingUp, Telescope,
    SearchCheck, SlidersHorizontal, Download, ScrollText,
    Sparkles, Pen, Palette, Crown
  }
  return map[iconName] ?? Zap
}

function nodeState(skill: SkillDefinition): 'locked' | 'available' | 'unlocked' {
  if (skillTreeStore.isUnlocked(skill.id)) return 'unlocked'
  if (skillTreeStore.isAvailable(skill.id, level.value)) return 'available'
  return 'locked'
}


const BRANCHES: Array<{ key: keyof typeof SKILLS_BY_BRANCH; color: string }> = [
  { key: 'focus',     color: '#a78bfa' },
  { key: 'archive',   color: '#60a5fa' },
  { key: 'analytics', color: '#34d399' },
  { key: 'library',   color: '#fb923c' },
  { key: 'profile',   color: '#f472b6' }
]

const totalCost = computed(() => SKILLS.reduce((s, sk) => s + sk.cost, 0))

function tooltipStyle(branchIdx: number): Record<string, string> {
  if (branchIdx === 0) return { left: '0', transform: 'none' }
  if (branchIdx === BRANCHES.length - 1) return { right: '0', left: 'auto', transform: 'none' }
  return {}
}
</script>

<template>
  <div class="skill-tree-view">
    <!-- ── Header ──────────────────────────────────────────────── -->
    <header class="st-header">
      <div class="st-header-left">
        <GitBranch :size="28" class="st-header-icon" />
        <div>
          <h1 class="st-title">{{ t('skillTree.title') }}</h1>
          <p class="st-subtitle">{{ t('skillTree.subtitle') }}</p>
        </div>
      </div>
      <div class="st-sp-panel">
        <div class="st-sp-row">
          <Zap :size="16" class="st-sp-icon" />
          <span class="st-sp-avail">{{ availSP }}</span>
          <span class="st-sp-label">{{ t('skillTree.spAvailable') }}</span>
        </div>
        <div class="st-sp-meta">
          {{ t('skillTree.spMeta', { level, earned: totalSP, spent: spentSP }) }}
        </div>
        <div class="st-sp-bar-track">
          <div
            class="st-sp-bar-fill"
            :style="{ width: totalCost > 0 ? `${Math.min(100, (spentSP / totalCost) * 100)}%` : '0%' }"
          />
        </div>
        <div class="st-sp-bar-label">{{ t('skillTree.spProgress', { spent: spentSP, total: totalCost }) }}</div>
      </div>
    </header>

    <!-- ── Tree ───────────────────────────────────────────────── -->
    <div class="st-tree" @click.self="activeTooltip = null">
      <div
        v-for="(branch, branchIdx) in BRANCHES"
        :key="branch.key"
        class="st-branch"
      >
        <!-- Branch header -->
        <div class="st-branch-header" :style="{ color: branch.color }">
          <component :is="getIcon(SKILLS_BY_BRANCH[branch.key][0].icon)" :size="22" />
          <span>{{ t('skillTree.branches.' + branch.key) }}</span>
        </div>

        <!-- Nodes -->
        <div class="st-nodes">
          <template v-for="(skill, idx) in SKILLS_BY_BRANCH[branch.key]" :key="skill.id">
            <!-- Connector line above (except first) -->
            <div
              v-if="idx > 0"
              class="st-connector"
              :class="{
                'connector-unlocked': skillTreeStore.isUnlocked(skill.id) || skillTreeStore.isUnlocked(SKILLS_BY_BRANCH[branch.key][idx - 1].id)
              }"
              :style="{ '--branch-color': branch.color }"
            />

            <!-- Skill node -->
            <div
              class="st-node"
              :class="[
                `node-${nodeState(skill)}`,
                { 'node-just-unlocked': justUnlocked === skill.id },
                { 'node-pressing': longPressId === skill.id }
              ]"
              :style="{
                '--branch-color': branch.color,
                '--lp-prog': longPressId === skill.id ? longPressProgress / 100 : 0
              }"
              @click.stop="onNodeClick(skill)"
              @pointerdown="startLongPress(skill)"
              @pointerup="cancelLongPress"
              @pointerleave="cancelLongPress"
              @pointercancel="cancelLongPress"
              @contextmenu.prevent
            >
              <!-- Glow layer (intensifies while pressing) -->
              <div class="node-glow" />

              <!-- Crack SVG (draws itself during long-press) -->
              <svg class="node-cracks" viewBox="0 0 100 100" fill="none" preserveAspectRatio="none" aria-hidden="true">
                <path class="crack c1" d="M50,55 L38,38 L28,30" stroke="var(--branch-color)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path class="crack c2" d="M38,38 L32,48" stroke="var(--branch-color)" stroke-width="1" stroke-linecap="round"/>
                <path class="crack c3" d="M50,55 L66,37 L80,42" stroke="var(--branch-color)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <path class="crack c4" d="M66,37 L70,26" stroke="var(--branch-color)" stroke-width="1" stroke-linecap="round"/>
                <path class="crack c5" d="M50,55 L47,76 L54,90" stroke="var(--branch-color)" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>

              <!-- State ring -->
              <div class="node-ring" />

              <!-- Content -->
              <div class="node-inner">
                <div class="node-icon-wrap">
                  <component :is="getIcon(skill.icon)" :size="26" class="node-icon" />
                  <Lock v-if="nodeState(skill) === 'locked'" :size="11" class="node-lock" />
                  <Check v-if="nodeState(skill) === 'unlocked'" :size="11" class="node-check" />
                </div>
                <p class="node-name">{{ t('skillTree.skills.' + skill.id + '.name') }}</p>
                <div class="node-badges">
                  <span class="node-badge cost">
                    <Zap :size="9" />{{ skill.cost }}
                  </span>
                  <span class="node-badge level">Lv{{ skill.requiresLevel }}</span>
                </div>
              </div>

              <!-- Light rays burst (fires on unlock) -->
              <div class="burst-rays" aria-hidden="true">
                <div v-for="ri in 8" :key="ri" class="burst-ray" :style="{ '--ray-i': ri - 1 }" />
              </div>

              <!-- White flash (fires on unlock) -->
              <div class="unlock-flash" />

              <!-- Long-press fill bar -->
              <div class="lp-bar" />

              <!-- Tooltip -->
              <div
                class="node-tooltip"
                :class="{ 'tooltip-visible': activeTooltip === skill.id }"
                :style="tooltipStyle(branchIdx)"
              >
                <p class="tt-name">{{ t('skillTree.skills.' + skill.id + '.name') }}</p>
                <p class="tt-desc">{{ t('skillTree.skills.' + skill.id + '.desc') }}</p>
                <div class="tt-reqs">
                  <span><Zap :size="11" />{{ skill.cost }} SP</span>
                  <span>Level {{ skill.requiresLevel }}+</span>
                  <span v-if="skill.requiresSkills.length">
                    {{ t('skillTree.requires') }} {{ skill.requiresSkills.map(id => t('skillTree.skills.' + id + '.name')).join(', ') }}
                  </span>
                </div>
                <p v-if="nodeState(skill) === 'available'" class="tt-action">{{ t('skillTree.holdToUnlock') }}</p>
                <p v-else-if="nodeState(skill) === 'unlocked'" class="tt-unlocked">{{ t('skillTree.alreadyUnlocked') }}</p>
                <p v-else class="tt-locked">
                  <span v-if="level < skill.requiresLevel">{{ t('skillTree.requiresLevel', { level: skill.requiresLevel }) }}</span>
                  <span v-else-if="availSP < skill.cost">{{ t('skillTree.notEnoughSP', { current: availSP, required: skill.cost }) }}</span>
                  <span v-else>{{ t('skillTree.prerequisitesMissing') }}</span>
                </p>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.skill-tree-view {
  height: 100%;
  overflow-y: auto;
  background: #0a0a0f;
  color: #e2e8f0;
  font-family: inherit;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

/* ── Header ─────────────────────────────────────────────────────── */
.st-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  flex-wrap: wrap;
}
.st-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.st-header-icon {
  color: hsl(var(--primary));
  filter: drop-shadow(0 0 10px hsl(var(--primary) / 0.6));
  flex-shrink: 0;
}
.st-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: 0.12em;
  background: linear-gradient(135deg, #a78bfa, #f472b6);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  margin: 0 0 4px;
}
.st-subtitle {
  font-size: 12px;
  color: #64748b;
  margin: 0;
}
.st-sp-panel {
  text-align: right;
  min-width: 220px;
}
.st-sp-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  margin-bottom: 4px;
}
.st-sp-icon { color: #fbbf24; }
.st-sp-avail {
  font-size: 28px;
  font-weight: 800;
  color: #fbbf24;
  line-height: 1;
}
.st-sp-label {
  font-size: 13px;
  color: #94a3b8;
  align-self: flex-end;
  padding-bottom: 2px;
}
.st-sp-meta {
  font-size: 11px;
  color: #475569;
  margin-bottom: 8px;
}
.st-sp-bar-track {
  height: 4px;
  border-radius: 2px;
  background: #1e293b;
  overflow: hidden;
}
.st-sp-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #a78bfa, #f472b6);
  transition: width 0.6s ease;
}
.st-sp-bar-label {
  font-size: 10px;
  color: #475569;
  margin-top: 3px;
}

/* ── Tree layout ────────────────────────────────────────────────── */
.st-tree {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) {
  .st-tree {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 560px) {
  .st-tree {
    grid-template-columns: 1fr;
  }
  .node-tooltip {
    width: min(calc(100vw - 48px), 210px);
  }
  .st-header {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;
  }
  .st-sp-panel {
    text-align: left;
    min-width: unset;
  }
  .st-sp-row {
    justify-content: flex-start;
  }
}

/* ── Branch ─────────────────────────────────────────────────────── */
.st-branch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
}
.st-branch-header {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 16px;
}
.st-nodes {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

/* ── Connector ──────────────────────────────────────────────────── */
.st-connector {
  width: 2px;
  height: 28px;
  background: #1e293b;
  transition: background 0.4s;
}
.st-connector.connector-unlocked {
  background: var(--branch-color);
  box-shadow: 0 0 8px var(--branch-color);
}

/* ── Node ───────────────────────────────────────────────────────── */
.st-node {
  position: relative;
  width: 120px;
  cursor: pointer;
  border-radius: 14px;
  padding: 14px 10px 12px;
  border: 1.5px solid #1e293b;
  background: #0f172a;
  transition: transform 0.15s, border-color 0.3s, box-shadow 0.3s;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  overflow: visible;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.st-node:hover .node-tooltip {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

/* ── Glow layer ─────────────────────────────────────────────────── */
.node-glow {
  position: absolute;
  inset: -8px;
  border-radius: 22px;
  background: radial-gradient(ellipse at center, var(--branch-color), transparent 70%);
  pointer-events: none;
  opacity: 0;
  z-index: 0;
}
.node-pressing .node-glow {
  opacity: calc(var(--lp-prog, 0) * 0.45);
}

/* ── Crack SVG ───────────────────────────────────────────────────── */
.node-cracks {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  opacity: 0;
  z-index: 2;
  transition: opacity 0.05s;
}
.node-pressing .node-cracks { opacity: 1; }
.node-just-unlocked .node-cracks { opacity: 1; }

.crack {
  filter: drop-shadow(0 0 3px var(--branch-color));
}
.node-just-unlocked .crack {
  stroke-dashoffset: 0 !important;
  filter: drop-shadow(0 0 5px var(--branch-color)) drop-shadow(0 0 10px white);
}

/* Each crack: dasharray = path length, offset animates 100% → 0 */
.c1 { stroke-dasharray: 34; stroke-dashoffset: 34; }
.c2 { stroke-dasharray: 12; stroke-dashoffset: 12; }
.c3 { stroke-dasharray: 39; stroke-dashoffset: 39; }
.c4 { stroke-dasharray: 12; stroke-dashoffset: 12; }
.c5 { stroke-dasharray: 35; stroke-dashoffset: 35; }

.node-pressing .c1 { animation: draw-c1 620ms   0ms ease-out forwards; }
.node-pressing .c2 { animation: draw-c2 280ms 190ms ease-out forwards; }
.node-pressing .c3 { animation: draw-c3 580ms  45ms ease-out forwards; }
.node-pressing .c4 { animation: draw-c4 230ms 255ms ease-out forwards; }
.node-pressing .c5 { animation: draw-c5 600ms  70ms ease-out forwards; }

@keyframes draw-c1 { from { stroke-dashoffset: 34; } to { stroke-dashoffset: 0; } }
@keyframes draw-c2 { from { stroke-dashoffset: 12; } to { stroke-dashoffset: 0; } }
@keyframes draw-c3 { from { stroke-dashoffset: 39; } to { stroke-dashoffset: 0; } }
@keyframes draw-c4 { from { stroke-dashoffset: 12; } to { stroke-dashoffset: 0; } }
@keyframes draw-c5 { from { stroke-dashoffset: 35; } to { stroke-dashoffset: 0; } }

/* ── Long-press fill bar ─────────────────────────────────────────── */
.lp-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: calc(var(--lp-prog, 0) * 100%);
  background: linear-gradient(90deg, var(--branch-color), white);
  box-shadow: 0 0 10px var(--branch-color), 0 0 20px var(--branch-color);
  border-radius: 0 0 14px 14px;
  opacity: 0;
  transition: opacity 0.1s;
  pointer-events: none;
  z-index: 6;
}
.node-pressing .lp-bar { opacity: 1; }

/* ── Pressing state ──────────────────────────────────────────────── */
.node-pressing {
  transform: scale(0.97);
  z-index: 10;
  filter: brightness(calc(1 + var(--lp-prog, 0) * 0.9)) saturate(calc(1 + var(--lp-prog, 0) * 0.5));
}

/* ── Light rays (burst on unlock) ────────────────────────────────── */
.burst-rays {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 4;
  opacity: 0;
}
.node-just-unlocked .burst-rays {
  animation: rays-fade 0.75s ease-out forwards;
}
@keyframes rays-fade {
  0%   { opacity: 1; }
  80%  { opacity: 0.6; }
  100% { opacity: 0; }
}

.burst-ray {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 2px;
  height: 0;
  background: linear-gradient(to bottom, white 0%, var(--branch-color) 40%, transparent 100%);
  border-radius: 1px;
  transform-origin: top center;
  transform: translateX(-50%) rotate(calc(var(--ray-i, 0) * 45deg));
  opacity: 0;
  filter: blur(0.5px);
}
.node-just-unlocked .burst-ray {
  animation: ray-shoot 0.65s calc(var(--ray-i, 0) * 12ms) cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
}
@keyframes ray-shoot {
  0%   { height: 0;    opacity: 0; }
  15%  { height: 20px; opacity: 1; }
  55%  { height: 80px; opacity: 0.9; }
  100% { height: 90px; opacity: 0; }
}

/* ── White flash (unlock) ────────────────────────────────────────── */
.unlock-flash {
  position: absolute;
  inset: -12px;
  border-radius: 20px;
  background: radial-gradient(ellipse at center, white 0%, var(--branch-color) 40%, transparent 70%);
  pointer-events: none;
  opacity: 0;
  z-index: 5;
}
.node-just-unlocked .unlock-flash {
  animation: flash-out 0.6s ease-out forwards;
}
@keyframes flash-out {
  0%   { opacity: 0; }
  12%  { opacity: 1; }
  100% { opacity: 0; }
}

/* States */
.node-locked {
  opacity: 0.45;
  cursor: default;
}
.node-available {
  border-color: var(--branch-color);
  box-shadow: 0 0 14px var(--branch-color, hsl(var(--primary))) / 0.35;
  cursor: pointer;
}
.node-available:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 24px color-mix(in srgb, var(--branch-color) 50%, transparent);
}
.node-unlocked {
  border-color: var(--branch-color);
  background: color-mix(in srgb, var(--branch-color) 8%, #0f172a);
  box-shadow: 0 0 18px color-mix(in srgb, var(--branch-color) 40%, transparent);
}

/* Pulsing ring for available nodes */
.node-ring {
  display: none;
}
.node-available .node-ring {
  display: block;
  position: absolute;
  inset: -5px;
  border-radius: 18px;
  border: 1.5px solid var(--branch-color);
  opacity: 0;
  animation: ring-pulse 2s ease-in-out infinite;
  pointer-events: none;
}
@keyframes ring-pulse {
  0%, 100% { opacity: 0; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.04); }
}

/* Unlock burst animation */
.node-just-unlocked {
  animation: unlock-burst 0.75s cubic-bezier(0.22, 1, 0.36, 1) both;
  z-index: 10;
}
@keyframes unlock-burst {
  0%   { transform: scale(0.97);  filter: brightness(1); }
  10%  { transform: scale(1.22);  filter: brightness(3) saturate(2); box-shadow: 0 0 60px var(--branch-color), 0 0 120px var(--branch-color); }
  40%  { transform: scale(1.06);  filter: brightness(1.6); box-shadow: 0 0 30px var(--branch-color); }
  70%  { transform: scale(1.02);  filter: brightness(1.2); }
  100% { transform: scale(1);     filter: brightness(1); }
}

/* Node internals */
.node-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 7px;
  width: 100%;
}
.node-icon-wrap {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: #1e293b;
  display: flex;
  align-items: center;
  justify-content: center;
}
.node-unlocked .node-icon-wrap {
  background: color-mix(in srgb, var(--branch-color) 18%, #1e293b);
}
.node-icon {
  color: #64748b;
  transition: color 0.3s;
}
.node-available .node-icon,
.node-unlocked .node-icon {
  color: var(--branch-color);
  filter: drop-shadow(0 0 6px var(--branch-color));
}
.node-lock {
  position: absolute;
  bottom: -3px;
  right: -3px;
  background: #1e293b;
  border-radius: 50%;
  padding: 2px;
  color: #475569;
}
.node-check {
  position: absolute;
  bottom: -3px;
  right: -3px;
  background: #16a34a;
  border-radius: 50%;
  padding: 2px;
  color: #fff;
}
.node-name {
  font-size: 11px;
  font-weight: 600;
  color: #cbd5e1;
  line-height: 1.3;
  margin: 0;
}
.node-locked .node-name { color: #475569; }
.node-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: center;
}
.node-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 9px;
  font-weight: 700;
  padding: 2px 5px;
  border-radius: 4px;
  line-height: 1;
}
.node-badge.cost {
  background: #1e293b;
  color: #fbbf24;
}
.node-badge.level {
  background: #1e293b;
  color: #64748b;
}
.node-unlocked .node-badge.cost { color: var(--branch-color); }
.node-unlocked .node-badge.level { color: #94a3b8; }

/* ── Tooltip ────────────────────────────────────────────────────── */
.node-tooltip {
  position: absolute;
  bottom: calc(100% + 10px);
  left: 50%;
  transform: translateX(-50%) translateY(6px);
  width: 210px;
  background: #1e293b;
  border: 1px solid #334155;
  border-radius: 10px;
  padding: 12px;
  font-size: 11px;
  line-height: 1.5;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s, transform 0.15s;
  z-index: 100;
  text-align: left;
  overflow: visible;
}
.node-tooltip.tooltip-visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}
.tt-name {
  font-weight: 700;
  color: #e2e8f0;
  margin: 0 0 5px;
  font-size: 12px;
}
.tt-desc {
  color: #94a3b8;
  margin: 0 0 8px;
}
.tt-reqs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  color: #64748b;
  font-size: 10px;
  margin-bottom: 8px;
}
.tt-reqs span {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tt-action {
  margin: 0;
  color: #fbbf24;
  font-weight: 600;
  font-size: 10px;
}
.tt-unlocked {
  margin: 0;
  color: #4ade80;
  font-weight: 600;
  font-size: 10px;
}
.tt-locked {
  margin: 0;
  color: #ef4444;
  font-size: 10px;
}
</style>

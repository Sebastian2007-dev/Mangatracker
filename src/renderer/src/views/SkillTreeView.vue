<script setup lang="ts">
import { computed, ref } from 'vue'
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

const skillTreeStore = useSkillTreeStore()
const statsStore = useStatisticsStore()

const level = computed(() => statsStore.overview?.level ?? 1)
const totalSP = computed(() => skillTreeStore.totalSP(level.value))
const spentSP = computed(() => skillTreeStore.spentPoints)
const availSP = computed(() => skillTreeStore.availableSP(level.value))

// Last unlocked node (for animation)
const justUnlocked = ref<string | null>(null)

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

function tryUnlock(skill: SkillDefinition): void {
  if (nodeState(skill) !== 'available') return
  const ok = skillTreeStore.unlockSkill(skill.id, level.value)
  if (ok) {
    justUnlocked.value = skill.id
    setTimeout(() => { justUnlocked.value = null }, 800)
  }
}

const BRANCHES: Array<{ key: keyof typeof SKILLS_BY_BRANCH; label: string; color: string }> = [
  { key: 'focus',     label: 'Fokus',      color: '#a78bfa' },
  { key: 'archive',   label: 'Archiv',     color: '#60a5fa' },
  { key: 'analytics', label: 'Analytik',   color: '#34d399' },
  { key: 'library',   label: 'Bibliothek', color: '#fb923c' },
  { key: 'profile',   label: 'Profil',     color: '#f472b6' }
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
          <h1 class="st-title">SKILL TREE</h1>
          <p class="st-subtitle">Schalte dauerhaft neue Fähigkeiten frei</p>
        </div>
      </div>
      <div class="st-sp-panel">
        <div class="st-sp-row">
          <Zap :size="16" class="st-sp-icon" />
          <span class="st-sp-avail">{{ availSP }}</span>
          <span class="st-sp-label">SP verfügbar</span>
        </div>
        <div class="st-sp-meta">
          Level {{ level }} · {{ totalSP }} verdient · {{ spentSP }} ausgegeben
        </div>
        <div class="st-sp-bar-track">
          <div
            class="st-sp-bar-fill"
            :style="{ width: totalCost > 0 ? `${Math.min(100, (spentSP / totalCost) * 100)}%` : '0%' }"
          />
        </div>
        <div class="st-sp-bar-label">{{ spentSP }} / {{ totalCost }} SP freigeschaltet</div>
      </div>
    </header>

    <!-- ── Tree ───────────────────────────────────────────────── -->
    <div class="st-tree">
      <div
        v-for="(branch, branchIdx) in BRANCHES"
        :key="branch.key"
        class="st-branch"
      >
        <!-- Branch header -->
        <div class="st-branch-header" :style="{ color: branch.color }">
          <component :is="getIcon(SKILLS_BY_BRANCH[branch.key][0].icon)" :size="22" />
          <span>{{ branch.label }}</span>
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
              :class="[`node-${nodeState(skill)}`, { 'node-just-unlocked': justUnlocked === skill.id }]"
              :style="{ '--branch-color': branch.color }"
              :title="skill.description"
              @click="tryUnlock(skill)"
            >
              <!-- State ring -->
              <div class="node-ring" />

              <!-- Content -->
              <div class="node-inner">
                <div class="node-icon-wrap">
                  <component :is="getIcon(skill.icon)" :size="26" class="node-icon" />
                  <Lock v-if="nodeState(skill) === 'locked'" :size="11" class="node-lock" />
                  <Check v-if="nodeState(skill) === 'unlocked'" :size="11" class="node-check" />
                </div>
                <p class="node-name">{{ skill.name }}</p>
                <div class="node-badges">
                  <span class="node-badge cost">
                    <Zap :size="9" />{{ skill.cost }}
                  </span>
                  <span class="node-badge level">Lv{{ skill.requiresLevel }}</span>
                </div>
              </div>

              <!-- Tooltip -->
              <div class="node-tooltip" :style="tooltipStyle(branchIdx)">
                <p class="tt-name">{{ skill.name }}</p>
                <p class="tt-desc">{{ skill.description }}</p>
                <div class="tt-reqs">
                  <span><Zap :size="11" />{{ skill.cost }} SP</span>
                  <span>Level {{ skill.requiresLevel }}+</span>
                  <span v-if="skill.requiresSkills.length">
                    Benötigt: {{ skill.requiresSkills.map(id => SKILLS.find(s => s.id === id)?.name ?? id).join(', ') }}
                  </span>
                </div>
                <p v-if="nodeState(skill) === 'available'" class="tt-action">Klicken zum Freischalten</p>
                <p v-else-if="nodeState(skill) === 'unlocked'" class="tt-unlocked">✓ Freigeschaltet</p>
                <p v-else class="tt-locked">
                  <span v-if="level < skill.requiresLevel">Benötigt Level {{ skill.requiresLevel }}</span>
                  <span v-else-if="availSP < skill.cost">Nicht genug SP ({{ availSP }}/{{ skill.cost }})</span>
                  <span v-else>Voraussetzungen fehlen</span>
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
}
.st-node:hover .node-tooltip {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
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
  animation: unlock-burst 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes unlock-burst {
  0%   { transform: scale(1); }
  40%  { transform: scale(1.14); box-shadow: 0 0 40px var(--branch-color); }
  100% { transform: scale(1); }
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

<script setup lang="ts">
import { nextTick, onMounted, ref, watch, computed } from 'vue'
import { useStatisticsStore } from '../stores/statistics.store'
import { useLevelUpStore } from '../stores/level-up.store'
import { useAchievementToastStore } from '../stores/achievement-toast.store'
import { useSkillTreeStore } from '../stores/skill-tree.store'
import { SKILLS } from '../../../shared/skill-tree'
import { LEVEL_THRESHOLDS } from '../../../shared/statistics'
import { getBridge } from '../services/platform'

const statisticsStore = useStatisticsStore()
const levelUpStore = useLevelUpStore()
const achievementStore = useAchievementToastStore()
const skillTreeStore = useSkillTreeStore()
const api = getBridge()

type OutputLine = { text: string; type: 'cmd' | 'ok' | 'err' | 'info' }
interface Suggestion {
  insert: string      // full text to put in input
  label: string       // text shown in left column
  description: string // text shown in right column
  kind: 'cmd' | 'sub' | 'id'
}

const input = ref('')
const output = ref<OutputLine[]>([])
const inputEl = ref<HTMLInputElement | null>(null)
const outputEl = ref<HTMLElement | null>(null)
const cmdHistory: string[] = []
let historyIndex = -1

// ── Autocomplete ─────────────────────────────────────────────────
const suggestions = ref<Suggestion[]>([])
const selectedIdx = ref(-1)

const activePart = computed(() => {
  if (input.value.endsWith(' ')) return ''
  const parts = input.value.trim().split(/\s+/)
  return parts[parts.length - 1] ?? ''
})

function computeSuggestions(raw: string): Suggestion[] {
  if (!raw.trim()) return []
  const endsWithSpace = raw.endsWith(' ')
  const parts = raw.trim().split(/\s+/)
  const cmd = parts[0].toLowerCase()

  // ── Root level ──────────────────────────────────────────────
  if (parts.length === 1 && !endsWithSpace) {
    const q = cmd
    const ROOT: Suggestion[] = [
      { insert: 'help',              label: 'help',                        description: 'Show all commands',           kind: 'cmd' },
      { insert: 'levelup',           label: 'levelup [from] [to]',         description: 'Trigger level-up overlay',    kind: 'cmd' },
      { insert: 'achievement',       label: 'achievement <id|random|all>', description: 'Show achievement toast',      kind: 'cmd' },
      { insert: 'clearlevel',        label: 'clearlevel',                  description: 'Reset stored level',          kind: 'cmd' },
      { insert: 'clearachievements', label: 'clearachievements',           description: 'Reset seen achievements',     kind: 'cmd' },
      { insert: 'skills',            label: 'skills <sub>',                description: 'Manage skill tree',           kind: 'cmd' },
      { insert: 'stats',             label: 'stats <sub>',                 description: 'View / reset statistics',     kind: 'cmd' },
    ]
    return ROOT.filter((s) => s.insert.startsWith(q) && s.insert !== q)
  }

  // ── skills ───────────────────────────────────────────────────
  if (cmd === 'skills') {
    const SUBS: Suggestion[] = [
      { insert: 'skills list',   label: 'list',        description: 'List all skills and status',    kind: 'sub' },
      { insert: 'skills unlock', label: 'unlock <id>', description: 'Force-unlock a skill',          kind: 'sub' },
      { insert: 'skills reset',  label: 'reset',       description: 'Reset all unlocked skills',     kind: 'sub' },
    ]
    // typing subcommand
    if (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) {
      const q = parts[1]?.toLowerCase() ?? ''
      return SUBS.filter((s) => s.label.split(' ')[0].startsWith(q))
    }
    // typing skill id after "skills unlock"
    if (parts[1]?.toLowerCase() === 'unlock' && (parts.length === 2 || (parts.length === 3 && !endsWithSpace))) {
      const q = (parts[2] ?? '').toLowerCase()
      return SKILLS
        .filter((s) => s.id.startsWith(q))
        .map((s) => ({
          insert: `skills unlock ${s.id}`,
          label: s.id,
          description: `${s.name} — ${s.cost} SP · Lv${s.requiresLevel}`,
          kind: 'id' as const
        }))
    }
  }

  // ── stats ─────────────────────────────────────────────────────
  if (cmd === 'stats') {
    const SUBS: Suggestion[] = [
      { insert: 'stats info',              label: 'info',                description: 'Show current stats summary',        kind: 'sub' },
      { insert: 'stats reset',             label: 'reset',               description: 'Clear all stat events + achievements', kind: 'sub' },
      { insert: 'stats chapters',          label: 'chapters <n>',        description: 'Set total chapter count',            kind: 'sub' },
      { insert: 'stats level',             label: 'level <n>',           description: 'Set to min chapters for level n',    kind: 'sub' },
      { insert: 'stats achievements reset',label: 'achievements reset',  description: 'Reset only earned achievements',     kind: 'sub' },
    ]
    if (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) {
      const q = parts[1]?.toLowerCase() ?? ''
      return SUBS.filter((s) => s.label.split(' ')[0].startsWith(q))
    }
    // typing level number
    if (parts[1]?.toLowerCase() === 'level' && (parts.length === 2 || (parts.length === 3 && !endsWithSpace))) {
      return LEVEL_THRESHOLDS.map((xp, i) => ({
        insert: `stats level ${i + 1}`,
        label: `${i + 1}`,
        description: `Level ${i + 1} — ${xp.toLocaleString()} chapters`,
        kind: 'id' as const
      })).filter((s) => s.label.startsWith(parts[2] ?? ''))
    }
  }

  // ── achievement ───────────────────────────────────────────────
  if (cmd === 'achievement') {
    if (parts.length === 1 || (parts.length === 2 && !endsWithSpace)) {
      const q = (parts[1] ?? '').toLowerCase()
      const BASE: Suggestion[] = [
        { insert: 'achievement random', label: 'random', description: 'Random achievement toast',        kind: 'sub' },
        { insert: 'achievement all',    label: 'all',    description: 'Queue all achievement toasts',    kind: 'sub' },
      ]
      const ach: Suggestion[] = (statisticsStore.overview?.achievements ?? []).map((a) => ({
        insert: `achievement ${a.id}`,
        label: a.id,
        description: a.id.replace(/_/g, ' '),
        kind: 'id' as const
      }))
      return [...BASE, ...ach].filter((s) => s.label.startsWith(q))
    }
  }

  // ── levelup ───────────────────────────────────────────────────
  if (cmd === 'levelup' && parts.length === 1) {
    return [{ insert: 'levelup 1 2', label: '<from> <to>', description: 'e.g. levelup 7 8', kind: 'sub' }]
  }

  return []
}

watch(input, (val) => {
  suggestions.value = computeSuggestions(val).slice(0, 10)
  selectedIdx.value = -1
})

function applySuggestion(s: Suggestion): void {
  input.value = s.insert + ' '
  nextTick(() => inputEl.value?.focus())
}

// ── Bold the matching portion of label ───────────────────────────
function matchParts(label: string, query: string): [string, string, string] {
  if (!query) return ['', '', label]
  const lo = label.toLowerCase()
  const qi = lo.indexOf(query.toLowerCase())
  if (qi < 0) return ['', '', label]
  return [label.slice(0, qi), label.slice(qi, qi + query.length), label.slice(qi + query.length)]
}

// ── Help text ────────────────────────────────────────────────────
const HELP_TEXT = [
  'Available commands:',
  '  levelup                 — trigger level-up overlay (demo: 4 → 5)',
  '  levelup <from> <to>     — e.g. levelup 7 8',
  '  achievement <id>        — show toast for specific achievement',
  '  achievement random      — show toast for random achievement',
  '  achievement all         — queue all achievements as toasts',
  '  clearlevel              — reset stored level (localStorage)',
  '  clearachievements       — reset seen achievements (localStorage)',
  '  skills list             — list all skills and their status',
  '  skills unlock <id>      — force unlock a skill (bypasses SP/level check)',
  '  skills reset            — reset all unlocked skills',
  '  stats info              — show current stats summary',
  '  stats reset             — clear all stat events + earned achievements',
  '  stats chapters <n>      — set total chapter count to n',
  '  stats level <n>         — set chapters to minimum for level n (1–20)',
  '  stats achievements reset — reset only earned achievements',
  '  help                    — show this list',
]

function print(text: string, type: OutputLine['type'] = 'info'): void {
  output.value.push({ text, type })
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight
  })
}

async function execute(raw: string): Promise<void> {
  const cmd = raw.trim()
  if (!cmd) return

  print(`› ${cmd}`, 'cmd')
  cmdHistory.unshift(cmd)
  if (cmdHistory.length > 50) cmdHistory.pop()
  historyIndex = -1

  const parts = cmd.split(/\s+/)
  const name = parts[0].toLowerCase()
  const args = parts.slice(1)

  if (name === 'help') {
    HELP_TEXT.forEach((line) => print(line, 'info'))
    return
  }

  if (name === 'levelup') {
    const from = args[0] !== undefined ? parseInt(args[0], 10) : 4
    const to   = args[1] !== undefined ? parseInt(args[1], 10) : 5
    if (isNaN(from) || isNaN(to) || to <= from) {
      print('Error: invalid levels. Usage: levelup <from> <to> (to must be > from)', 'err')
      return
    }
    levelUpStore.forceShow(from, to)
    print(`✓ Level-up overlay triggered (${from} → ${to})`, 'ok')
    return
  }

  if (name === 'achievement') {
    const sub = args[0]?.toLowerCase()
    const achievements = statisticsStore.overview?.achievements ?? []
    if (!sub) { print('Error: usage: achievement <id | random | all>', 'err'); return }
    if (sub === 'random') {
      if (achievements.length === 0) { print('Error: no achievements loaded (open Statistics page first)', 'err'); return }
      const pick = achievements[Math.floor(Math.random() * achievements.length)]
      achievementStore.forceShow(pick.id, pick.icon)
      print(`✓ Toast triggered: ${pick.id}`, 'ok')
      return
    }
    if (sub === 'all') {
      if (achievements.length === 0) { print('Error: no achievements loaded (open Statistics page first)', 'err'); return }
      achievements.forEach((a) => achievementStore.forceShow(a.id, a.icon))
      print(`✓ Queued ${achievements.length} achievement toasts`, 'ok')
      return
    }
    const found = achievements.find((a) => a.id === sub)
    if (!found) {
      achievementStore.forceShow(sub, 'Sparkles')
      print(`✓ Toast triggered: ${sub} (icon unknown — load Statistics first for correct icon)`, 'ok')
      return
    }
    achievementStore.forceShow(found.id, found.icon)
    print(`✓ Toast triggered: ${found.id}`, 'ok')
    return
  }

  if (name === 'clearlevel') {
    localStorage.removeItem('mangatracker:known_level')
    print('✓ Cleared mangatracker:known_level', 'ok')
    return
  }

  if (name === 'clearachievements') {
    localStorage.removeItem('mangatracker:seen_achievements')
    print('✓ Cleared mangatracker:seen_achievements', 'ok')
    return
  }

  if (name === 'skills') {
    const sub = args[0]?.toLowerCase()
    if (sub === 'list') {
      const level = statisticsStore.overview?.level ?? 1
      print(`Skills (Level ${level} · ${skillTreeStore.availableSP(level)} SP verfügbar):`, 'info')
      SKILLS.forEach((skill) => {
        const state = skillTreeStore.isUnlocked(skill.id)
          ? '✓ unlocked'
          : skillTreeStore.isAvailable(skill.id, level)
            ? '⚡ available'
            : '✗ locked'
        print(`  ${state.padEnd(14)} [${skill.id}] ${skill.name} (${skill.cost} SP, Lv${skill.requiresLevel})`, 'info')
      })
      return
    }
    if (sub === 'unlock') {
      const id = args[1]
      if (!id) { print('Error: usage: skills unlock <id>', 'err'); return }
      const skill = SKILLS.find((s) => s.id === id)
      if (!skill) { print(`Error: unknown skill id "${id}"`, 'err'); return }
      if (skillTreeStore.isUnlocked(id)) { print(`Already unlocked: ${id}`, 'info'); return }
      skillTreeStore.unlockedSkills.push(id)
      skillTreeStore.save()
      print(`✓ Force-unlocked: ${skill.name} [${id}]`, 'ok')
      return
    }
    if (sub === 'reset') {
      skillTreeStore.reset()
      print('✓ Skill tree reset — all skills cleared', 'ok')
      return
    }
    print('Error: usage: skills list | skills unlock <id> | skills reset', 'err')
    return
  }

  if (name === 'stats') {
    const sub = args[0]?.toLowerCase()

    if (sub === 'info') {
      const ov = statisticsStore.overview
      if (!ov) { print('Error: no stats loaded (open Statistics page first)', 'err'); return }
      print(`Level ${ov.level} · ${ov.chapters.allTime} chapters · streak ${ov.currentStreak}d`, 'info')
      print(`Manga: ${ov.counts.current} active · ${ov.statusCounts.completed ?? 0} completed`, 'info')
      print(`Achievements: ${ov.achievements.filter((a) => a.unlocked).length}/${ov.achievements.length} unlocked`, 'info')
      return
    }

    if (sub === 'reset') {
      await api.invoke('stats:debug:reset')
      await statisticsStore.fetchOverview()
      print('✓ All stat events + earned achievements cleared', 'ok')
      print('  (Stats will regenerate from manga list on next open)', 'info')
      return
    }

    if (sub === 'chapters') {
      const n = parseInt(args[1] ?? '', 10)
      if (isNaN(n) || n < 0) { print('Error: usage: stats chapters <number>', 'err'); return }
      await api.invoke('stats:debug:setChapters', { chapters: n })
      await statisticsStore.fetchOverview()
      const lv = statisticsStore.overview?.level ?? '?'
      print(`✓ Chapter count set to ${n.toLocaleString()} → Level ${lv}`, 'ok')
      return
    }

    if (sub === 'level') {
      const lv = parseInt(args[1] ?? '', 10)
      if (isNaN(lv) || lv < 1 || lv > LEVEL_THRESHOLDS.length) {
        print(`Error: usage: stats level <1–${LEVEL_THRESHOLDS.length}>`, 'err')
        return
      }
      const chapters = LEVEL_THRESHOLDS[lv - 1]
      await api.invoke('stats:debug:setChapters', { chapters })
      await statisticsStore.fetchOverview()
      print(`✓ Set to Level ${lv} (${chapters.toLocaleString()} chapters)`, 'ok')
      return
    }

    if (sub === 'achievements' && args[1]?.toLowerCase() === 'reset') {
      await api.invoke('stats:debug:resetAchievements')
      await statisticsStore.fetchOverview()
      print('✓ Earned achievements cleared', 'ok')
      return
    }

    print('Error: usage: stats info | stats reset | stats chapters <n> | stats level <n> | stats achievements reset', 'err')
    return
  }

  print(`Unknown command: "${name}". Type help for a list of commands.`, 'err')
}

function submit(): void {
  const cmd = input.value.trim()
  input.value = ''
  void execute(cmd)
}

function historyUp(): void {
  if (cmdHistory.length === 0) return
  historyIndex = Math.min(historyIndex + 1, cmdHistory.length - 1)
  input.value = cmdHistory[historyIndex]
}

function historyDown(): void {
  if (historyIndex <= 0) { historyIndex = -1; input.value = ''; return }
  historyIndex -= 1
  input.value = cmdHistory[historyIndex]
}

function onKeydown(e: KeyboardEvent): void {
  if (suggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      selectedIdx.value = Math.min(selectedIdx.value + 1, suggestions.value.length - 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      selectedIdx.value = Math.max(selectedIdx.value - 1, -1)
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      applySuggestion(suggestions.value[Math.max(selectedIdx.value, 0)])
      return
    }
    if (e.key === 'Enter' && selectedIdx.value >= 0) {
      e.preventDefault()
      applySuggestion(suggestions.value[selectedIdx.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      suggestions.value = []
      selectedIdx.value = -1
      return
    }
  } else {
    if (e.key === 'ArrowUp')   { e.preventDefault(); historyUp();   return }
    if (e.key === 'ArrowDown') { e.preventDefault(); historyDown(); return }
    if (e.key === 'Tab')       { e.preventDefault(); return }
  }
  if (e.key === 'Enter') { e.preventDefault(); submit() }
}

onMounted(() => {
  print('MangaTracker Debug Terminal', 'info')
  print('Type help for available commands.', 'info')
  inputEl.value?.focus()
})
</script>

<template>
  <div class="dbg-shell" @click="inputEl?.focus()">
    <div class="dbg-header">
      <span class="dbg-dot red" />
      <span class="dbg-dot yellow" />
      <span class="dbg-dot green" />
      <span class="dbg-title">debug terminal</span>
    </div>

    <div ref="outputEl" class="dbg-output">
      <div
        v-for="(line, i) in output"
        :key="i"
        class="dbg-line"
        :class="line.type"
      >{{ line.text }}</div>
    </div>

    <div class="dbg-input-row">
      <!-- Autocomplete popup -->
      <div v-if="suggestions.length > 0" class="dbg-suggestions" @click.stop>
        <div
          v-for="(s, i) in suggestions"
          :key="s.insert"
          class="dbg-sug"
          :class="{ 'dbg-sug--selected': i === selectedIdx }"
          @mousedown.prevent="applySuggestion(s)"
          @mousemove="selectedIdx = i"
        >
          <span class="sug-kind" :data-kind="s.kind">
            {{ s.kind === 'cmd' ? '>_' : s.kind === 'sub' ? '›' : '#' }}
          </span>
          <span class="sug-label">
            <span class="sug-pre">{{ matchParts(s.label, activePart)[0] }}</span>
            <span class="sug-match">{{ matchParts(s.label, activePart)[1] }}</span>
            <span class="sug-post">{{ matchParts(s.label, activePart)[2] }}</span>
          </span>
          <span class="sug-desc">{{ s.description }}</span>
          <span v-if="i === selectedIdx" class="sug-hint">↵</span>
        </div>
      </div>

      <span class="dbg-prompt">›</span>
      <input
        ref="inputEl"
        v-model="input"
        class="dbg-input"
        spellcheck="false"
        autocomplete="off"
        placeholder="type a command..."
        @keydown="onKeydown"
      />
    </div>
  </div>
</template>

<style scoped>
.dbg-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #0d1117;
  color: #c9d1d9;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', 'Menlo', monospace;
  font-size: 13px;
  line-height: 1.6;
  cursor: text;
}

/* ─── Header bar ────────────────────────────────────────── */
.dbg-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px 8px;
  background: #161b22;
  border-bottom: 1px solid #21262d;
  flex-shrink: 0;
}
.dbg-dot { width: 12px; height: 12px; border-radius: 50%; }
.dbg-dot.red    { background: #f85149; }
.dbg-dot.yellow { background: #e3b341; }
.dbg-dot.green  { background: #3fb950; }
.dbg-title {
  margin-left: 8px;
  font-size: 11px;
  color: #8b949e;
  letter-spacing: 0.06em;
  text-transform: lowercase;
}

/* ─── Output area ───────────────────────────────────────── */
.dbg-output {
  flex: 1;
  overflow-y: auto;
  padding: 14px 18px 8px;
  scrollbar-width: thin;
  scrollbar-color: #30363d transparent;
}
.dbg-output::-webkit-scrollbar { width: 6px; }
.dbg-output::-webkit-scrollbar-track { background: transparent; }
.dbg-output::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }

.dbg-line { white-space: pre-wrap; word-break: break-all; }
.dbg-line.cmd  { color: #c9d1d9; margin-top: 8px; }
.dbg-line.ok   { color: #3fb950; }
.dbg-line.err  { color: #f85149; }
.dbg-line.info { color: #8b949e; }

/* ─── Input row ─────────────────────────────────────────── */
.dbg-input-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 18px 14px;
  border-top: 1px solid #21262d;
  flex-shrink: 0;
}
.dbg-prompt {
  color: #58a6ff;
  font-size: 16px;
  line-height: 1;
  user-select: none;
}
.dbg-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #c9d1d9;
  font-family: inherit;
  font-size: 13px;
  caret-color: #58a6ff;
}
.dbg-input::placeholder { color: #30363d; }

/* ─── Autocomplete popup ────────────────────────────────── */
.dbg-suggestions {
  position: absolute;
  bottom: calc(100% + 2px);
  left: 0;
  right: 0;
  background: #1c2128;
  border: 1px solid #30363d;
  border-radius: 6px;
  overflow: hidden;
  box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.6);
  z-index: 50;
}

.dbg-sug {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 12px;
  cursor: pointer;
  transition: background 0.05s;
}
.dbg-sug--selected {
  background: #1f6feb;
}

.sug-kind {
  font-size: 10px;
  font-weight: 700;
  width: 18px;
  text-align: center;
  flex-shrink: 0;
  letter-spacing: 0;
}
.sug-kind[data-kind="cmd"] { color: #58a6ff; }
.sug-kind[data-kind="sub"] { color: #a78bfa; }
.sug-kind[data-kind="id"]  { color: #fb923c; }
.dbg-sug--selected .sug-kind { color: #fff; }

.sug-label {
  font-size: 12px;
  font-weight: 500;
  color: #c9d1d9;
  flex-shrink: 0;
  min-width: 150px;
  white-space: nowrap;
}
.dbg-sug--selected .sug-label { color: #fff; }

.sug-match {
  color: #ffa657;
  font-weight: 700;
}
.dbg-sug--selected .sug-match { color: #ffe0b2; }

.sug-desc {
  font-size: 11px;
  color: #8b949e;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dbg-sug--selected .sug-desc { color: #cdd9e5; }

.sug-hint {
  font-size: 10px;
  color: #cdd9e5;
  opacity: 0.7;
  flex-shrink: 0;
}
</style>

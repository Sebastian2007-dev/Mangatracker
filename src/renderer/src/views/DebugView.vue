<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { useStatisticsStore } from '../stores/statistics.store'
import { useLevelUpStore } from '../stores/level-up.store'
import { useAchievementToastStore } from '../stores/achievement-toast.store'
import { useSkillTreeStore } from '../stores/skill-tree.store'
import { SKILLS } from '../../../shared/skill-tree'

const statisticsStore = useStatisticsStore()
const levelUpStore = useLevelUpStore()
const achievementStore = useAchievementToastStore()
const skillTreeStore = useSkillTreeStore()

type OutputLine = { text: string; type: 'cmd' | 'ok' | 'err' | 'info' }

const input = ref('')
const output = ref<OutputLine[]>([])
const inputEl = ref<HTMLInputElement | null>(null)
const outputEl = ref<HTMLElement | null>(null)
const cmdHistory: string[] = []
let historyIndex = -1

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
  '  help                    — show this list',
]

function print(text: string, type: OutputLine['type'] = 'info'): void {
  output.value.push({ text, type })
  nextTick(() => {
    if (outputEl.value) outputEl.value.scrollTop = outputEl.value.scrollHeight
  })
}

function execute(raw: string): void {
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
    const to = args[1] !== undefined ? parseInt(args[1], 10) : 5
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

    if (!sub) {
      print('Error: usage: achievement <id | random | all>', 'err')
      return
    }

    if (sub === 'random') {
      if (achievements.length === 0) {
        print('Error: no achievements loaded (open Statistics page first)', 'err')
        return
      }
      const pick = achievements[Math.floor(Math.random() * achievements.length)]
      achievementStore.forceShow(pick.id, pick.icon)
      print(`✓ Toast triggered: ${pick.id}`, 'ok')
      return
    }

    if (sub === 'all') {
      if (achievements.length === 0) {
        print('Error: no achievements loaded (open Statistics page first)', 'err')
        return
      }
      achievements.forEach((a) => achievementStore.forceShow(a.id, a.icon))
      print(`✓ Queued ${achievements.length} achievement toasts`, 'ok')
      return
    }

    // specific id
    const found = achievements.find((a) => a.id === sub)
    if (!found) {
      const icon = 'Sparkles'
      achievementStore.forceShow(sub, icon)
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

  print(`Unknown command: "${name}". Type help for a list of commands.`, 'err')
}

function submit(): void {
  const cmd = input.value
  input.value = ''
  execute(cmd)
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
      <span class="dbg-prompt">›</span>
      <input
        ref="inputEl"
        v-model="input"
        class="dbg-input"
        spellcheck="false"
        autocomplete="off"
        placeholder="type a command..."
        @keydown.enter.prevent="submit"
        @keydown.up.prevent="historyUp"
        @keydown.down.prevent="historyDown"
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
.dbg-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
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

.dbg-line {
  white-space: pre-wrap;
  word-break: break-all;
}
.dbg-line.cmd  { color: #c9d1d9; margin-top: 8px; }
.dbg-line.ok   { color: #3fb950; }
.dbg-line.err  { color: #f85149; }
.dbg-line.info { color: #8b949e; }

/* ─── Input row ─────────────────────────────────────────── */
.dbg-input-row {
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
.dbg-input::placeholder {
  color: #30363d;
}
</style>

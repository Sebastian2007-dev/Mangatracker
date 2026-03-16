<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useLevelUpStore } from '../stores/level-up.store'

const { t } = useI18n()
const store = useLevelUpStore()

type Particle = {
  tx: string
  ty: string
  delay: string
  duration: string
  size: string
  rotation: string
  shape: 'circle' | 'diamond'
  opacity: string
}

const particles = ref<Particle[]>([])
const displayLevel = ref(0)
let tickTimer: ReturnType<typeof setTimeout> | null = null

const skipped = computed(() => Math.max(0, store.newLevel - store.oldLevel))

const titleText = computed(() => {
  if (store.newLevel >= 20) return 'MAX LEVEL!'
  const s = skipped.value
  if (s >= 5) return 'MEGA LEVEL UP!'
  if (s >= 3) return 'MULTI LEVEL UP!'
  return 'LEVEL UP!'
})

// 0 = normal, 1 = enhanced (2 levels), 2 = intense (3-4), 3 = mega (5+)
const intensity = computed(() => {
  const s = skipped.value
  if (s >= 5) return 3
  if (s >= 3) return 2
  if (s >= 2) return 1
  return 0
})

function generateParticles(): void {
  const skip = skipped.value
  const count = Math.min(36 + Math.max(0, skip - 1) * 16, 96)
  particles.value = Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * 360 + (Math.random() * 20 - 10)
    const distance = 180 + Math.random() * (220 + skip * 20)
    const rad = (angle * Math.PI) / 180
    return {
      tx: `${Math.cos(rad) * distance}px`,
      ty: `${Math.sin(rad) * distance}px`,
      delay: `${(Math.random() * 0.35).toFixed(2)}s`,
      duration: `${(0.65 + Math.random() * 0.7).toFixed(2)}s`,
      size: `${Math.round(5 + Math.random() * (10 + skip * 1.5))}px`,
      rotation: `${Math.round(Math.random() * 720 - 360)}deg`,
      shape: i % 3 === 0 ? 'diamond' : 'circle',
      opacity: `${(0.7 + Math.random() * 0.3).toFixed(2)}`
    }
  })
}

function startLevelTick(): void {
  if (tickTimer !== null) { clearTimeout(tickTimer); tickTimer = null }
  const skip = store.newLevel - store.oldLevel
  displayLevel.value = store.newLevel // default: show final immediately
  if (skip <= 1) return

  // slot-machine: roll from oldLevel+1 → newLevel, starting fast, slowing to land
  displayLevel.value = store.oldLevel + 1
  let current = store.oldLevel + 1
  const target = store.newLevel
  const total = target - (store.oldLevel + 1)
  let step = 0

  function tick(): void {
    if (current < target) {
      current++
      step++
      displayLevel.value = current
      // ease-in: starts fast (~80ms), ends slow (~380ms) — "slot machine" landing effect
      const progress = total > 0 ? step / total : 1
      const delay = Math.round(80 + progress * 300)
      tickTimer = setTimeout(tick, delay)
    }
  }
  tickTimer = setTimeout(tick, 150) // short delay so card appears first
}

watch(() => store.visible, (val) => {
  if (val) {
    generateParticles()
    startLevelTick()
  } else {
    if (tickTimer !== null) { clearTimeout(tickTimer); tickTimer = null }
  }
})

onUnmounted(() => {
  if (tickTimer !== null) clearTimeout(tickTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="lvlup">
      <div
        v-if="store.visible"
        class="lvlup-backdrop"
        :data-intensity="intensity"
        @click="store.dismiss()"
      >

        <!-- Screen flash -->
        <div class="lvlup-flash" />

        <!-- Light beam -->
        <div class="lvlup-beam" />

        <!-- Expanding rings — more for higher intensity -->
        <div class="lvlup-ring lvlup-ring-1" />
        <div class="lvlup-ring lvlup-ring-2" />
        <div class="lvlup-ring lvlup-ring-3" />
        <div class="lvlup-ring lvlup-ring-4" />
        <div v-if="intensity >= 1" class="lvlup-ring lvlup-ring-5" />
        <div v-if="intensity >= 2" class="lvlup-ring lvlup-ring-6" />
        <div v-if="intensity >= 3" class="lvlup-ring lvlup-ring-7" />

        <!-- Particles -->
        <div
          v-for="(p, i) in particles"
          :key="i"
          class="lvlup-particle"
          :class="{ diamond: p.shape === 'diamond' }"
          :style="{
            '--tx': p.tx,
            '--ty': p.ty,
            '--rotation': p.rotation,
            '--size': p.size,
            '--opacity': p.opacity,
            animationDelay: p.delay,
            animationDuration: p.duration
          }"
        />

        <!-- Central card -->
        <div class="lvlup-card-wrap" :class="`shake-${intensity}`">
          <div class="lvlup-card">
            <div class="lvlup-icon">
              <Sparkles :size="36" />
            </div>

            <p class="lvlup-title">{{ titleText }}</p>

            <div class="lvlup-levels">
              <span class="lvlup-old">{{ store.oldLevel }}</span>
              <span class="lvlup-arrow">▶</span>
              <span class="lvlup-new" :class="{ ticking: displayLevel < store.newLevel }">{{ displayLevel >= 20 ? 'MAX' : displayLevel }}</span>
            </div>

            <p class="lvlup-sub">{{ store.newLevel >= 20 ? t('statistics.maxLevel') : t('statistics.levelLabel', { level: store.newLevel }) }}</p>

            <p class="lvlup-dismiss-hint">— tap to continue —</p>
          </div>
        </div>

      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ─── Backdrop ──────────────────────────────────────────── */
.lvlup-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: grid;
  place-items: center;
  background: hsl(0 0% 0% / 0.88);
  cursor: pointer;
  overflow: hidden;
}

/* ─── Flash ─────────────────────────────────────────────── */
.lvlup-flash {
  position: absolute;
  inset: 0;
  background: hsl(var(--primary) / 0.35);
  pointer-events: none;
  animation: flash 0.5s ease-out both;
}
[data-intensity='1'] .lvlup-flash { background: hsl(var(--primary) / 0.5); }
[data-intensity='2'] .lvlup-flash { background: hsl(var(--primary) / 0.65); animation: flash 0.6s ease-out both; }
[data-intensity='3'] .lvlup-flash { background: hsl(var(--primary) / 0.82); animation: flash 0.7s ease-out both; }

@keyframes flash {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

/* ─── Light beam ────────────────────────────────────────── */
.lvlup-beam {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 220px;
  height: 100%;
  background: radial-gradient(ellipse at top, hsl(var(--primary) / 0.25) 0%, transparent 70%);
  pointer-events: none;
  animation: beam-in 0.6s ease-out both;
}
[data-intensity='2'] .lvlup-beam { width: 320px; background: radial-gradient(ellipse at top, hsl(var(--primary) / 0.35) 0%, transparent 70%); }
[data-intensity='3'] .lvlup-beam { width: 460px; background: radial-gradient(ellipse at top, hsl(var(--primary) / 0.45) 0%, transparent 70%); }

@keyframes beam-in {
  from { opacity: 0; transform: translateX(-50%) scaleX(0.4); }
  to   { opacity: 1; transform: translateX(-50%) scaleX(1); }
}

/* ─── Rings ─────────────────────────────────────────────── */
.lvlup-ring {
  position: absolute;
  border-radius: 50%;
  border: 2px solid hsl(var(--primary) / 0.7);
  width: 160px;
  height: 160px;
  pointer-events: none;
}
.lvlup-ring-1 { animation: ring-expand 1.4s cubic-bezier(0.2, 0.6, 0.4, 1) 0.05s both; }
.lvlup-ring-2 { animation: ring-expand 1.4s cubic-bezier(0.2, 0.6, 0.4, 1) 0.20s both; }
.lvlup-ring-3 { animation: ring-expand 1.4s cubic-bezier(0.2, 0.6, 0.4, 1) 0.35s both; border-color: hsl(var(--primary) / 0.4); }
.lvlup-ring-4 { animation: ring-expand 1.4s cubic-bezier(0.2, 0.6, 0.4, 1) 0.50s both; border-color: hsl(var(--primary) / 0.2); }
.lvlup-ring-5 { animation: ring-expand 1.4s cubic-bezier(0.2, 0.6, 0.4, 1) 0.65s both; border-color: hsl(var(--primary) / 0.15); }
.lvlup-ring-6 { animation: ring-expand 1.4s cubic-bezier(0.2, 0.6, 0.4, 1) 0.80s both; border-color: hsl(var(--primary) / 0.1); }
.lvlup-ring-7 { animation: ring-expand 1.6s cubic-bezier(0.2, 0.6, 0.4, 1) 0.95s both; border-color: hsl(var(--primary) / 0.08); border-width: 3px; }

@keyframes ring-expand {
  0%   { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(7);   opacity: 0; }
}

/* ─── Particles ─────────────────────────────────────────── */
.lvlup-particle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: var(--size);
  height: var(--size);
  border-radius: 50%;
  background: hsl(var(--primary));
  opacity: var(--opacity);
  pointer-events: none;
  margin-top: calc(var(--size) / -2);
  margin-left: calc(var(--size) / -2);
  animation: particle-burst var(--duration, 0.9s) ease-out both;
}
.lvlup-particle.diamond {
  border-radius: 2px;
  background: hsl(var(--primary) / 0.85);
}
@keyframes particle-burst {
  0%   { transform: translate(0, 0) rotate(0deg) scale(1.2); opacity: var(--opacity); }
  100% { transform: translate(var(--tx), var(--ty)) rotate(var(--rotation)) scale(0); opacity: 0; }
}

/* ─── Card wrapper (shake) ──────────────────────────────── */
.lvlup-card-wrap {
  position: relative;
  z-index: 1;
}

.shake-2 { animation: card-shake-sm 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97) 0.65s both; }
.shake-3 { animation: card-shake-lg 0.6s cubic-bezier(0.36, 0.07, 0.19, 0.97) 0.55s both; }

@keyframes card-shake-sm {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  15%  { transform: translate(-6px,  3px) rotate(-1deg); }
  30%  { transform: translate( 6px, -3px) rotate( 1deg); }
  45%  { transform: translate(-4px,  4px) rotate(-0.5deg); }
  60%  { transform: translate( 5px, -2px) rotate( 0.5deg); }
  75%  { transform: translate(-3px,  2px) rotate(0deg); }
  90%  { transform: translate( 2px, -1px); }
}

@keyframes card-shake-lg {
  0%, 100% { transform: translate(0, 0) rotate(0deg); }
  10%  { transform: translate(-11px,  5px) rotate(-2deg); }
  20%  { transform: translate( 11px, -5px) rotate( 2deg); }
  30%  { transform: translate( -8px,  8px) rotate(-1.5deg); }
  40%  { transform: translate(  9px, -4px) rotate( 1.5deg); }
  50%  { transform: translate( -7px,  6px) rotate(-1deg); }
  60%  { transform: translate(  7px, -3px) rotate( 1deg); }
  70%  { transform: translate( -4px,  4px) rotate(-0.5deg); }
  80%  { transform: translate(  4px, -2px) rotate( 0.5deg); }
  90%  { transform: translate( -2px,  2px); }
}

/* ─── Central card ──────────────────────────────────────── */
.lvlup-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  animation: card-burst 0.55s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
}
@keyframes card-burst {
  0%   { transform: scale(0.3); opacity: 0; filter: blur(12px); }
  70%  { transform: scale(1.06); }
  100% { transform: scale(1);   opacity: 1; filter: blur(0); }
}

.lvlup-icon {
  width: 80px;
  height: 80px;
  border-radius: 24px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  display: grid;
  place-items: center;
  box-shadow:
    0 0 0 8px hsl(var(--primary) / 0.15),
    0 0 40px hsl(var(--primary) / 0.7),
    0 0 90px hsl(var(--primary) / 0.4);
  animation: icon-pulse 1.8s ease-in-out 0.6s infinite alternate;
}
[data-intensity='2'] .lvlup-icon,
[data-intensity='3'] .lvlup-icon {
  width: 92px;
  height: 92px;
  border-radius: 28px;
}
@keyframes icon-pulse {
  from { box-shadow: 0 0 0 8px hsl(var(--primary) / 0.12), 0 0 35px hsl(var(--primary) / 0.55), 0 0 70px hsl(var(--primary) / 0.3); }
  to   { box-shadow: 0 0 0 12px hsl(var(--primary) / 0.2), 0 0 60px hsl(var(--primary) / 0.9), 0 0 130px hsl(var(--primary) / 0.55); }
}

.lvlup-title {
  font-size: 52px;
  font-weight: 900;
  letter-spacing: 0.08em;
  color: #fff;
  line-height: 1;
  text-shadow:
    0 0 20px hsl(var(--primary) / 0.9),
    0 0 60px hsl(var(--primary) / 0.5),
    0 2px 4px hsl(0 0% 0% / 0.5);
  animation: title-glow 1.8s ease-in-out 0.6s infinite alternate;
}
[data-intensity='2'] .lvlup-title { font-size: 44px; letter-spacing: 0.06em; }
[data-intensity='3'] .lvlup-title { font-size: 46px; letter-spacing: 0.05em; }

@keyframes title-glow {
  from { text-shadow: 0 0 16px hsl(var(--primary) / 0.6), 0 0 40px hsl(var(--primary) / 0.3), 0 2px 4px hsl(0 0% 0% / 0.5); }
  to   { text-shadow: 0 0 28px hsl(var(--primary) / 1),   0 0 90px hsl(var(--primary) / 0.7), 0 2px 4px hsl(0 0% 0% / 0.5); }
}

.lvlup-levels {
  display: flex;
  align-items: center;
  gap: 14px;
  line-height: 1;
}
.lvlup-old {
  font-size: 28px;
  font-weight: 700;
  color: hsl(0 0% 55%);
}
.lvlup-arrow {
  font-size: 18px;
  color: hsl(var(--primary));
}
.lvlup-new {
  font-size: 48px;
  font-weight: 900;
  color: hsl(var(--primary));
  text-shadow: 0 0 20px hsl(var(--primary) / 0.8);
  transition: color 0.08s;
  min-width: 56px;
  text-align: center;
}
.lvlup-new.ticking {
  color: hsl(0 0% 85%);
  text-shadow: none;
  animation: tick-flash 0.12s ease-out;
}
@keyframes tick-flash {
  0%   { transform: scale(1.3); }
  100% { transform: scale(1); }
}

.lvlup-sub {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: hsl(0 0% 72%);
}

.lvlup-dismiss-hint {
  font-size: 11px;
  color: hsl(0 0% 40%);
  letter-spacing: 0.06em;
  margin-top: 4px;
  animation: hint-fade 1s ease 2s both;
}
@keyframes hint-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* ─── Transition ────────────────────────────────────────── */
.lvlup-enter-active { transition: opacity 0.3s ease; }
.lvlup-leave-active { transition: opacity 0.7s ease; }
.lvlup-enter-from,
.lvlup-leave-to     { opacity: 0; }
</style>

<script setup lang="ts">
import type { Component } from 'vue'
import {
  BookOpen,
  Castle,
  CircleCheck,
  Clock3,
  Cloud,
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
import { useAchievementToastStore } from '../stores/achievement-toast.store'

const { t } = useI18n()
const store = useAchievementToastStore()

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

function resolveIcon(name: string): Component {
  return iconMap[name] ?? BookOpen
}
</script>

<template>
  <Teleport to="body">
    <Transition name="achievement-toast">
      <div
        v-if="store.current"
        class="achievement-toast-wrap"
        :title="t('statistics.achievementUnlocked')"
        @click="store.dismiss()"
      >
        <div class="toast-inner">
          <div class="toast-icon">
            <component :is="resolveIcon(store.current.icon)" :size="22" />
          </div>
          <div class="toast-text">
            <span class="toast-label">{{ t('statistics.achievementUnlocked') }}</span>
            <strong class="toast-name">{{ t('statistics.achievements.' + store.current.id + '.name') }}</strong>
            <span class="toast-hint">{{ t('statistics.achievements.' + store.current.id + '.hint') }}</span>
          </div>
        </div>
        <div class="toast-progress-track">
          <div :key="store.current.id" class="toast-progress-fill" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.achievement-toast-wrap {
  position: fixed;
  bottom: 24px;
  right: 20px;
  width: 300px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 8px 32px hsl(0 0% 0% / 0.28), 0 2px 8px hsl(0 0% 0% / 0.12);
  cursor: pointer;
  z-index: 9999;
  user-select: none;
}

.achievement-toast-wrap:hover {
  border-color: hsl(var(--primary) / 0.5);
}

.toast-inner {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px 15px 12px;
}

.toast-icon {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  display: grid;
  place-items: center;
}

.toast-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.toast-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: hsl(var(--primary));
  line-height: 1;
  margin-bottom: 1px;
}

.toast-name {
  font-size: 14px;
  font-weight: 700;
  color: hsl(var(--foreground));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.toast-hint {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  line-height: 1.35;
}

.toast-progress-track {
  height: 3px;
  background: hsl(var(--secondary));
}

.toast-progress-fill {
  height: 100%;
  width: 100%;
  background: hsl(var(--primary));
  animation: drain-progress 5s linear forwards;
  transform-origin: left;
}

@keyframes drain-progress {
  from { width: 100%; }
  to { width: 0%; }
}

/* Slide in from right */
.achievement-toast-enter-active {
  transition: transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
}
.achievement-toast-leave-active {
  transition: transform 0.28s ease-in, opacity 0.22s ease;
}
.achievement-toast-enter-from,
.achievement-toast-leave-to {
  transform: translateX(calc(100% + 28px));
  opacity: 0;
}
</style>

import { ref, watch } from 'vue'
import type { Ref } from 'vue'

export function useCountUp(target: Ref<number | undefined>, duration = 900): Ref<number> {
  const display = ref(0)
  let rafId: number | null = null

  watch(target, (end) => {
    if (end === undefined) return
    const endVal = end
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
    const startTime = performance.now()

    function tick(now: number): void {
      const progress = Math.min((now - startTime) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      display.value = Math.round(endVal * eased)
      if (progress < 1) {
        rafId = requestAnimationFrame(tick)
      } else {
        display.value = endVal
        rafId = null
      }
    }
    rafId = requestAnimationFrame(tick)
  }, { immediate: true })

  return display
}

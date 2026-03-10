<script setup lang="ts">
import { ref, watch } from 'vue'
import { ChevronUp, ChevronDown } from 'lucide-vue-next'

const props = defineProps<{ modelValue: number }>()
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()

const localValue = ref(String(props.modelValue))

watch(() => props.modelValue, (v) => {
  localValue.value = String(v)
})

function increment(): void {
  const v = parseFloat(localValue.value) || 0
  emit('update:modelValue', Math.round((v + 1) * 10) / 10)
}

function decrement(): void {
  const v = parseFloat(localValue.value) || 0
  if (v <= 0) return
  emit('update:modelValue', Math.round((v - 1) * 10) / 10)
}

function commit(): void {
  const v = parseFloat(localValue.value)
  if (!isNaN(v) && v >= 0) {
    emit('update:modelValue', Math.round(v * 10) / 10)
  } else {
    localValue.value = String(props.modelValue)
  }
}
</script>

<template>
  <div class="flex items-center gap-0.5">
    <button class="ch-btn" @click.stop="decrement">
      <ChevronDown :size="12" />
    </button>
    <input
      v-model="localValue"
      type="number"
      min="0"
      step="0.5"
      class="ch-input"
      @blur="commit"
      @keydown.enter="commit"
      @click.stop
    />
    <button class="ch-btn" @click.stop="increment">
      <ChevronUp :size="12" />
    </button>
  </div>
</template>

<style scoped>
.ch-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--secondary));
  border: none;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.ch-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.ch-input {
  width: 52px;
  height: 20px;
  text-align: center;
  font-size: 12px;
  border-radius: 4px;
  background: hsl(var(--input));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  outline: none;
  padding: 0 2px;
}
.ch-input:focus {
  border-color: hsl(var(--primary));
}
/* Hide spinner arrows */
.ch-input::-webkit-inner-spin-button,
.ch-input::-webkit-outer-spin-button {
  -webkit-appearance: none;
}
</style>

<script setup lang="ts">
import { ref } from 'vue'
import { Trash2, Plus } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

const props = defineProps<{ title: string; modelValue: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>()

const { t } = useI18n()
const newDomain = ref('')

function add(): void {
  const d = newDomain.value.trim().toLowerCase()
  if (d && !props.modelValue.includes(d)) {
    emit('update:modelValue', [...props.modelValue, d])
    newDomain.value = ''
  }
}

function remove(domain: string): void {
  emit('update:modelValue', props.modelValue.filter((d) => d !== domain))
}
</script>

<template>
  <div>
    <h3 class="text-sm font-semibold mb-3" style="color: hsl(var(--foreground))">{{ title }}</h3>

    <!-- Add new -->
    <div class="flex gap-2 mb-3">
      <input
        v-model="newDomain"
        type="text"
        :placeholder="t('settings.addDomain')"
        class="field-input flex-1"
        @keydown.enter="add"
      />
      <button class="add-btn" @click="add">
        <Plus :size="16" />
      </button>
    </div>

    <!-- List -->
    <div v-if="modelValue.length === 0" class="text-xs py-2" style="color: hsl(var(--muted-foreground))">
      {{ t('settings.noDomains') }}
    </div>
    <div v-else class="flex flex-col gap-1">
      <div
        v-for="domain in modelValue"
        :key="domain"
        class="domain-row"
      >
        <span class="text-sm flex-1" style="color: hsl(var(--foreground))">{{ domain }}</span>
        <button class="remove-btn" @click="remove(domain)">
          <Trash2 :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.field-input {
  height: 32px;
  padding: 0 10px;
  border-radius: 6px;
  font-size: 13px;
  background: hsl(var(--input));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--border));
  outline: none;
}
.field-input:focus { border-color: hsl(var(--primary)); }
.add-btn {
  display: flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 6px;
  background: hsl(var(--primary)); color: hsl(var(--primary-foreground));
  border: none; cursor: pointer;
}
.domain-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px; border-radius: 6px;
  background: hsl(var(--secondary));
}
.remove-btn {
  display: flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border-radius: 4px;
  color: hsl(var(--muted-foreground));
  background: transparent; border: none; cursor: pointer;
}
.remove-btn:hover { color: hsl(0 70% 65%); background: hsl(var(--destructive) / 0.2); }
</style>

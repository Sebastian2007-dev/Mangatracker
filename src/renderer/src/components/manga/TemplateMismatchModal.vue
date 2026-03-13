<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps<{
  mangaTitle: string
  oldTemplate: string
  suggestedTemplate: string
  currentUrl: string
  confidence: number
}>()

const emit = defineEmits<{
  confirm: [newTemplate: string]
  dismiss: []
}>()

const { t } = useI18n()
const editedTemplate = ref(props.suggestedTemplate)
const confidencePct = computed(() => Math.round(props.confidence * 100))
</script>

<template>
  <Teleport to="body">
    <div class="backdrop">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">{{ t('reader.templateMismatchTitle') }}</span>
        </div>

        <div class="modal-body">
          <p class="hint">{{ t('reader.templateMismatchHint') }}</p>

          <div class="confidence-row">
            <span class="conf-label">{{ t('reader.templateConfidence') }}</span>
            <span class="conf-badge conf-low">{{ confidencePct }}%</span>
          </div>

          <div class="field-group">
            <label class="field-label">{{ t('reader.templateManga') }}</label>
            <p class="field-value manga-title">{{ mangaTitle }}</p>
          </div>

          <div class="field-group">
            <label class="field-label">{{ t('reader.templateCurrentUrl') }}</label>
            <p class="field-value url-text">{{ currentUrl }}</p>
          </div>

          <div class="field-group">
            <label class="field-label">{{ t('reader.templateOld') }}</label>
            <p class="field-value url-text muted">{{ oldTemplate }}</p>
          </div>

          <div class="field-group">
            <label class="field-label">{{ t('reader.templateNew') }}</label>
            <input v-model="editedTemplate" class="field-input" type="text" />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-ghost" @click="emit('dismiss')">{{ t('reader.templateDismiss') }}</button>
          <button class="btn-primary" @click="emit('confirm', editedTemplate)">{{ t('reader.templateApply') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
  padding: 16px;
}
.modal {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  width: min(480px, 100%);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.modal-header {
  padding: 16px 18px 12px;
  border-bottom: 1px solid hsl(var(--border));
}
.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: hsl(var(--foreground));
}
.modal-body {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  max-height: 60vh;
}
.hint {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  line-height: 1.5;
}
.confidence-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.conf-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.conf-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 4px;
}
.conf-low {
  background: hsl(43 96% 20%);
  color: hsl(43 96% 60%);
  border: 1px solid hsl(43 96% 35%);
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 11px;
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.field-value {
  font-size: 13px;
  color: hsl(var(--foreground));
}
.url-text {
  font-family: monospace;
  font-size: 12px;
  word-break: break-all;
  background: hsl(var(--secondary));
  padding: 6px 8px;
  border-radius: 5px;
  border: 1px solid hsl(var(--border));
}
.muted {
  color: hsl(var(--muted-foreground));
}
.manga-title {
  font-weight: 500;
}
.field-input {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 12px;
  font-family: monospace;
  background: hsl(var(--input));
  color: hsl(var(--foreground));
  border: 1px solid hsl(var(--primary));
  outline: none;
  box-sizing: border-box;
}
.field-input:focus {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
}
.modal-footer {
  display: flex;
  gap: 8px;
  padding: 12px 18px 16px;
  border-top: 1px solid hsl(var(--border));
}
.btn-primary {
  flex: 1;
  padding: 9px 12px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 500;
  background: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  border: none;
  cursor: pointer;
}
.btn-ghost {
  flex: 1;
  padding: 9px 12px;
  border-radius: 7px;
  font-size: 13px;
  background: transparent;
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  cursor: pointer;
}
</style>

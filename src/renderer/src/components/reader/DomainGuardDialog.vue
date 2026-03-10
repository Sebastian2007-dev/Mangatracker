<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useReaderStore } from '../../stores/reader.store'

const { t } = useI18n()
const reader = useReaderStore()

const visible = computed(() => reader.pendingDomainGuard !== null)

async function choose(choice: string): Promise<void> {
  if (!reader.pendingDomainGuard) return
  await reader.respondToDomainGuard(reader.pendingDomainGuard.requestId, choice)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="modal-backdrop">
      <div class="modal-box">
        <h3 class="text-sm font-semibold mb-2" style="color: hsl(var(--foreground))">
          {{ t('reader.domainGuard.title') }}
        </h3>
        <p class="text-xs mb-1" style="color: hsl(var(--muted-foreground))">
          {{ t('reader.domainGuard.message', { domain: reader.pendingDomainGuard?.targetDomain }) }}
        </p>
        <p class="text-xs mb-4" style="color: hsl(var(--muted-foreground))">
          Von: {{ reader.pendingDomainGuard?.originDomain }}
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn-action primary" @click="choose('yes')">{{ t('reader.domainGuard.yes') }}</button>
          <button class="btn-action primary-soft" @click="choose('yes_always')">{{ t('reader.domainGuard.yesAlways') }}</button>
          <button class="btn-action secondary" @click="choose('no')">{{ t('reader.domainGuard.no') }}</button>
          <button class="btn-action danger" @click="choose('no_block')">{{ t('reader.domainGuard.noBlock') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: hsl(0 0% 0% / 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
}
.modal-box {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  padding: 20px;
  width: 320px;
}
.btn-action {
  padding: 8px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: opacity 0.1s;
}
.btn-action:hover { opacity: 0.85; }
.btn-action.primary { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.btn-action.primary-soft { background: hsl(var(--primary) / 0.2); color: hsl(var(--primary)); }
.btn-action.secondary { background: hsl(var(--secondary)); color: hsl(var(--foreground)); }
.btn-action.danger { background: hsl(var(--destructive) / 0.4); color: hsl(0 70% 70%); }
</style>

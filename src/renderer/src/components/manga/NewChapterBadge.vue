<template>
  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium" style="background: hsl(var(--primary) / 0.15); color: hsl(var(--primary))">
    <span class="ping-wrap">
      <span class="ping-ring" />
      <span class="ping-dot" />
    </span>
    Neu
  </span>
</template>

<style scoped>
.ping-wrap {
  position: relative;
  display: inline-flex;
  width: 8px;
  height: 8px;
  flex-shrink: 0;
}
.ping-dot {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: hsl(var(--primary));
}
.ping-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: hsl(var(--primary) / 0.45);
  animation: ping 1.4s ease-out infinite;
}
@keyframes ping {
  0%   { transform: scale(1);   opacity: 0.8; }
  100% { transform: scale(2.6); opacity: 0; }
}
</style>

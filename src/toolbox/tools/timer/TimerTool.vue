<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

type Mode = 'countdown' | 'stopwatch'
const mode = ref<Mode>('countdown')
const ch = ref(0)
const cm = ref(0)
const cs = ref(10)
const remain = ref(0)
const swMs = ref(0)
const laps = ref<number[]>([])
const running = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const display = computed(() => {
  const ms = mode.value === 'countdown' ? remain.value : swMs.value
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  const msec = Math.floor((ms % 1000) / 10)
  const p = (n: number) => String(n).padStart(2, '0')
  return (h > 0 ? p(h) + ':' : '') + p(m) + ':' + p(s) + '.' + p(msec)
})

function tick() {
  if (mode.value === 'countdown') {
    remain.value -= 100
    if (remain.value <= 0) {
      remain.value = 0
      stop()
      beep()
    }
  } else {
    swMs.value += 100
  }
}

function start() {
  if (running.value) return
  if (mode.value === 'countdown' && remain.value <= 0) {
    remain.value = (ch.value * 3600 + cm.value * 60 + cs.value) * 1000
    if (remain.value <= 0) return
  }
  running.value = true
  timer = setInterval(tick, 100)
}
function stop() {
  running.value = false
  if (timer) { clearInterval(timer); timer = null }
}
function reset() {
  stop()
  if (mode.value === 'countdown') remain.value = (ch.value * 3600 + cm.value * 60 + cs.value) * 1000
  else { swMs.value = 0; laps.value = [] }
}
function lap() {
  if (mode.value === 'stopwatch' && running.value) laps.value.push(swMs.value)
}
function beep() {
  try {
    const ac = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ac.createOscillator()
    o.connect(ac.destination)
    o.frequency.value = 880
    o.start()
    setTimeout(() => o.stop(), 400)
  } catch { /* 忽略音频不可用 */ }
}
function switchMode(m: Mode) {
  stop()
  mode.value = m
  remain.value = (ch.value * 3600 + cm.value * 60 + cs.value) * 1000
  swMs.value = 0
  laps.value = []
}
onBeforeUnmount(stop)
</script>

<template>
  <div class="tu-t1">
    <div class="tu-seg">
      <button :class="{ 'is-on': mode === 'countdown' }" @click="switchMode('countdown')">倒计时</button>
      <button :class="{ 'is-on': mode === 'stopwatch' }" @click="switchMode('stopwatch')">秒表</button>
    </div>

    <div class="clock">{{ display }}</div>

    <div v-if="mode === 'countdown'" class="tu-row">
      <label class="tu-label">时</label><input v-model.number="ch" class="tu-input tu-inline" type="number" min="0" />
      <label class="tu-label">分</label><input v-model.number="cm" class="tu-input tu-inline" type="number" min="0" />
      <label class="tu-label">秒</label><input v-model.number="cs" class="tu-input tu-inline" type="number" min="0" />
    </div>

    <div class="tu-row">
      <button class="tu-btn" @click="start">{{ running ? '暂停' : '开始' }}</button>
      <button class="tu-btn ghost" @click="stop">停止</button>
      <button class="tu-btn ghost" @click="reset">重置</button>
      <button v-if="mode === 'stopwatch'" class="tu-btn ghost" @click="lap">计次</button>
    </div>

    <div v-if="mode === 'stopwatch' && laps.length" class="tu-card">
      <div class="tu-card-title">计次（{{ laps.length }}）</div>
      <ul class="laps">
        <li v-for="(l, i) in laps" :key="i">#{{ i + 1 }} · {{ Math.floor(l / 1000 / 60) }}:{{ String(Math.floor(l / 1000) % 60).padStart(2, '0') }}.{{ String(Math.floor((l % 1000) / 10)).padStart(2, '0') }}</li>
      </ul>
    </div>
    <p class="tu-hint">倒计时结束会发出提示音（需浏览器允许音频）。所有计时在本机进行。</p>
  </div>
</template>

<style scoped>
.clock {
  font-family: var(--font-family-mono);
  font-size: 40px;
  font-weight: 600;
  text-align: center;
  color: var(--color-text);
  letter-spacing: 1px;
}
.laps { margin: 6px 0 0; padding-left: 18px; font-family: var(--font-family-mono); font-size: 12px; color: var(--color-text-secondary); max-height: 160px; overflow: auto; }
</style>

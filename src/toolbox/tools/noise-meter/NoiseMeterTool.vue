<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue'

const level = ref(0)
const db = ref(0)
const errorMsg = ref('')
const active = ref(false)
let stream: MediaStream | null = null
let audioCtx: AudioContext | null = null
let raf = 0

async function start() {
  errorMsg.value = ''
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    errorMsg.value = '当前浏览器不支持麦克风访问（需运行在 HTTPS 或 localhost）'
    return
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    const AC = window.AudioContext || (window as any).webkitAudioContext
    audioCtx = new AC()
    const src = audioCtx.createMediaStreamSource(stream)
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    src.connect(analyser)
    const data = new Uint8Array(analyser.fftSize)
    const loop = () => {
      analyser.getByteTimeDomainData(data)
      let sum = 0
      for (let i = 0; i < data.length; i++) { const v = (data[i] - 128) / 128; sum += v * v }
      const rms = Math.sqrt(sum / data.length)
      level.value = Math.min(1, rms * 3)
      const r = Math.max(rms, 1e-5)
      db.value = Math.round(20 * Math.log10(r) + 100)
      raf = requestAnimationFrame(loop)
    }
    loop()
    active.value = true
  } catch (e) { errorMsg.value = '无法开启麦克风：' + (e as Error).message }
}
function stop() {
  if (raf) cancelAnimationFrame(raf)
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
  if (audioCtx) { audioCtx.close(); audioCtx = null }
  active.value = false
  level.value = 0
  db.value = 0
}
onBeforeUnmount(stop)
</script>

<template>
  <div class="tu-t5">
    <div class="tu-row">
      <button class="tu-btn" :disabled="active" @click="start">开始测量</button>
      <button class="tu-btn ghost" :disabled="!active" @click="stop">停止</button>
    </div>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <div class="tu-card" style="text-align:center"><div class="tu-card-title">近似声压级（相对值）</div><div class="tu-card-value">{{ db }} dB</div></div>
    <div class="meter"><div class="meter-fill" :style="{ width: (level * 100) + '%' }" /></div>
    <p class="tu-hint">基于麦克风实时采样估算，为相对参考值、非校准分贝；需授权麦克风，且页面运行在 https 或 localhost。</p>
  </div>
</template>

<style scoped>
.meter { height: 18px; border-radius: 9px; background: var(--color-bg-input); border: 1px solid var(--color-border); overflow: hidden }
.meter-fill { height: 100%; background: linear-gradient(90deg, var(--color-success), var(--color-warning), var(--color-error)); transition: width .1s }
</style>

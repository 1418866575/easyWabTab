<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { copyText } from '../../core/download'

const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
const supported = ref(!!SR)
const transcript = ref('')
const listening = ref(false)
let rec: any = null

function start() {
  if (!SR) return
  rec = new SR()
  rec.lang = 'zh-CN'
  rec.continuous = true
  rec.interimResults = true
  rec.onresult = (e: any) => {
    let t = ''
    for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
    transcript.value = t
  }
  rec.onend = () => (listening.value = false)
  rec.onerror = () => (listening.value = false)
  rec.start()
  listening.value = true
}
function stop() { rec?.stop(); listening.value = false }
function clear() { transcript.value = '' }
onBeforeUnmount(stop)
async function copy() { if (transcript.value) await copyText(transcript.value) }
</script>

<template>
  <div class="tu-t1">
    <div v-if="!supported" class="tu-alert"><span>⚠</span><span>当前浏览器不支持语音识别（建议使用 Chrome / Edge）。</span></div>
    <div class="tu-field">
      <label class="tu-label">识别结果（实时）</label>
      <textarea v-model="transcript" class="tu-textarea" placeholder="点击下方开始，授权麦克风后说话…" />
    </div>
    <div class="tu-row">
      <button class="tu-btn" :disabled="!supported || listening" @click="start">{{ listening ? '识别中…' : '开始识别' }}</button>
      <button class="tu-btn ghost" :disabled="!listening" @click="stop">停止</button>
      <button class="tu-btn ghost" @click="clear">清空</button>
      <button class="tu-btn ghost" @click="copy">复制</button>
    </div>
    <p class="tu-hint">语音识别在本地浏览器完成；首次使用需授权麦克风权限。</p>
  </div>
</template>

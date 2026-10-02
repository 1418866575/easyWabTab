<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const synth = typeof window !== 'undefined' ? window.speechSynthesis : null
const supported = ref(!!synth)
const text = ref('欢迎使用文字转语音工具，请输入要朗读的文本。')
const rate = ref(1)
const pitch = ref(1)
const speaking = ref(false)
const voices = ref<SpeechSynthesisVoice[]>([])
const voiceURI = ref('')

onMounted(() => {
  if (!synth) return
  voices.value = synth.getVoices()
  synth.onvoiceschanged = () => { voices.value = synth.getVoices() }
  const zh = voices.value.find(v => v.lang.toLowerCase().startsWith('zh'))
  if (zh) voiceURI.value = zh.voiceURI
})
function speak() {
  if (!synth || !text.value) return
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text.value)
  const v = voices.value.find(v => v.voiceURI === voiceURI.value)
  if (v) { u.voice = v; u.lang = v.lang } else u.lang = 'zh-CN'
  u.rate = rate.value; u.pitch = pitch.value
  u.onend = () => (speaking.value = false)
  synth.speak(u)
  speaking.value = true
}
function stop() { synth?.cancel(); speaking.value = false }
onBeforeUnmount(stop)
</script>

<template>
  <div class="tu-t1">
    <div v-if="!supported" class="tu-alert"><span>⚠</span><span>当前浏览器不支持语音合成 API。</span></div>
    <div class="tu-field"><label class="tu-label">文本</label><textarea v-model="text" class="tu-textarea" /></div>
    <div class="tu-row">
      <label class="tu-label">音色</label>
      <select v-model="voiceURI" class="tu-select">
        <option v-for="v in voices" :key="v.voiceURI" :value="v.voiceURI">{{ v.name }} ({{ v.lang }})</option>
      </select>
    </div>
    <div class="tu-row">
      <label class="tu-label">语速 {{ rate.toFixed(1) }}</label>
      <input v-model.number="rate" type="range" min="0.5" max="2" step="0.1" class="tu-range" style="width:120px" />
      <label class="tu-label">音调 {{ pitch.toFixed(1) }}</label>
      <input v-model.number="pitch" type="range" min="0" max="2" step="0.1" class="tu-range" style="width:120px" />
    </div>
    <div class="tu-row">
      <button class="tu-btn" @click="speak">{{ speaking ? '正在朗读…' : '朗读' }}</button>
      <button class="tu-btn ghost" @click="stop">停止</button>
    </div>
    <p class="tu-hint">使用浏览器原生 Web Speech API，文本不上传服务器。</p>
  </div>
</template>

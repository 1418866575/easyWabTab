<script setup lang="ts">
import { ref, computed } from 'vue'
import { copyText, downloadText } from '../../core/download'

interface Cue { index: number; start: number; end: number; text: string }
const input = ref('')
const inFmt = ref<'srt' | 'vtt'>('srt')
const errorMsg = ref('')
const cues = ref<Cue[]>([])

function toSec(s: string): number {
  const m = s.match(/(\d{2}):(\d{2}):(\d{2})[,.](\d{3})/)
  if (!m) return 0
  return (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4]) / 1000
}
function fmtSrt(s: number): string {
  const ms = Math.round((s % 1) * 1000)
  const rest = Math.floor(s)
  const h = Math.floor(rest / 3600)
  const m = Math.floor((rest % 3600) / 60)
  const sec = rest % 60
  return [h, m, sec].map(x => String(x).padStart(2, '0')).join(':') + ',' + String(ms).padStart(3, '0')
}
function fmtVtt(s: number): string {
  const ms = Math.round((s % 1) * 1000)
  const rest = Math.floor(s)
  const h = Math.floor(rest / 3600)
  const m = Math.floor((rest % 3600) / 60)
  const sec = rest % 60
  return [h, m, sec].map(x => String(x).padStart(2, '0')).join(':') + '.' + String(ms).padStart(3, '0')
}
function parseSrt(text: string): Cue[] {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).filter(b => b.trim())
  const out: Cue[] = []
  let idx = 0
  for (const b of blocks) {
    const lines = b.split('\n')
    let i = /^\d+$/.test(lines[0]?.trim() || '') ? 1 : 0
    const tline = lines[i] || ''
    const m = tline.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/)
    if (!m) continue
    out.push({ index: ++idx, start: toSec(m[1]), end: toSec(m[2]), text: lines.slice(i + 1).join('\n') })
  }
  return out
}
function parseVtt(text: string): Cue[] {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).filter(b => b.trim() && !/^WEBVTT/.test(b.trim()))
  const out: Cue[] = []
  let idx = 0
  for (const b of blocks) {
    const lines = b.split('\n')
    let i = /^\d+$/.test(lines[0]?.trim() || '') ? 1 : 0
    const tline = lines[i] || ''
    const m = tline.match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/)
    if (!m) continue
    out.push({ index: ++idx, start: toSec(m[1]), end: toSec(m[2]), text: lines.slice(i + 1).join('\n') })
  }
  return out
}
function load() {
  errorMsg.value = ''
  cues.value = []
  if (!input.value.trim()) { errorMsg.value = '请粘贴字幕内容'; return }
  try {
    cues.value = inFmt.value === 'srt' ? parseSrt(input.value) : parseVtt(input.value)
    if (!cues.value.length) errorMsg.value = '未解析到字幕条目，请检查格式或切换输入格式'
  } catch (e) {
    errorMsg.value = '解析失败：' + (e as Error).message
  }
}
const toSrt = computed(() => cues.value.map(c => `${c.index}\n${fmtSrt(c.start)} --> ${fmtSrt(c.end)}\n${c.text}`).join('\n\n') + '\n')
const toVtt = computed(() => 'WEBVTT\n\n' + cues.value.map(c => `${c.index}\n${fmtVtt(c.start)} --> ${fmtVtt(c.end)}\n${c.text}`).join('\n\n') + '\n')
const toTxt = computed(() => cues.value.map(c => `[${fmtSrt(c.start)}] ${c.text.replace(/\n/g, ' ')}`).join('\n'))
function copy(kind: 'srt' | 'vtt' | 'txt') { copyText(kind === 'srt' ? toSrt.value : kind === 'vtt' ? toVtt.value : toTxt.value) }
function dl(kind: 'srt' | 'vtt' | 'txt') {
  const name = 'subtitle.' + kind
  const text = kind === 'srt' ? toSrt.value : kind === 'vtt' ? toVtt.value : toTxt.value
  downloadText(name, text)
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-field">
        <label class="tu-label">输入格式</label>
        <div class="tu-seg">
          <button :class="{ 'is-on': inFmt === 'srt' }" @click="inFmt = 'srt'">SRT</button>
          <button :class="{ 'is-on': inFmt === 'vtt' }" @click="inFmt = 'vtt'">VTT</button>
        </div>
      </div>
      <div class="tu-field">
        <label class="tu-label">粘贴字幕内容（或上传 .srt/.vtt）</label>
        <textarea v-model="input" class="tu-textarea" rows="14" placeholder="1&#10;00:00:01,000 --> 00:00:04,000&#10;你好，世界" />
      </div>
      <div class="tu-row">
        <button class="tu-btn" @click="load">解析</button>
        <button class="tu-btn ghost" :disabled="!cues.length" @click="copy('srt')">复制 SRT</button>
        <button class="tu-btn ghost" :disabled="!cues.length" @click="copy('vtt')">复制 VTT</button>
        <button class="tu-btn ghost" :disabled="!cues.length" @click="copy('txt')">复制纯文本</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">仅解析与格式转换，纯本地处理；不支持翻译或语音合成。</p>
    </div>
    <div>
      <div v-if="cues.length" class="tu-row">
        <span class="tu-tree-type">共 {{ cues.length }} 条</span>
        <button class="tu-btn ghost" @click="dl('srt')">下载 SRT</button>
        <button class="tu-btn ghost" @click="dl('vtt')">下载 VTT</button>
        <button class="tu-btn ghost" @click="dl('txt')">下载纯文本</button>
      </div>
      <div v-if="cues.length" class="tu-table-wrap">
        <table class="tu-table">
          <thead><tr><th>#</th><th>起</th><th>止</th><th>内容</th></tr></thead>
          <tbody>
            <tr v-for="c in cues" :key="c.index">
              <td>{{ c.index }}</td><td>{{ fmtSrt(c.start) }}</td><td>{{ fmtSrt(c.end) }}</td>
              <td class="break">{{ c.text }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="tu-preview">解析后的字幕条目将显示在此处</div>
    </div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; white-space: pre-wrap; }
</style>

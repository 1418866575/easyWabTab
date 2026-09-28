<script setup lang="ts">
/**
 * 时间戳 ↔ 日期互转（纯前端实现）
 */
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'

const input = ref('')
const output = ref('')
const { success, error } = useToast()

const p2 = (n: number) => String(n).padStart(2, '0')

/** 识别 10 位（秒）/ 13 位（毫秒）时间戳或常见日期字符串 */
function parse(): Date | null {
  const s = input.value.trim()
  if (!s) return null
  if (/^\d{10}$/.test(s)) return new Date(Number(s) * 1000)
  if (/^\d{13}$/.test(s)) return new Date(Number(s))
  const d = new Date(s.replace(/-/g, '/'))
  return isNaN(d.getTime()) ? null : d
}

function convert() {
  const d = parse()
  if (!d) {
    output.value = '无法识别：请输入 10 位（秒）或 13 位（毫秒）时间戳，或常见日期字符串'
    return
  }
  const fmt =
    `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ` +
    `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`
  output.value = [
    '本地时间：' + fmt,
    'ISO 8601：' + d.toISOString(),
    'UTC：' + d.toUTCString(),
    '秒级时间戳：' + Math.floor(d.getTime() / 1000),
    '毫秒时间戳：' + d.getTime()
  ].join('\n')
}

function fillNow() {
  input.value = String(Math.floor(Date.now() / 1000))
  success('已填入当前秒级时间戳')
}

async function copy() {
  if (!output.value) { error('暂无可复制内容'); return }
  try {
    await navigator.clipboard.writeText(output.value)
    success('已复制到剪贴板')
  } catch {
    error('复制失败，请手动选择结果复制')
  }
}
</script>

<template>
  <div>
    <div class="tu-field">
      <label class="tu-label" for="ts-input">时间戳或日期</label>
      <input
        id="ts-input"
        v-model="input"
        class="tu-input"
        placeholder="10 位秒 / 13 位毫秒时间戳，或 2026-09-29 10:00:00"
      />
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn" @click="convert">转换</button>
      <button type="button" class="tu-btn ghost" @click="fillNow">填入当前时间</button>
      <button type="button" class="tu-btn ghost" @click="copy">复制结果</button>
    </div>

    <div class="tu-field">
      <span class="tu-label">结果</span>
      <div class="tu-out" data-testid="tool-timestamp-output">{{ output || '（暂无输出）' }}</div>
    </div>
  </div>
</template>

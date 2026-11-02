<script setup lang="ts">
/**
 * 代码美化截图：语法高亮卡片，导出 PNG（2x）
 */
import { computed, ref } from 'vue'
import {
  CARD_THEMES,
  highlight,
  htmlToPng,
  LANGS,
  renderCard,
  type LangId
} from './codeShotCore'
import { downloadBlob } from '../../core/download'
import { useToast } from '@/composables/useToast'

const SAMPLE = `// 用 TypeScript 写一个防抖函数
export function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
}`

const toast = useToast()

const code = ref(SAMPLE)
const lang = ref<LangId>('typescript')
const themeId = ref<'dark' | 'light'>('dark')
const title = ref('utils.ts')
const lineNumbers = ref(true)
const width = ref(720)
const exporting = ref(false)

const tokens = computed(() => highlight(code.value, lang.value))
const theme = computed(() => CARD_THEMES.find((t) => t.id === themeId.value) ?? CARD_THEMES[0])
const card = computed(() =>
  renderCard(tokens.value, {
    theme: theme.value,
    title: title.value || 'code',
    lang: LANGS.find((l) => l.id === lang.value)?.name ?? '',
    lineNumbers: lineNumbers.value,
    width: width.value
  })
)

async function exportPng() {
  exporting.value = true
  try {
    const blob = await htmlToPng(card.value.html, width.value, card.value.height)
    downloadBlob(`code-card-${Date.now()}.png`, blob)
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '导出失败')
  }
  exporting.value = false
}
</script>

<template>
  <div class="tu-t2 cs-wrap">
    <div class="cs-left">
      <div class="tu-row">
        <select v-model="lang" class="tu-select">
          <option v-for="l in LANGS" :key="l.id" :value="l.id">{{ l.name }}</option>
        </select>
        <select v-model="themeId" class="tu-select">
          <option v-for="t in CARD_THEMES" :key="t.id" :value="t.id">{{ t.name }}主题</option>
        </select>
        <input v-model="title" type="text" class="tu-input cs-inline" placeholder="窗口标题" />
      </div>
      <div class="tu-row">
        <label class="tu-check" :class="{ 'is-on': lineNumbers }">
          <input v-model="lineNumbers" type="checkbox" /> 行号
        </label>
        <label class="tu-label cs-inline">宽度 {{ width }}px</label>
        <input v-model.number="width" type="range" class="tu-range cs-range" min="480" max="1080" step="20" />
      </div>
      <textarea
        v-model="code"
        class="tu-textarea cs-area"
        rows="14"
        spellcheck="false"
        data-testid="tb-codeshot-input"
      ></textarea>
      <div class="tu-row">
        <button type="button" class="tu-btn" :disabled="exporting" @click="exportPng">
          {{ exporting ? '导出中…' : '导出 PNG（2x）' }}
        </button>
      </div>
      <p class="tu-hint">自研轻量高亮（注释 / 字符串 / 数字 / 关键字 / 类型），全部在本地渲染导出；代码不上传。</p>
    </div>

    <div class="cs-right">
      <div class="tu-toolbar">
        <span class="tu-hint cs-inline">卡片预览</span>
      </div>
      <div class="cs-stage" v-html="card.html"></div>
    </div>
  </div>
</template>

<style scoped>
.cs-wrap { align-items: start; }
.cs-left, .cs-right { min-width: 0; display: flex; flex-direction: column; }
.cs-inline { width: auto; min-width: 120px; margin-bottom: 0; }
.cs-range { width: 150px; }
.cs-area { font-family: var(--font-family-mono); font-size: 12.5px; }
.cs-stage { overflow: auto; padding: 16px; border-radius: var(--radius-md); background: var(--color-bg-input); }
</style>

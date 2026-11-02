<script setup lang="ts">
/**
 * SVG 编辑器：左侧写代码，右侧即时渲染，可导出 SVG / PNG
 */
import { computed, ref, watch } from 'vue'
import { DEFAULT_SVG, sanitizeSvg, svgSize, svgToPngDataUrl } from './svgEditorCore'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import { downloadDataUrl } from '../../core/download'

const code = ref(DEFAULT_SVG)
const error = ref('')
const rendered = ref(DEFAULT_SVG)
const exporting = ref(false)

useDirtyFlag(() => code.value.trim().length > 0)
const { copy, save } = useToolActions()

const size = computed(() => svgSize(rendered.value))

let timer: ReturnType<typeof setTimeout> | null = null
watch(code, () => {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    const r = sanitizeSvg(code.value)
    if (r.ok && r.svg) {
      rendered.value = r.svg
      error.value = ''
    } else {
      error.value = r.error ?? '解析失败'
    }
  }, 250)
})

async function exportPng() {
  exporting.value = true
  try {
    const url = await svgToPngDataUrl(rendered.value, size.value.width, size.value.height)
    downloadDataUrl(`svg-${Date.now()}.png`, url)
  } catch (e) {
    error.value = e instanceof Error ? e.message : '导出失败'
  }
  exporting.value = false
}

function exportSvg() {
  save(`svg-${Date.now()}.svg`, rendered.value, 'image/svg+xml;charset=utf-8')
}
</script>

<template>
  <div class="tu-t2 se-wrap">
    <div class="se-left">
      <div class="tu-toolbar">
        <span class="tu-hint se-inline">SVG 源码</span>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost" @click="copy(rendered)">复制 SVG</button>
        <button type="button" class="tu-btn ghost" @click="exportSvg">下载 SVG</button>
      </div>
      <textarea
        v-model="code"
        class="tu-textarea se-area"
        rows="16"
        spellcheck="false"
        data-testid="tb-svg-input"
      ></textarea>
      <p v-if="error" class="tu-alert">{{ error }}</p>
      <p class="tu-hint">渲染前会移除脚本、事件属性与外部引用，确保本地渲染安全。</p>
    </div>

    <div class="se-right">
      <div class="tu-toolbar">
        <span class="tu-hint se-inline">渲染预览（{{ size.width }} × {{ size.height }}）</span>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost" :disabled="exporting" @click="exportPng">
          {{ exporting ? '导出中…' : '导出 PNG' }}
        </button>
      </div>
      <div class="tu-preview tu-checker" v-html="rendered"></div>
    </div>
  </div>
</template>

<style scoped>
.se-wrap { align-items: start; }
.se-left, .se-right { min-width: 0; }
.se-area { font-family: var(--font-family-mono); font-size: 12.5px; }
.se-inline { margin-bottom: 0; }
</style>

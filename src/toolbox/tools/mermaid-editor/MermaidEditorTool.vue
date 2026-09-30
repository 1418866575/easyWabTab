<script setup lang="ts">
/**
 * Mermaid 在线编辑器（纯前端实现，mermaid 仅在打开本工具时懒加载）
 * 支持流程图 / 时序图 / 类图 / 状态图 / 甘特图 / 饼图，可导出 SVG 与 PNG。
 */
import { onBeforeUnmount, ref, shallowRef } from 'vue'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

type MermaidApi = typeof import('mermaid').default

const code = ref(`flowchart LR
  A[开始] --> B{是否有工具?}
  B -- 是 --> C[打开弹框]
  B -- 否 --> D[新建工具]
  C --> E[完成]
  D --> E`)
const theme = ref<'default' | 'dark' | 'forest' | 'neutral'>('default')
const svg = ref('')
const errorMsg = ref('')
const loading = ref(false)
const ready = ref(false)
const mermaidApi = shallowRef<MermaidApi | null>(null)

useDirtyFlag(() => !!code.value.trim())
const { copy, save, saveBlob } = useToolActions()

/** 首次渲染时动态加载 mermaid，避免进入主包 */
async function ensure(): Promise<MermaidApi> {
  if (mermaidApi.value) return mermaidApi.value
  loading.value = true
  const mod = await import('mermaid')
  const api = mod.default
  api.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme.value, fontFamily: 'inherit' })
  mermaidApi.value = api
  ready.value = true
  loading.value = false
  return api
}

async function render() {
  errorMsg.value = ''
  const src = code.value.trim()
  if (!src) {
    svg.value = ''
    return
  }
  try {
    const api = await ensure()
    if (api.initialize) api.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme.value })
    const id = 'm' + Math.random().toString(36).slice(2, 9)
    const out = await api.render(id, src)
    svg.value = typeof out === 'string' ? out : out.svg
  } catch (e) {
    svg.value = ''
    errorMsg.value = (e as Error).message || '渲染失败，请检查语法'
  }
}

async function switchTheme(t: typeof theme.value) {
  theme.value = t
  if (ready.value) await render()
}

/** SVG 文本 → PNG Blob（本地 canvas 光栅化） */
async function svgToPng(svgText: string, scale = 2): Promise<Blob> {
  const svgEl = new DOMParser().parseFromString(svgText, 'image/svg+xml').documentElement
  const vb = (svgEl.getAttribute('viewBox') || '').split(/\s+/).map(Number)
  const w = Math.max(1, Math.round(vb[2] || Number(svgEl.getAttribute('width')) || 800))
  const h = Math.max(1, Math.round(vb[3] || Number(svgEl.getAttribute('height')) || 600))
  const clone = svgEl.cloneNode(true) as SVGElement
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  const data = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error('SVG 转图片失败'))
    el.src = data
  })
  const canvas = document.createElement('canvas')
  canvas.width = w * scale
  canvas.height = h * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建画布')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('导出失败'))), 'image/png')
  })
}

async function exportPng() {
  if (!svg.value) return
  try {
    const blob = await svgToPng(svg.value)
    saveBlob('diagram.png', blob)
  } catch (e) {
    errorMsg.value = (e as Error).message
  }
}

const TEMPLATES: { name: string; code: string }[] = [
  { name: '流程图', code: 'flowchart LR\n  A[开始] --> B[结束]' },
  { name: '时序图', code: 'sequenceDiagram\n  用户->>工具箱: 打开工具\n  工具箱-->>用户: 展示结果' },
  { name: '类图', code: 'classDiagram\n  class Tool {\n    +String id\n    +render()\n  }' },
  { name: '状态图', code: 'stateDiagram-v2\n  [*] --> 待处理\n  待处理 --> 已完成\n  已完成 --> [*]' },
  { name: '甘特图', code: 'gantt\n  title 排期\n  section 开发\n  编码 :a1, 2026-01-01, 7d' },
  { name: '饼图', code: 'pie title 分类占比\n  "开发" : 45\n  "图片" : 30\n  "其他" : 25' }
]

function useTpl(t: { name: string; code: string }) {
  code.value = t.code
  render()
}

onBeforeUnmount(() => {
  mermaidApi.value = null
})
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-toolbar">
        <span class="tu-label">模板</span>
        <button v-for="t in TEMPLATES" :key="t.name" type="button" class="tu-btn ghost" @click="useTpl(t)">
          {{ t.name }}
        </button>
      </div>

      <TuField label="Mermaid 源码">
        <textarea
          v-model="code"
          class="tu-textarea"
          rows="16"
          spellcheck="false"
          placeholder="输入 mermaid 语法"
          data-testid="tb-modal-input"
        />
      </TuField>

      <div class="tu-row">
        <button type="button" class="tu-btn" :disabled="loading" @click="render">
          {{ loading ? '加载渲染引擎…' : '渲染' }}
        </button>
        <span class="tu-label">主题</span>
        <select v-model="theme" class="tu-select tu-inline" style="max-width: 120px" @change="switchTheme(theme)">
          <option value="default">default</option>
          <option value="neutral">neutral</option>
          <option value="forest">forest</option>
          <option value="dark">dark</option>
        </select>
      </div>
      <p class="tu-hint">首次点击渲染会加载图表引擎（约 1MB，仅本工具使用，不影响首屏）。</p>
    </div>

    <div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>

      <TuOutput
        title="预览"
        :text="svg"
        filename="diagram.svg"
        mime="image/svg+xml"
        empty="点击「渲染」后显示图表"
      >
        <template #actions>
          <button type="button" class="tu-btn ghost" :disabled="!svg" @click="exportPng">导出 PNG</button>
          <button type="button" class="tu-btn ghost" :disabled="!svg" @click="save('diagram.svg', svg, 'image/svg+xml')">
            导出 SVG
          </button>
          <button type="button" class="tu-btn ghost" :disabled="!code" @click="copy(code)">复制源码</button>
        </template>
        <div class="tu-preview mm-view">
          <p v-if="!svg" class="tu-out-empty">暂无预览</p>
          <!-- mermaid 生成的 SVG 由本地渲染引擎输出，securityLevel=strict，不含外部脚本 -->
          <div v-else v-html="svg" />
        </div>
      </TuOutput>
    </div>

    <details class="tu-folding tu-span">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>左侧编写 mermaid 源码，点击「渲染」生成图表；首次渲染会按需加载引擎。</li>
          <li>可切换主题并导出 SVG / PNG，全部在本地完成。</li>
          <li>渲染使用 strict 安全级别，禁用脚本与外链，避免注入风险。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-span { grid-column: 1 / -1; }
.mm-view { min-height: 220px; display: flex; align-items: center; justify-content: center; overflow: auto; }
.mm-view :deep(svg) { max-width: 100%; height: auto; }
</style>

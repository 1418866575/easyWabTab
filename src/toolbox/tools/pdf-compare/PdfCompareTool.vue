<script setup lang="ts">
/**
 * PDF 比较（纯前端，pdfjs 提取文本 + 行级 LCS diff）
 * 提取两份 PDF 的纯文本（按页归行），做行级差异比对，展示新增/删除/未变，可下载 diff 文本。
 * 仅比对文本层；图片/版式差异不在范围内。
 */
import { ref, computed } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { downloadText } from '../../core/download'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const fileA = ref<HTMLInputElement | null>(null)
const fileB = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const nameA = ref('')
const nameB = ref('')

const diffHtml = ref('')
const diffText = ref('')

interface Op { type: 'eq' | 'add' | 'del'; text: string }

async function extractLines(file: File): Promise<string[]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const out: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const arr = (tc.items as any[])
      .map((it) => ({ str: (it.str || '') as string, x: it.transform[4] as number, y: it.transform[5] as number, size: (it.height as number) || Math.abs(it.transform[3]) || 10 }))
      .filter((it) => it.str != null)
    arr.sort((a, b) => b.y - a.y || a.x - b.x)
    const lines: { items: typeof arr }[] = []
    for (const it of arr) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.items[0].y - it.y) <= Math.max(2, last.items[0].size * 0.4)) {
        last.items.push(it)
      } else {
        lines.push({ items: [it] })
      }
    }
    for (const l of lines) {
      const t = l.items.map((i) => i.str).join('').replace(/\s+/g, ' ').trim()
      if (t) out.push(t)
    }
  }
  return out
}

function diffLines(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length
  // 过大时退化为集合差比对，避免 O(n*m) 爆栈
  if (n * m > 4_000_000) {
    const setB = new Set(b)
    const setA = new Set(a)
    const ops: Op[] = []
    for (const t of a) if (!setB.has(t)) ops.push({ type: 'del', text: t })
    for (const t of b) if (!setA.has(t)) ops.push({ type: 'add', text: t })
    return ops
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'eq', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'del', text: a[i] })
      i++
    } else {
      ops.push({ type: 'add', text: b[j] })
      j++
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] })
  while (j < m) ops.push({ type: 'add', text: b[j++] })
  return ops
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function onCompare() {
  const fa = fileA.value?.files?.[0]
  const fb = fileB.value?.files?.[0]
  if (!fa || !fb) {
    errorMsg.value = '请同时选择两份 PDF（A 与 B）'
    return
  }
  errorMsg.value = ''
  infoMsg.value = ''
  diffHtml.value = ''
  diffText.value = ''
  busy.value = true
  try {
    const [linesA, linesB] = await Promise.all([extractLines(fa), extractLines(fb)])
    nameA.value = fa.name
    nameB.value = fb.name
    const ops = diffLines(linesA, linesB)
    let add = 0
    let del = 0
    const htmlParts: string[] = []
    const txtParts: string[] = []
    for (const op of ops) {
      if (op.type === 'add') {
        add++
        htmlParts.push(`<div class="d-add">+ ${esc(op.text)}</div>`)
        txtParts.push('+ ' + op.text)
      } else if (op.type === 'del') {
        del++
        htmlParts.push(`<div class="d-del">- ${esc(op.text)}</div>`)
        txtParts.push('- ' + op.text)
      } else {
        htmlParts.push(`<div class="d-eq">&nbsp;&nbsp;${esc(op.text)}</div>`)
        txtParts.push('  ' + op.text)
      }
    }
    diffHtml.value = htmlParts.join('')
    diffText.value = `# 差异对比：A=${fa.name}  B=${fb.name}\n# A 行数 ${linesA.length}，B 行数 ${linesB.length}，新增 ${add}，删除 ${del}\n\n` + txtParts.join('\n')
    infoMsg.value = `A ${linesA.length} 行 / B ${linesB.length} 行；新增 ${add} 行，删除 ${del} 行，未变 ${linesA.length + linesB.length - add - del} 行。`
  } catch (err) {
    errorMsg.value = '比较失败：' + (err as Error).message
  } finally {
    busy.value = false
    if (fileA.value) fileA.value.value = ''
    if (fileB.value) fileB.value.value = ''
  }
}

function dl() {
  if (diffText.value) downloadText(`compare-${nameA.value || 'A'}-vs-${nameB.value || 'B'}.txt`, diffText.value, 'text/plain;charset=utf-8')
}
</script>

<template>
  <div class="tu-t2">
    <div class="tu-t1">
      <div class="tu-field">
        <label class="tu-label">PDF A（基准）</label>
        <input ref="fileA" type="file" accept="application/pdf" hidden />
        <button class="tu-btn" :disabled="busy" @click="fileA?.click()">选择 A</button>
        <span v-if="nameA" class="tu-hint" style="margin-left: 8px">{{ nameA }}</span>
      </div>
      <div class="tu-field">
        <label class="tu-label">PDF B（对比）</label>
        <input ref="fileB" type="file" accept="application/pdf" hidden />
        <button class="tu-btn" :disabled="busy" @click="fileB?.click()">选择 B</button>
        <span v-if="nameB" class="tu-hint" style="margin-left: 8px">{{ nameB }}</span>
      </div>
      <button type="button" class="tu-btn" :disabled="busy" @click="onCompare">
        {{ busy ? '比对中…' : '开始比较' }}
      </button>
      <button type="button" class="tu-btn ghost" :disabled="!diffText" @click="dl">下载 diff</button>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-if="infoMsg" class="tu-alert ok">{{ infoMsg }}</p>
      <p class="tu-hint">仅比对文本层内容；图片型/扫描件或版式差异无法识别。差异以“行”为单位。</p>
    </div>
    <div class="tu-t1">
      <label class="tu-label">差异结果（<span style="color:var(--color-danger)">红=删除</span> / <span style="color:var(--color-success)">绿=新增</span>）</label>
      <div class="diff-view" v-html="diffHtml"></div>
      <div v-if="!diffHtml && !busy" class="tu-preview">选择两份 PDF 后在此显示差异</div>
    </div>
  </div>
</template>

<style scoped>
.diff-view { border: 1px solid var(--color-border); border-radius: var(--radius-md); background: var(--color-bg-input); padding: 8px 10px; min-height: 360px; max-height: 60vh; overflow: auto; font-family: var(--font-mono, monospace); font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.diff-view :deep(.d-add) { background: var(--color-success-soft); color: var(--color-success); }
.diff-view :deep(.d-del) { background: var(--color-danger-soft); color: var(--color-danger); }
.diff-view :deep(.d-eq) { color: var(--color-text-muted); }
</style>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { copyText, downloadText } from '../../core/download'

interface OutlineNode {
  title: string
  dest?: unknown
  items: OutlineNode[]
}

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const outline = ref<OutlineNode[]>([])
const pageTotal = ref(0)

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  errorMsg.value = ''
  outline.value = []
  pageTotal.value = 0
  if (!f || !f.name.toLowerCase().endsWith('.pdf')) { errorMsg.value = '请选择 PDF 文件'; return }
  busy.value = true
  try {
    const buf = await f.arrayBuffer()
    const doc = await PDFDocument.load(new Uint8Array(buf))
    pageTotal.value = doc.getPageCount()
    const raw = (await (doc as unknown as { getOutline(): OutlineNode[] }).getOutline()) as OutlineNode[]
    outline.value = Array.isArray(raw) ? raw : []
  } catch (err) {
    errorMsg.value = '读取失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

interface FlatRow { level: number; title: string }

function flatten(nodes: OutlineNode[], level = 0, acc: FlatRow[] = []): FlatRow[] {
  for (const n of nodes) {
    acc.push({ level, title: n.title || '(无标题)' })
    if (n.items && n.items.length) flatten(n.items, level + 1, acc)
  }
  return acc
}

const flat = computed(() => flatten(outline.value))

async function copyMd() {
  const text = flat.value.map((r) => '#'.repeat(r.level + 1) + ' ' + r.title).join('\n')
  copyText(text)
}
function copyIndent() {
  const text = flat.value.map((r) => '  '.repeat(r.level) + '- ' + r.title).join('\n')
  copyText(text)
}
function dlJson() {
  downloadText('pdf-outline-' + Date.now() + '.json', JSON.stringify(outline.value, null, 2), 'application/json;charset=utf-8')
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择 PDF</label>
        <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
        <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">{{ busy ? '读取中…' : '选择 PDF' }}</button>
      </div>
      <div v-if="pageTotal" class="tu-row">
        <span class="tu-tree-type">共 {{ pageTotal }} 页 · 目录项 {{ flat.length }}</span>
      </div>
      <div v-if="pageTotal" class="tu-row">
        <button class="tu-btn ghost" :disabled="!flat.length" @click="copyMd">复制为 Markdown</button>
        <button class="tu-btn ghost" :disabled="!flat.length" @click="copyIndent">复制缩进文本</button>
        <button class="tu-btn ghost" :disabled="!flat.length" @click="dlJson">导出 JSON</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">提取的是 PDF 内置书签/大纲（Outline）。部分 PDF 未写入书签则无可提取目录。</p>
    </div>
    <div>
      <div v-if="flat.length" class="tu-table-wrap" style="max-height:420px">
        <div class="tu-tree">
          <div
            v-for="(r, i) in flat"
            :key="i"
            class="tu-tree-row"
            :style="{ paddingLeft: 8 + r.level * 18 + 'px' }"
          >
            <span class="tu-tree-toggle">•</span>
            <span>{{ r.title }}</span>
          </div>
        </div>
      </div>
      <div v-else-if="pageTotal" class="tu-alert info">该 PDF 未包含书签/大纲目录。</div>
      <div v-else class="tu-preview">目录树将显示在此处</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PDF 拆分与提取页（纯前端，pdf-lib + jszip）
 * 加载一个 PDF，可勾选页面：① 导出选中页为单个新 PDF；② 每页导出为独立 PDF 并打包 ZIP。
 */
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { downloadBlob } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const pageCount = ref(0)
const selected = ref<boolean[]>([])
const bytes = ref<Uint8Array | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const baseName = ref('doc')

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  if (!f.name.toLowerCase().endsWith('.pdf')) { errorMsg.value = '请选择 PDF 文件'; return }
  const buf = await f.arrayBuffer()
  bytes.value = new Uint8Array(buf)
  baseName.value = f.name.replace(/\.pdf$/i, '')
  try {
    const doc = await PDFDocument.load(bytes.value)
    pageCount.value = doc.getPageCount()
    selected.value = new Array(pageCount.value).fill(true)
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  }
  ;(e.target as HTMLInputElement).value = ''
}

function toggleAll(v: boolean) { selected.value = selected.value.map(() => v) }

async function exportSelected() {
  if (!bytes.value) return
  const idx = selected.value.map((s, i) => (s ? i : -1)).filter(i => i >= 0)
  if (!idx.length) { errorMsg.value = '请至少选择一页'; return }
  busy.value = true
  errorMsg.value = ''
  try {
    const src = await PDFDocument.load(bytes.value)
    const out = await PDFDocument.create()
    const pages = await out.copyPages(src, idx)
    pages.forEach(p => out.addPage(p))
    const blob = new Blob([(await out.save()) as unknown as BlobPart], { type: 'application/pdf' })
    downloadBlob(`${baseName.value}-pages.pdf`, blob)
  } catch (err) {
    errorMsg.value = '导出失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}

async function exportEach() {
  if (!bytes.value) return
  busy.value = true
  errorMsg.value = ''
  try {
    const src = await PDFDocument.load(bytes.value)
    const zip = new JSZip()
    for (let i = 0; i < pageCount.value; i++) {
      const out = await PDFDocument.create()
      const pages = await out.copyPages(src, [i])
      pages.forEach(p => out.addPage(p))
      zip.file(`${baseName.value}-p${i + 1}.pdf`, await out.save())
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(`${baseName.value}-split.zip`, blob)
  } catch (err) {
    errorMsg.value = '打包失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择 PDF</label>
        <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
        <button class="tu-btn" @click="fileInput?.click()">选择 PDF</button>
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy || !pageCount" @click="exportSelected">导出选中页为 PDF</button>
        <button class="tu-btn ghost" :disabled="busy || !pageCount" @click="exportEach">每页独立导出 (ZIP)</button>
      </div>
      <div class="tu-row" v-if="pageCount">
        <button class="tu-btn ghost" @click="toggleAll(true)">全选</button>
        <button class="tu-btn ghost" @click="toggleAll(false)">全不选</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">勾选需要保留的页面，可一次性提取或逐页拆分；本地处理。</p>
    </div>
    <div>
      <div v-if="pageCount" class="tu-grid">
        <label v-for="i in pageCount" :key="i" class="tu-check" :class="{ 'is-on': selected[i - 1] }">
          <input type="checkbox" v-model="selected[i - 1]" /> 第 {{ i }} 页
        </label>
      </div>
      <div v-else class="tu-preview">页面列表（先选 PDF）</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PDF 合并与重排（纯前端，pdf-lib）
 * 多选 PDF，按列表顺序合并；支持上下移动调整顺序、移除。
 */
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { downloadBlob } from '../../core/download'

interface PdfItem { id: number; name: string; bytes: Uint8Array }
const fileInput = ref<HTMLInputElement | null>(null)
const items = ref<PdfItem[]>([])
const busy = ref(false)
const errorMsg = ref('')
let seq = 0

async function onFiles(e: Event) {
  const files = Array.from((e.target as HTMLInputElement).files || [])
  errorMsg.value = ''
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith('.pdf')) { errorMsg.value = `${f.name} 不是 PDF`; continue }
    const buf = await f.arrayBuffer()
    items.value.push({ id: ++seq, name: f.name, bytes: new Uint8Array(buf) })
  }
  ;(e.target as HTMLInputElement).value = ''
}

function move(i: number, d: number) {
  const j = i + d
  if (j < 0 || j >= items.value.length) return
  const arr = items.value
  ;[arr[i], arr[j]] = [arr[j], arr[i]]
}
function remove(id: number) {
  const i = items.value.findIndex(x => x.id === id)
  if (i >= 0) items.value.splice(i, 1)
}

async function merge() {
  if (items.value.length < 2) { errorMsg.value = '请至少选择 2 个 PDF'; return }
  busy.value = true
  errorMsg.value = ''
  try {
    const out = await PDFDocument.create()
    for (const it of items.value) {
      const src = await PDFDocument.load(it.bytes)
      const pages = await out.copyPages(src, src.getPageIndices())
      pages.forEach(p => out.addPage(p))
    }
    const blob = new Blob([(await out.save()) as unknown as BlobPart], { type: 'application/pdf' })
    downloadBlob(`merged-${items.value.length}.pdf`, blob)
  } catch (err) {
    errorMsg.value = '合并失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择 PDF（可多选，按列表顺序合并）</label>
        <input ref="fileInput" type="file" accept="application/pdf" multiple hidden @change="onFiles" />
        <button class="tu-btn" @click="fileInput?.click()">选择 PDF</button>
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy || items.length < 2" @click="merge">{{ busy ? '合并中…' : '合并并下载' }}</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">顺序即最终页码顺序，用 ↑/↓ 调整；全程本地处理。</p>
    </div>
    <div>
      <div v-if="items.length" class="tu-table-wrap">
        <table class="tu-table">
          <thead><tr><th>#</th><th>文件名</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="(it, i) in items" :key="it.id">
              <td>{{ i + 1 }}</td>
              <td class="break">{{ it.name }}</td>
              <td>
                <button class="tu-btn ghost" :disabled="i === 0" @click="move(i, -1)">↑</button>
                <button class="tu-btn ghost" :disabled="i === items.length - 1" @click="move(i, 1)">↓</button>
                <button class="tu-btn ghost" @click="remove(it.id)">移除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="tu-preview">PDF 列表（先选文件）</div>
    </div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
</style>

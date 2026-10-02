<script setup lang="ts">
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { downloadBlob } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const pageCount = ref(0)
const keep = ref<boolean[]>([])
const busy = ref(false)
const errorMsg = ref('')
let src: PDFDocument | null = null

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  errorMsg.value = ''
  keep.value = []
  if (!f || !f.name.toLowerCase().endsWith('.pdf')) { errorMsg.value = '请选择 PDF 文件'; return }
  busy.value = true
  try {
    const buf = await f.arrayBuffer()
    src = await PDFDocument.load(new Uint8Array(buf))
    pageCount.value = src.getPageCount()
    keep.value = Array(pageCount.value).fill(true)
  } catch (err) {
    errorMsg.value = '读取失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
function all(v: boolean) { keep.value = keep.value.map(() => v) }
async function save() {
  if (!src) return
  const out = await PDFDocument.create()
  for (let i = 0; i < pageCount.value; i++) {
    if (keep.value[i]) { const [p] = await out.copyPages(src, [i]); out.addPage(p) }
  }
  const b = await out.save()
  downloadBlob('deleted-' + Date.now() + '.pdf', new Blob([b as unknown as BlobPart], { type: 'application/pdf' }))
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
      <div v-if="pageCount" class="tu-row">
        <span class="tu-tree-type">共 {{ pageCount }} 页</span>
        <button class="tu-btn ghost" @click="all(true)">全选</button>
        <button class="tu-btn ghost" @click="all(false)">全不选</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">勾选「保留」的页面，未勾选的将被删除；导出为新文件。</p>
    </div>
    <div>
      <div v-if="pageCount" class="tu-table-wrap">
        <table class="tu-table">
          <thead><tr><th>页码</th><th>保留</th></tr></thead>
          <tbody>
            <tr v-for="i in pageCount" :key="i">
              <td>第 {{ i }} 页</td>
              <td><input type="checkbox" v-model="keep[i - 1]" /></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="pageCount" class="tu-row" style="margin-top:10px"><button class="tu-btn" @click="save">导出删除后 PDF</button></div>
      <div v-else class="tu-preview">页面列表将显示在此处</div>
    </div>
  </div>
</template>

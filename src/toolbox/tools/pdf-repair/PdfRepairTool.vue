<script setup lang="ts">
/**
 * PDF 修复（纯前端，pdf-lib）
 * 通过重新解析并保存来修复常见结构问题：
 * - 正常加载后重新 save() 即可重建文件结构（修复头部/尾部/xref 类异常）；
 * - 若首次加载失败，自动尝试把字节截断到最后一个 %%EOF 后重试（修复尾部多余数据）。
 * 对内容级严重损坏（对象缺失）无法修复，会如实报错。
 */
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { pdfBlob, downloadBlob, humanSize } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const fileName = ref('')
const baseName = ref('doc')
const originalSize = ref(0)

/** 找到最后一个 %%EOF 并把字节截取到其后（%%EOF 占 5 字节） */
function trimToEOF(bytes: Uint8Array): Uint8Array {
  let idx = -1
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x25 && bytes[i + 1] === 0x25 && bytes[i + 2] === 0x45 && bytes[i + 3] === 0x4f) idx = i
  }
  return idx < 0 ? bytes : bytes.subarray(0, idx + 5)
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  infoMsg.value = ''
  fileName.value = f.name
  baseName.value = f.name.replace(/\.pdf$/i, '')
  originalSize.value = f.size
  ;(e.target as HTMLInputElement).value = ''
}

async function repair() {
  const input = fileInput.value
  if (!input?.files?.length) {
    errorMsg.value = '请先选择 PDF 文件'
    return
  }
  const f = input.files[0]
  busy.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    const bytes = new Uint8Array(await f.arrayBuffer())
    let doc: Awaited<ReturnType<typeof PDFDocument.load>>
    let note = ''
    try {
      doc = await PDFDocument.load(bytes)
    } catch (err1) {
      const trimmed = trimToEOF(bytes)
      if (trimmed.length === bytes.length) throw err1
      doc = await PDFDocument.load(trimmed)
      note = '（已尝试截断到文件尾部最后一个 %%EOF 进行修复）'
    }
    const pages = doc.getPageCount()
    const blob = pdfBlob(await doc.save())
    downloadBlob(`${baseName.value}-repaired.pdf`, blob)
    infoMsg.value = `修复完成${note}：${pages} 页，原 ${humanSize(originalSize.value)} → 修复后 ${humanSize(blob.size)}。`
  } catch (err) {
    errorMsg.value = '无法修复：文件损坏过重或格式不受支持。' + (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t1 pdf-repair">
    <div class="tu-field">
      <label class="tu-label">选择可能损坏的 PDF</label>
      <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
      <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">选择 PDF</button>
      <span v-if="fileName" class="tu-row" style="margin-top: 8px">{{ fileName }}（{{ humanSize(originalSize) }}）</span>
    </div>

    <button type="button" class="tu-btn" :disabled="busy || !fileName" @click="repair">
      {{ busy ? '修复中…' : '修复并下载' }}
    </button>

    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <p v-if="infoMsg" class="tu-alert ok">{{ infoMsg }}</p>

    <p class="tu-hint">
      本工具通过重新解析并保存 PDF 来修复常见结构问题（如尾部多余数据、缺失 EOF、xref 异常）。
      对内容级严重损坏（如对象缺失）可能无效，届时会给出明确提示。文件全程本地处理，不上传任何服务器。
    </p>
  </div>
</template>

<style scoped>
.pdf-repair { max-width: 520px; }
</style>

<script setup lang="ts">
/**
 * PDF 页面旋转（纯前端，pdf-lib）
 * 对所有页面应用统一旋转角度（90/180/270）后导出。
 */
import { ref } from 'vue'
import { PDFDocument, degrees } from 'pdf-lib'
import { downloadBlob } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const angle = ref(90)
const busy = ref(false)
const errorMsg = ref('')
const hasFile = ref(false)
const pageCount = ref(0)
const baseName = ref('doc')
let data: Uint8Array | null = null

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  if (!f.name.toLowerCase().endsWith('.pdf')) { errorMsg.value = '请选择 PDF 文件'; return }
  baseName.value = f.name.replace(/\.pdf$/i, '')
  data = new Uint8Array(await f.arrayBuffer())
  try {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true })
    pageCount.value = doc.getPageCount()
    hasFile.value = true
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  }
  ;(e.target as HTMLInputElement).value = ''
}

async function run() {
  if (!data) { errorMsg.value = '请先选择 PDF'; return }
  busy.value = true
  errorMsg.value = ''
  try {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true })
    doc.getPages().forEach(p => p.setRotation(degrees(angle.value)))
    const blob = new Blob([(await doc.save()) as unknown as BlobPart], { type: 'application/pdf' })
    downloadBlob(`${baseName.value}-rot${angle.value}.pdf`, blob)
  } catch (err) {
    errorMsg.value = '处理失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择 PDF</label>
        <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
        <button class="tu-btn" @click="fileInput?.click()">选择 PDF</button>
      </div>
      <div class="tu-field">
        <label class="tu-label">旋转角度</label>
        <div class="tu-seg">
          <button v-for="a in [90, 180, 270]" :key="a" :class="{ 'is-on': angle === a }" @click="angle = a">{{ a }}°</button>
        </div>
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy || !hasFile" @click="run">{{ busy ? '处理中…' : '旋转并导出' }}</button>
      </div>
    </div>
    <div>
      <div v-if="errorMsg" class="tu-alert">{{ errorMsg }}</div>
      <p v-if="hasFile" class="tu-hint">共 {{ pageCount }} 页，将全部旋转 {{ angle }}°。</p>
      <p class="tu-hint">旋转为绝对值设置，多次旋转会叠加角度；本地处理。</p>
    </div>
  </div>
</template>

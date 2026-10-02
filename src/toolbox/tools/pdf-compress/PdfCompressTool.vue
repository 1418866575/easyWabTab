<script setup lang="ts">
/**
 * PDF 优化精简（纯前端，pdf-lib）
 * 说明：浏览器端无法像服务端 ghostscript 那样重采样图片，本工具通过
 * 重新封装（启用对象流、可选清除文档元数据）来精简结构体积。
 * 对以图片为主的扫描件效果有限，已明确告知用户。
 */
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { downloadBlob, humanSize } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const inSize = ref(0)
const outSize = ref(0)
const clearMeta = ref(true)
const hasFile = ref(false)
const baseName = ref('doc')
let data: Uint8Array | null = null

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  if (!f.name.toLowerCase().endsWith('.pdf')) { errorMsg.value = '请选择 PDF 文件'; return }
  inSize.value = f.size
  outSize.value = 0
  baseName.value = f.name.replace(/\.pdf$/i, '')
  data = new Uint8Array(await f.arrayBuffer())
  hasFile.value = true
  ;(e.target as HTMLInputElement).value = ''
}

async function run() {
  if (!data) { errorMsg.value = '请先选择 PDF'; return }
  busy.value = true
  errorMsg.value = ''
  try {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true })
    if (clearMeta.value) doc.setTitle(''); doc.setAuthor(''); doc.setSubject(''); doc.setKeywords([]); doc.setProducer(''); doc.setCreator('')
    const out = await doc.save({ useObjectStreams: true })
    outSize.value = out.length
    downloadBlob(`${baseName.value}-opt.pdf`, new Blob([out as unknown as BlobPart], { type: 'application/pdf' }))
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
        <label class="tu-check" :class="{ 'is-on': clearMeta }">
          <input type="checkbox" v-model="clearMeta" /> 清除文档元数据
        </label>
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy || !hasFile" @click="run">{{ busy ? '处理中…' : '优化并下载' }}</button>
      </div>
    </div>
    <div>
      <div v-if="errorMsg" class="tu-alert">{{ errorMsg }}</div>
      <div v-if="hasFile" class="tu-grid">
        <div class="tu-card"><div class="tu-card-title">原始大小</div><div class="tu-card-value">{{ humanSize(inSize) }}</div></div>
        <div class="tu-card"><div class="tu-card-title">输出大小</div><div class="tu-card-value">{{ outSize ? humanSize(outSize) : '—' }}</div></div>
      </div>
      <p class="tu-hint">浏览器端无法重采样图片，对扫描件/图片型 PDF 体积优化有限；主要精简结构层。如需大幅压缩，建议服务端工具。</p>
    </div>
  </div>
</template>

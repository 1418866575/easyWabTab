<script setup lang="ts">
/**
 * PDF 信息与元数据（纯前端，pdf-lib）
 * 查看页数、各页面尺寸（pt/mm），编辑标题/作者/主题/关键词/创建工具后导出。
 * 注：pdf-lib 不提供原生加密，加密需求后续以专用库补充。
 */
import { ref } from 'vue'
import { PDFDocument } from 'pdf-lib'
import { downloadBlob, humanSize } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const pageCount = ref(0)
const inSize = ref(0)
const outSize = ref(0)
const sizes = ref<{ pt: string; mm: string }[]>([])
const baseName = ref('doc')
const meta = ref({ title: '', author: '', subject: '', keywords: '', creator: '', producer: '' })
let data: Uint8Array | null = null

function keywordsToString(raw: unknown): string {
  if (Array.isArray(raw)) return raw.join(', ')
  if (typeof raw === 'string') return raw
  return ''
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  if (!f.name.toLowerCase().endsWith('.pdf')) { errorMsg.value = '请选择 PDF 文件'; return }
  inSize.value = f.size
  outSize.value = 0
  baseName.value = f.name.replace(/\.pdf$/i, '')
  data = new Uint8Array(await f.arrayBuffer())
  try {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true })
    pageCount.value = doc.getPageCount()
    const s = []
    for (let i = 0; i < Math.min(pageCount.value, 5); i++) {
      const p = doc.getPage(i)
      const { width, height } = p.getSize()
      s.push({ pt: `${Math.round(width)}×${Math.round(height)} pt`, mm: `${Math.round((width * 25.4) / 72)}×${Math.round((height * 25.4) / 72)} mm` })
    }
    sizes.value = s
    meta.value = {
      title: doc.getTitle() || '', author: doc.getAuthor() || '', subject: doc.getSubject() || '',
      keywords: keywordsToString(doc.getKeywords()), creator: doc.getCreator() || '', producer: doc.getProducer() || ''
    }
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  }
  ;(e.target as HTMLInputElement).value = ''
}

async function save() {
  if (!data) { errorMsg.value = '请先选择 PDF'; return }
  busy.value = true
  errorMsg.value = ''
  try {
    const doc = await PDFDocument.load(data, { ignoreEncryption: true })
    doc.setTitle(meta.value.title)
    doc.setAuthor(meta.value.author)
    doc.setSubject(meta.value.subject)
    doc.setKeywords(meta.value.keywords.split(',').map(s => s.trim()).filter(Boolean))
    doc.setCreator(meta.value.creator)
    doc.setProducer(meta.value.producer)
    const out = await doc.save()
    outSize.value = out.length
    downloadBlob(`${baseName.value}-meta.pdf`, new Blob([out as unknown as BlobPart], { type: 'application/pdf' }))
  } catch (err) {
    errorMsg.value = '保存失败：' + (err as Error).message
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
      <template v-if="pageCount">
        <div class="tu-field"><label class="tu-label">标题</label><input v-model="meta.title" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">作者</label><input v-model="meta.author" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">主题</label><input v-model="meta.subject" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">关键词（逗号分隔）</label><input v-model="meta.keywords" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">创建工具</label><input v-model="meta.creator" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">生成工具</label><input v-model="meta.producer" class="tu-input" /></div>
      </template>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy || !pageCount" @click="save">{{ busy ? '保存中…' : '保存元数据并下载' }}</button>
      </div>
    </div>
    <div>
      <div v-if="errorMsg" class="tu-alert">{{ errorMsg }}</div>
      <div v-if="pageCount" class="tu-grid">
        <div class="tu-card"><div class="tu-card-title">页数</div><div class="tu-card-value">{{ pageCount }}</div></div>
        <div class="tu-card"><div class="tu-card-title">原始大小</div><div class="tu-card-value">{{ humanSize(inSize) }}</div></div>
        <div class="tu-card"><div class="tu-card-title">输出大小</div><div class="tu-card-value">{{ outSize ? humanSize(outSize) : '—' }}</div></div>
      </div>
      <div v-if="sizes.length" class="tu-table-wrap" style="margin-top:12px">
        <table class="tu-table">
          <thead><tr><th>页面</th><th>尺寸 (pt)</th><th>尺寸 (mm)</th></tr></thead>
          <tbody>
            <tr v-for="(s, i) in sizes" :key="i"><td>第 {{ i + 1 }} 页</td><td>{{ s.pt }}</td><td>{{ s.mm }}</td></tr>
          </tbody>
        </table>
      </div>
      <div v-if="!pageCount && !errorMsg" class="tu-preview">信息区（先选 PDF）</div>
    </div>
  </div>
</template>

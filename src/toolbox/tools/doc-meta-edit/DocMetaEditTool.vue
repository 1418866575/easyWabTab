<script setup lang="ts">
import { ref } from 'vue'
import JSZip from 'jszip'
import { downloadBlob } from '../../core/download'

const fileInput = ref<HTMLInputElement | null>(null)
const form = ref({ title: '', creator: '', lastModifiedBy: '', description: '', keywords: '', category: '' })
const errorMsg = ref('')
const busy = ref(false)
const loaded = ref(false)
let zip: JSZip | null = null
let xml = ''

function getText(doc: Document, tag: string): string {
  const el = doc.querySelector(tag)
  return el ? el.textContent || '' : ''
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  errorMsg.value = ''
  loaded.value = false
  if (!f) return
  busy.value = true
  try {
    const buf = await f.arrayBuffer()
    zip = await JSZip.loadAsync(buf)
    const core = zip.file('docProps/core.xml')
    if (!core) { errorMsg.value = '未找到 docProps/core.xml（仅支持 .docx / .xlsx）'; return }
    xml = await core.async('string')
    const doc = new DOMParser().parseFromString(xml, 'application/xml')
    form.value = {
      title: getText(doc, 'dc\\:title') || getText(doc, 'title'),
      creator: getText(doc, 'dc\\:creator') || getText(doc, 'creator'),
      lastModifiedBy: getText(doc, 'cp\\:lastModifiedBy') || getText(doc, 'lastModifiedBy'),
      description: getText(doc, 'dc\\:description') || getText(doc, 'description'),
      keywords: getText(doc, 'cp\\:keywords') || getText(doc, 'keywords'),
      category: getText(doc, 'cp\\:category') || getText(doc, 'category')
    }
    loaded.value = true
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

function setOrCreate(doc: Document, ns: string, local: string, val: string) {
  const q = ns + '\\:' + local
  let el = doc.querySelector(q) || doc.querySelector(local)
  if (!el) {
    el = doc.createElement(ns + ':' + local)
    const cp = doc.documentElement
    cp.appendChild(el)
  }
  el.textContent = val
}

async function save() {
  if (!zip) return
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  setOrCreate(doc, 'dc', 'title', form.value.title)
  setOrCreate(doc, 'dc', 'creator', form.value.creator)
  setOrCreate(doc, 'cp', 'lastModifiedBy', form.value.lastModifiedBy || form.value.creator)
  setOrCreate(doc, 'dc', 'description', form.value.description)
  setOrCreate(doc, 'cp', 'keywords', form.value.keywords)
  setOrCreate(doc, 'cp', 'category', form.value.category)
  const newXml = new XMLSerializer().serializeToString(doc)
  zip.file('docProps/core.xml', newXml)
  const b = await zip.generateAsync({ type: 'blob' })
  downloadBlob('edited-' + Date.now() + '.docx', b)
}
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择文档（.docx / .xlsx）</label>
        <input ref="fileInput" type="file" accept=".docx,.xlsx" hidden @change="onFile" />
        <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">{{ busy ? '读取中…' : '选择文档' }}</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">仅修改 docProps/core.xml 核心属性，不改动正文；导出为新的同格式文件。</p>
    </div>
    <div>
      <template v-if="loaded">
        <div class="tu-field"><label class="tu-label">标题</label><input v-model="form.title" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">作者</label><input v-model="form.creator" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">最后修改者</label><input v-model="form.lastModifiedBy" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">描述</label><input v-model="form.description" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">关键词（逗号分隔）</label><input v-model="form.keywords" class="tu-input" /></div>
        <div class="tu-field"><label class="tu-label">分类</label><input v-model="form.category" class="tu-input" /></div>
        <div class="tu-row"><button class="tu-btn" @click="save">导出修改后文件</button></div>
      </template>
      <div v-else class="tu-preview">读取文档后在此编辑元信息</div>
    </div>
  </div>
</template>

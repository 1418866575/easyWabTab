<script setup lang="ts">
import { ref } from 'vue'
import JSZip from 'jszip'
import { downloadBlob, humanSize } from '../../core/download'

interface ImgItem { name: string; size: number }
const fileInput = ref<HTMLInputElement | null>(null)
const items = ref<ImgItem[]>([])
const errorMsg = ref('')
const busy = ref(false)
let zip: JSZip | null = null

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  items.value = []
  errorMsg.value = ''
  if (!f) return
  busy.value = true
  try {
    const buf = await f.arrayBuffer()
    zip = await JSZip.loadAsync(buf)
    const names = Object.keys(zip.files).filter(
      n => !zip!.files[n].dir && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(n)
    )
    items.value = names.map(n => ({
      name: n,
      size: (zip!.files[n] as any)._data?.uncompressedSize || 0
    }))
    if (!items.value.length) errorMsg.value = '未在该文件中找到图片（支持 docx / xlsx / pptx / epub 等 OOXML 文档）'
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}

function baseName(n: string) { return n.split('/').pop() || n }
async function dlOne(name: string) {
  if (!zip) return
  const blob = await zip.files[name].async('blob')
  downloadBlob(baseName(name), blob)
}
async function dlAll() {
  if (!zip || !items.value.length) return
  const out = new JSZip()
  for (const it of items.value) {
    const blob = await zip.files[it.name].async('blob')
    out.file(baseName(it.name), blob)
  }
  const b = await out.generateAsync({ type: 'blob' })
  downloadBlob('images-' + Date.now() + '.zip', b)
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-field">
        <label class="tu-label">选择文档（docx / xlsx / pptx / epub）</label>
        <input ref="fileInput" type="file" accept=".docx,.xlsx,.pptx,.epub" hidden @change="onFile" />
        <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">{{ busy ? '解析中…' : '选择文档' }}</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">文档本质为 ZIP 包，本工具仅在本地解包提取图片，不上传。</p>
    </div>
    <div>
      <div v-if="items.length" class="tu-row">
        <button class="tu-btn ghost" @click="dlAll">打包下载全部</button>
        <span class="tu-tree-type">共 {{ items.length }} 张</span>
      </div>
      <div v-if="items.length" class="tu-table-wrap">
        <table class="tu-table">
          <thead><tr><th>图片路径</th><th>大小</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="it in items" :key="it.name">
              <td class="break">{{ baseName(it.name) }}</td>
              <td>{{ humanSize(it.size) }}</td>
              <td><button class="tu-btn ghost" @click="dlOne(it.name)">下载</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="tu-preview">提取结果将显示在此处</div>
    </div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
</style>

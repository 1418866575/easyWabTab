<script setup lang="ts">
/**
 * 在线解压 ZIP：本地解析、列出条目、预览文本、单文件下载或打包下载
 */
import { computed, ref } from 'vue'
import { unzipSync, zipSync } from 'fflate'
import {
  filterEntries,
  formatSize,
  isTextEntry,
  MAX_ENTRIES,
  MAX_PREVIEW,
  mimeOf,
  type ZipEntryView
} from './unzipCore'
import { downloadBlob } from '../../core/download'
import { useToast } from '@/composables/useToast'
import TuDrop from '../../components/tool/TuDrop.vue'

const toast = useToast()

const MAX_BYTES = 200 * 1024 * 1024

const fileName = ref('')
const entries = ref<ZipEntryView[]>([])
const data = ref<Record<string, Uint8Array>>({})
const keyword = ref('')
const previewName = ref('')
const previewText = ref('')
const working = ref(false)

const shown = computed(() => filterEntries(entries.value, keyword.value).slice(0, MAX_ENTRIES))
const truncated = computed(() => filterEntries(entries.value, keyword.value).length > MAX_ENTRIES)
const totalSize = computed(() => entries.value.reduce((s, e) => s + e.size, 0))

async function onFiles(files: File[]) {
  const f = files[0]
  if (!f) return
  if (f.size > MAX_BYTES) {
    toast.error('文件超过 200MB，请选择更小的压缩包')
    return
  }
  working.value = true
  try {
    const buf = new Uint8Array(await f.arrayBuffer())
    const unzipped = unzipSync(buf)
    data.value = unzipped
    entries.value = Object.keys(unzipped).map((raw) => {
      const name = raw.replace(/\\/g, '/')
      return { name, size: unzipped[raw].length, dir: name.endsWith('/'), depth: name.split('/').length - 1 }
    }).filter((e) => e.name && !e.dir).sort((a, b) => a.name.localeCompare(b.name))
    fileName.value = f.name
    previewName.value = ''
    previewText.value = ''
    if (!entries.value.length) toast.warning('压缩包内没有文件条目')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    toast.error(/encrypt|password|crypto/i.test(msg) ? '加密压缩包暂不支持，请先用其它工具解密' : '解压失败，文件可能已损坏')
  }
  working.value = false
}

function rawOf(name: string): Uint8Array | undefined {
  if (data.value[name]) return data.value[name]
  const key = Object.keys(data.value).find((k) => k.replace(/\\/g, '/') === name)
  return key ? data.value[key] : undefined
}

function downloadOne(e: ZipEntryView) {
  const u8 = rawOf(e.name)
  if (!u8) {
    toast.error('未找到该条目')
    return
  }
  downloadBlob(e.name.split('/').pop() || 'file', new Blob([u8.slice()], { type: mimeOf(e.name) }))
}

function preview(e: ZipEntryView) {
  const u8 = rawOf(e.name)
  if (!u8) return
  previewName.value = e.name
  if (!isTextEntry(e.name)) {
    previewText.value = ''
    return
  }
  const slice = u8.length > MAX_PREVIEW ? u8.slice(0, MAX_PREVIEW) : u8
  previewText.value = new TextDecoder('utf-8', { fatal: false }).decode(slice)
}

async function downloadAll() {
  working.value = true
  try {
    const out = zipSync(data.value, { level: 0 })
    downloadBlob(`repacked-${Date.now()}.zip`, new Blob([out.slice()], { type: 'application/zip' }))
  } catch {
    toast.error('打包失败')
  }
  working.value = false
}

function clearAll() {
  data.value = {}
  entries.value = []
  fileName.value = ''
  keyword.value = ''
  previewName.value = ''
  previewText.value = ''
}
</script>

<template>
  <div class="tu-t1">
    <TuDrop
      accept=".zip,application/zip"
      hint="选择或拖入一个 ZIP 文件（≤ 200MB）"
      button-text="选择 ZIP"
      @files="onFiles"
    />

    <template v-if="entries.length">
      <div class="tu-toolbar">
        <span class="tu-hint uz-inline">{{ fileName }} · {{ entries.length }} 个文件 · {{ formatSize(totalSize) }}</span>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost" :disabled="working" @click="downloadAll">打包下载全部</button>
        <button type="button" class="tu-btn ghost" @click="clearAll">清空</button>
      </div>

      <input v-model="keyword" type="text" class="tu-input" placeholder="按路径关键字筛选…" />

      <div class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr>
              <th>路径</th>
              <th class="uz-size">大小</th>
              <th class="uz-op">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="e in shown" :key="e.name">
              <td class="uz-path">{{ e.name }}</td>
              <td class="uz-size">{{ formatSize(e.size) }}</td>
              <td class="uz-op">
                <button
                  v-if="isTextEntry(e.name)"
                  type="button"
                  class="tu-btn ghost uz-btn"
                  @click="preview(e)"
                >预览</button>
                <button type="button" class="tu-btn ghost uz-btn" @click="downloadOne(e)">下载</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-if="truncated" class="tu-alert">条目超过 {{ MAX_ENTRIES }} 个，仅显示前 {{ MAX_ENTRIES }} 条，可继续用关键字筛选。</p>

      <div v-if="previewName" class="uz-preview">
        <div class="tu-row uz-nomargin">
          <span class="tu-hint uz-inline">预览：{{ previewName }}</span>
        </div>
        <pre v-if="previewText" class="tu-out uz-text">{{ previewText }}</pre>
        <p v-else class="tu-alert info">该条目不是文本类型，请直接下载查看。</p>
      </div>
    </template>

    <p v-else class="tu-hint">ZIP 在浏览器本地解压，文件不会上传；加密压缩包暂不支持。</p>
  </div>
</template>

<style scoped>
.uz-inline { margin-bottom: 0; }
.uz-nomargin { margin-bottom: 6px; }
.uz-size { width: 90px; font-family: var(--font-family-mono); }
.uz-op { width: 130px; }
.uz-path { word-break: break-all; }
.uz-btn {height: 36px;
  padding: 0 12px;
  font-size: var(--fs-caption);}
.uz-text { max-height: 260px; }
</style>

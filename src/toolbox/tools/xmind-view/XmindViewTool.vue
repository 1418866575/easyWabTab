<script setup lang="ts">
import { ref } from 'vue'
import JSZip from 'jszip'

interface TNode { title: string; children: TNode[] }
interface Flat { title: string; depth: number }

const fileInput = ref<HTMLInputElement | null>(null)
const flat = ref<Flat[]>([])
const errorMsg = ref('')
const busy = ref(false)

function normalizeJson(data: any): TNode[] {
  const toNode = (t: any): TNode => ({
    title: t?.title ?? '(无标题)',
    children: (t?.children?.attached || []).map(toNode)
  })
  if (Array.isArray(data)) {
    return data.map((sheet: any) => toNode(sheet?.rootTopic || sheet))
  }
  if (data?.rootTopic) return [toNode(data.rootTopic)]
  return []
}
function normalizeXml(xml: string): TNode[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const walk = (el: Element): TNode => {
    let title = ''
    const titleEl = el.querySelector(':scope > title')
    if (titleEl) title = titleEl.textContent || ''
    const children: TNode[] = []
    const topics = el.querySelector(':scope > children > topics[type="attached"]')
    if (topics) topics.querySelectorAll(':scope > topic').forEach(c => children.push(walk(c)))
    return { title, children }
  }
  const out: TNode[] = []
  doc.querySelectorAll('sheet > topic').forEach(s => out.push(walk(s)))
  return out
}
function flatten(nodes: TNode[], depth: number, acc: Flat[]) {
  for (const n of nodes) { acc.push({ title: n.title, depth }); flatten(n.children, depth + 1, acc) }
  return acc
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  flat.value = []
  errorMsg.value = ''
  if (!f) return
  busy.value = true
  try {
    const buf = await f.arrayBuffer()
    const zip = await JSZip.loadAsync(buf)
    const jsonFile = zip.file('content.json')
    const xmlFile = zip.file('content.xml')
    let nodes: TNode[] = []
    if (jsonFile) {
      nodes = normalizeJson(JSON.parse(await jsonFile.async('string')))
    } else if (xmlFile) {
      nodes = normalizeXml(await xmlFile.async('string'))
    } else {
      errorMsg.value = '未识别到 content.json / content.xml，可能不是标准 XMind 文件'
    }
    if (nodes.length) flat.value = flatten(nodes, 0, [])
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  } finally {
    busy.value = false
    ;(e.target as HTMLInputElement).value = ''
  }
}
</script>

<template>
  <div class="tu-t6">
    <div class="tu-field">
      <label class="tu-label">选择 XMind 文件（.xmind）</label>
      <input ref="fileInput" type="file" accept=".xmind" hidden @change="onFile" />
      <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">{{ busy ? '解析中…' : '选择文件' }}</button>
    </div>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <p class="tu-hint">支持的 XMind 为 ZIP 包（含 content.json 或 content.xml），全程本地解析。</p>
    <div v-if="flat.length" class="tu-table-wrap">
      <div v-for="(n, i) in flat" :key="i" :style="{ paddingLeft: (n.depth * 18) + 'px' }" class="xrow">
        <span v-if="n.depth" class="tu-tree-type">↳</span>{{ n.title }}
      </div>
    </div>
    <div v-else-if="!errorMsg" class="tu-preview">大纲将显示在此处</div>
  </div>
</template>

<style scoped>
.xrow { padding: 4px 8px; border-bottom: 1px solid var(--color-border); font-size: 13px; word-break: break-all }
</style>

<script setup lang="ts">
/**
 * 磁盘清理（File System Access API，纯前端）
 *
 * 设计要点：
 * - 浏览器无法枚举磁盘驱动器，「选磁盘」实现为「选择目录」，用户可导航到磁盘根目录。
 * - 遍历走 dirHandle.entries() 递归；命中扩展名后才 getFile() 取大小，减少 IO。
 * - 删除走父目录 removeEntry()：永久删除、不进回收站，故单条与批量均二次确认。
 * - 扫描可中止，结果受 MAX_RESULTS 上限保护，避免大分区拖垮页面。
 */
import { computed, ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { useConfirm } from '@/composables/useConfirm'
import {
  DEFAULT_KINDS,
  FILE_KINDS,
  MAX_RESULTS,
  extOf,
  formatSize,
  joinPath,
  kindName,
  matchKind,
  shouldSkipDir,
  type FileKind
} from '../../core/diskScan'

/** File System Access API 最小类型（lib.dom 覆盖不全，避免类型错） */
interface FsHandleLike {
  kind: 'file' | 'directory'
  name: string
}
interface FsFileLike extends FsHandleLike {
  kind: 'file'
  getFile(): Promise<File>
}
interface FsDirLike extends FsHandleLike {
  kind: 'directory'
  entries(): AsyncIterableIterator<[string, FsHandleLike]>
  removeEntry(name: string): Promise<void>
}

interface Row {
  /** 相对路径，列表唯一键 */
  id: string
  name: string
  dir: string
  ext: string
  kind: FileKind
  size: number
  /** 直接父目录句柄，删除时用 */
  parent: FsDirLike
}

const toast = useToast()
const { showConfirm } = useConfirm()

const dirName = ref('')
const rootHandle = ref<FsDirLike | null>(null)
const thresholdMb = ref(100)
const selectedKinds = ref<FileKind[]>([...DEFAULT_KINDS])

const scanning = ref(false)
const abortFlag = ref(false)
const scannedCount = ref(0)
const currentDir = ref('')
const hitCapped = ref(false)

const results = ref<Row[]>([])
const deletedCount = ref(0)
const deletedBytes = ref(0)
const checked = ref<Set<string>>(new Set())

const sortKey = ref<'size' | 'name'>('size')
const sortDesc = ref(true)

const rows = computed(() => {
  const list = [...results.value]
  const d = sortDesc.value ? -1 : 1
  list.sort((a, b) => (sortKey.value === 'size' ? (a.size - b.size) * d : a.name.localeCompare(b.name) * d))
  return list
})

const totalBytes = computed(() => results.value.reduce((s, r) => s + r.size, 0))
const checkedRows = computed(() => results.value.filter(r => checked.value.has(r.id)))
const checkedBytes = computed(() => checkedRows.value.reduce((s, r) => s + r.size, 0))
const allChecked = computed(() => rows.value.length > 0 && rows.value.every(r => checked.value.has(r.id)))

function pickDir(): void {
  const w = window as unknown as { showDirectoryPicker?: (o?: { mode?: string }) => Promise<FsDirLike> }
  if (typeof w.showDirectoryPicker !== 'function') {
    toast.error('当前浏览器不支持目录选择，请使用 Chrome / Edge 等 Chromium 内核浏览器')
    return
  }
  w
    .showDirectoryPicker({ mode: 'readwrite' })
    .then(h => {
      rootHandle.value = h
      dirName.value = h.name
      resetResult()
      toast.success(`已选择目录：${h.name}`)
    })
    .catch(() => {
      /* 用户取消选择，静默 */
    })
}

function resetResult(): void {
  results.value = []
  checked.value = new Set()
  scannedCount.value = 0
  hitCapped.value = false
  deletedCount.value = 0
  deletedBytes.value = 0
}

function toggleKind(id: FileKind): void {
  selectedKinds.value = selectedKinds.value.includes(id)
    ? selectedKinds.value.filter(k => k !== id)
    : [...selectedKinds.value, id]
}

function setSort(k: 'size' | 'name'): void {
  if (sortKey.value === k) sortDesc.value = !sortDesc.value
  else {
    sortKey.value = k
    sortDesc.value = true
  }
}

function toggle(id: string): void {
  const s = new Set(checked.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  checked.value = s
}

function toggleAll(): void {
  checked.value = allChecked.value ? new Set() : new Set(rows.value.map(r => r.id))
}

function abortScan(): void {
  abortFlag.value = true
}

/** 递归遍历目录，命中规则：扩展名在选中类型内 且 大小 ≥ 阈值 */
async function walk(dir: FsDirLike, rel: string, out: Row[], minBytes: number, kinds: FileKind[]): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (abortFlag.value) return
    if (out.length >= MAX_RESULTS) {
      hitCapped.value = true
      return
    }
    if (handle.kind === 'directory') {
      if (shouldSkipDir(name)) continue
      const next = joinPath(rel, name)
      currentDir.value = next
      await walk(handle as FsDirLike, next, out, minBytes, kinds)
    } else {
      scannedCount.value++
      const ext = extOf(name)
      const kind = matchKind(ext, kinds)
      if (!kind) continue
      const file = await (handle as FsFileLike).getFile()
      if (file.size < minBytes) continue
      out.push({ id: joinPath(rel, name), name, dir: rel || '/', ext, kind, size: file.size, parent: dir })
    }
  }
}

async function startScan(): Promise<void> {
  const root = rootHandle.value
  if (!root) {
    toast.warning('请先选择要扫描的目录')
    return
  }
  if (!selectedKinds.value.length) {
    toast.warning('请至少选择一种文件类型')
    return
  }
  scanning.value = true
  abortFlag.value = false
  scannedCount.value = 0
  hitCapped.value = false
  checked.value = new Set()
  results.value = []

  const found: Row[] = []
  const minBytes = Math.max(0, Number(thresholdMb.value) || 0) * 1024 * 1024
  try {
    currentDir.value = ''
    await walk(root, '', found, minBytes, [...selectedKinds.value])
  } catch (e) {
    toast.error(`扫描中断：${(e as Error).message || '权限不足或目录不可读'}`)
  }
  scanning.value = false
  currentDir.value = ''
  results.value = found
  if (!found.length) toast.info('未找到符合条件的文件，可降低阈值或增加类型')
}

async function removeOne(r: Row): Promise<void> {
  const ok = await showConfirm(
    `确定删除该文件？此操作不可恢复，且不会进入回收站。\n\n文件名：${r.name}\n大小：${formatSize(r.size)}\n目录：${r.dir}`,
    '删除确认'
  )
  if (!ok) return
  try {
    await r.parent.removeEntry(r.name)
    results.value = results.value.filter(x => x.id !== r.id)
    const s = new Set(checked.value)
    s.delete(r.id)
    checked.value = s
    deletedCount.value++
    deletedBytes.value += r.size
    toast.success(`已删除：${r.name}`)
  } catch (e) {
    toast.error(`删除失败：${(e as Error).message || '权限不足或文件被占用'}`)
  }
}

async function removeChecked(): Promise<void> {
  const list = checkedRows.value
  if (!list.length) {
    toast.warning('请先勾选要删除的文件')
    return
  }
  const ok = await showConfirm(
    `确定删除选中的 ${list.length} 个文件？此操作不可恢复，且不会进入回收站。\n\n合计大小：${formatSize(checkedBytes.value)}`,
    '批量删除确认'
  )
  if (!ok) return
  let okCount = 0
  let bytes = 0
  let failed = 0
  for (const r of list) {
    try {
      await r.parent.removeEntry(r.name)
      okCount++
      bytes += r.size
      results.value = results.value.filter(x => x.id !== r.id)
    } catch {
      failed++
    }
  }
  deletedCount.value += okCount
  deletedBytes.value += bytes
  checked.value = new Set()
  if (failed) toast.warning(`已删除 ${okCount} 个，${failed} 个失败（权限不足或文件被占用）`)
  else toast.success(`已删除 ${okCount} 个文件，释放 ${formatSize(bytes)}`)
}
</script>

<template>
  <div class="tu-t6 dc">
    <!-- 目录选择 + 扫描控制 -->
    <div class="tu-toolbar">
      <button type="button" class="tu-btn" :disabled="scanning" @click="pickDir">选择目录</button>
      <span class="dc-dir" :class="{ 'is-empty': !dirName }">{{ dirName || '未选择' }}</span>
      <span class="tu-spacer" />
      <button v-if="!scanning" type="button" class="tu-btn" :disabled="!rootHandle" @click="startScan">开始扫描</button>
      <button v-else type="button" class="tu-btn ghost" @click="abortScan">中止扫描</button>
    </div>
    <p class="tu-hint dc-tip">
      浏览器安全限制：只能选择目录（可导航到磁盘根目录如 <code>D:\</code>），且不会暴露完整路径。
    </p>

    <!-- 阈值 + 类型 -->
    <div class="tu-toolbar">
      <span class="tu-label">大小阈值</span>
      <input v-model.number="thresholdMb" type="number" min="0" class="tu-input tu-inline dc-num" />
      <span class="tu-hint">MB（只列出 ≥ 该大小的文件）</span>
    </div>

    <div class="tu-toolbar">
      <span class="tu-label">扫描类型</span>
      <button
        v-for="k in FILE_KINDS"
        :key="k.id"
        type="button"
        class="tu-check"
        :class="{ 'is-on': selectedKinds.includes(k.id) }"
        @click="toggleKind(k.id)"
      >
        {{ k.name }}
      </button>
    </div>

    <!-- 统计 -->
    <div class="tu-stat">
      <span>已扫描文件 {{ scannedCount }}</span>
      <span>命中 {{ results.length }} 个</span>
      <span>合计 {{ formatSize(totalBytes) }}</span>
      <span v-if="deletedCount">已删除 {{ deletedCount }} 个 · 释放 {{ formatSize(deletedBytes) }}</span>
      <span v-if="hitCapped" class="dc-warn">已达上限 {{ MAX_RESULTS }} 条，结果已截断</span>
    </div>

    <p v-if="scanning" class="tu-hint">扫描中…当前目录：{{ currentDir || dirName || '/' }}</p>

    <!-- 批量操作 -->
    <div v-if="results.length" class="tu-toolbar">
      <button type="button" class="tu-check" @click="toggleAll">{{ allChecked ? '取消全选' : '全选当前' }}</button>
      <span class="tu-hint">已选 {{ checkedRows.length }} 个 · {{ formatSize(checkedBytes) }}</span>
      <span class="tu-spacer" />
      <button type="button" class="tu-btn is-danger" :disabled="!checkedRows.length || scanning" @click="removeChecked">
        删除选中
      </button>
    </div>

    <!-- 结果表 -->
    <div v-if="results.length" class="dc-wrap">
      <table class="dc-table">
        <thead>
          <tr>
            <th class="dc-chk"><input type="checkbox" :checked="allChecked" @change="toggleAll" /></th>
            <th class="is-sort" @click="setSort('name')">文件名{{ sortKey === 'name' ? (sortDesc ? ' ↓' : ' ↑') : '' }}</th>
            <th>目录</th>
            <th>类型</th>
            <th class="is-sort dc-size" @click="setSort('size')">大小{{ sortKey === 'size' ? (sortDesc ? ' ↓' : ' ↑') : '' }}</th>
            <th class="dc-op">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id">
            <td class="dc-chk"><input type="checkbox" :checked="checked.has(r.id)" @change="toggle(r.id)" /></td>
            <td class="dc-name" :title="r.name">{{ r.name }}</td>
            <td class="dc-path" :title="r.dir">{{ r.dir }}</td>
            <td><span class="dc-kind">{{ kindName(r.kind) }}</span></td>
            <td class="dc-size">{{ formatSize(r.size) }}</td>
            <td class="dc-op">
              <button type="button" class="tu-btn ghost is-danger" :disabled="scanning" @click="removeOne(r)">删除</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="!scanning" class="tu-alert">尚未扫描。请选择目录、设置阈值与类型后点击「开始扫描」。</p>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>仅支持 Chromium 内核浏览器（Chrome / Edge）；Firefox、Safari 因缺少 File System Access API 无法使用。</li>
          <li>「选择目录」由浏览器弹出，可导航到磁盘根目录；受安全限制只显示目录名，不暴露完整路径。</li>
          <li>扫描会自动跳过系统目录、软件安装目录与依赖/构建目录（如 Windows、Program Files、node_modules），既提速也防误删。</li>
          <li>结果按大小降序排列，最多保留 {{ MAX_RESULTS }} 条；扫描过程中可随时「中止」。</li>
          <li>
            <strong>删除为永久删除，不进入回收站，无法恢复</strong>；系统文件、被占用或无写权限的文件会删除失败并提示。
          </li>
          <li>删除大文件前请务必确认内容，建议先通过「目录」列核对位置。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.dc {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.dc-tip {
  margin: -6px 0 0;
}
.dc-dir {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
  max-width: 42%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dc-dir.is-empty {
  color: var(--color-text-muted);
  font-weight: 400;
}
.dc-num {
  max-width: 96px;
}
.dc-warn {
  color: var(--color-warning, #b88230);
}

.dc-wrap {
  overflow: auto;
  max-height: 46vh;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md, 10px);
  background: var(--color-bg-card);
}
.dc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.dc-table th,
.dc-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
}
.dc-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  font-weight: 600;
  white-space: nowrap;
}
.dc-table th.is-sort {
  cursor: pointer;
  user-select: none;
}
.dc-table th.is-sort:hover {
  color: var(--color-primary);
}
.dc-table tbody tr:hover {
  background: var(--color-primary-soft);
}
.dc-chk {
  width: 36px;
  text-align: center;
}
.dc-name {
  font-weight: 600;
  color: var(--color-text);
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dc-path {
  color: var(--color-text-secondary);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dc-size {
  white-space: nowrap;
  text-align: right;
}
.dc-op {
  width: 76px;
  text-align: center;
}
.dc-kind {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  white-space: nowrap;
}
.is-danger {
  color: var(--color-error, #dc2626);
  border-color: var(--color-error, #dc2626);
}
.is-danger:hover:not(:disabled) {
  color: #fff;
  background: var(--color-error, #dc2626);
}
.is-danger:disabled {
  opacity: 0.5;
}

@media (max-width: 640px) {
  .dc-dir {
    max-width: 34%;
  }
  .dc-name,
  .dc-path {
    max-width: 140px;
  }
}
</style>

<script setup lang="ts">
/**
 * JSON 格式化 / 压缩 / 校验 / 树形浏览（纯前端实现）
 * - 缩进 2/4/tab、键排序、压缩
 * - 语法错误精确定位到行 + 列
 * - 树形折叠浏览（JSONPath）+ 高亮预览（片段化渲染，不用 v-html）
 */
import { computed, ref } from 'vue'
import { formatJson, jsonStats, jsonToTree, tokenizeJson, type JsonTreeNode } from '../../core/json'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

type IndentKey = '2' | '4' | 'tab'

const input = ref('{\n  "name": "easy-web-tab",\n  "tools": ["json", "yaml"],\n  "ok": true\n}')
const indent = ref<IndentKey>('2')
const sortKeys = ref(false)
const compress = ref(false)
const tab = ref<'text' | 'tree' | 'highlight'>('text')

useDirtyFlag(() => !!input.value.trim())
const { copy, save } = useToolActions()

const result = computed(() =>
  formatJson(input.value, { indent: indent.value, sortKeys: sortKeys.value, compress: compress.value })
)

const stats = computed(() => jsonStats(input.value, result.value.ok ? result.value.value : undefined))
const tree = computed<JsonTreeNode | null>(() =>
  result.value.ok ? jsonToTree(result.value.value, 'root', '$') : null
)
const tokens = computed(() => (result.value.ok ? tokenizeJson(result.value.text) : []))

/** 树形展开状态：path -> 是否展开（缺省按深度自动展开前两层） */
const opened = ref<Record<string, boolean>>({})

function isOpen(path: string, depth: number): boolean {
  return opened.value[path] === undefined ? depth < 2 : opened.value[path]
}

function toggle(path: string, depth: number) {
  opened.value[path] = !isOpen(path, depth)
}

function writeBack() {
  if (result.value.ok) input.value = result.value.text
}

/** 树形行：递归渲染用扁平结构 */
interface TreeRow {
  node: JsonTreeNode
  depth: number
}

function rowsOf(node: JsonTreeNode | null): TreeRow[] {
  if (!node) return []
  const out: TreeRow[] = []
  const walk = (n: JsonTreeNode, depth: number) => {
    if (n.key !== 'root') out.push({ node: n, depth })
    if (n.children && isOpen(n.path, depth)) n.children.forEach(c => walk(c, depth + 1))
  }
  walk(node, 0)
  return out
}

const flatRows = computed(() => rowsOf(tree.value))
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-toolbar">
        <div class="tu-seg">
          <button type="button" :class="{ 'is-on': indent === '2' }" @click="indent = '2'">2 空格</button>
          <button type="button" :class="{ 'is-on': indent === '4' }" @click="indent = '4'">4 空格</button>
          <button type="button" :class="{ 'is-on': indent === 'tab' }" @click="indent = 'tab'">Tab</button>
        </div>
        <button type="button" class="tu-check" :class="{ 'is-on': sortKeys }" @click="sortKeys = !sortKeys">
          键排序
        </button>
        <button type="button" class="tu-check" :class="{ 'is-on': compress }" @click="compress = !compress">
          压缩
        </button>
        <span class="tu-spacer" />
        <button type="button" class="tu-btn ghost" :disabled="!result.ok" @click="writeBack">写回输入框</button>
      </div>

      <TuField label="原始 JSON" :extra="`${stats.chars} 字符 / ${stats.lines} 行`">
        <textarea
          v-model="input"
          class="tu-textarea"
          rows="16"
          spellcheck="false"
          placeholder="在此粘贴 JSON 内容"
          data-testid="tb-modal-input"
        />
      </TuField>

      <p v-if="!result.ok" class="tu-alert">
        语法错误：{{ result.error?.message }}
        <template v-if="result.error && result.error.line > 0">
          （第 {{ result.error.line }} 行 第 {{ result.error.column }} 列）
        </template>
      </p>
      <p v-else class="tu-alert ok">JSON 合法 · {{ stats.nodes }} 个节点 · 最大深度 {{ stats.depth }}</p>
    </div>

    <div>
      <div class="tu-toolbar">
        <div class="tu-seg">
          <button type="button" :class="{ 'is-on': tab === 'text' }" @click="tab = 'text'">格式化结果</button>
          <button type="button" :class="{ 'is-on': tab === 'highlight' }" @click="tab = 'highlight'">高亮</button>
          <button type="button" :class="{ 'is-on': tab === 'tree' }" @click="tab = 'tree'">树形</button>
        </div>
      </div>

      <TuOutput
        v-if="tab === 'text'"
        title="格式化结果"
        :text="result.text"
        filename="data.json"
        mime="application/json"
        empty="左侧输入合法 JSON 后显示结果"
      >
        <pre class="tu-code">{{ result.text }}</pre>
      </TuOutput>

      <TuOutput
        v-else-if="tab === 'highlight'"
        title="语法高亮预览"
        :text="result.text"
        filename="data.json"
        mime="application/json"
        empty="左侧输入合法 JSON 后显示高亮预览"
      >
        <pre class="tu-code"><span
          v-for="(t, i) in tokens"
          :key="i"
          :class="'tu-tok ' + t.type"
        >{{ t.text }}</span></pre>
      </TuOutput>

      <TuOutput
        v-else
        title="树形浏览（点击箭头展开）"
        :text="result.text"
        filename="data.json"
        mime="application/json"
        empty="左侧输入合法 JSON 后显示树形结构"
      >
        <div class="tu-tree">
          <p v-if="!flatRows.length" class="tu-out-empty">根节点为标量，无子级可展开</p>
          <div
            v-for="row in flatRows"
            :key="row.node.path"
            class="tu-tree-row"
            :style="{ paddingLeft: row.depth * 14 + 'px' }"
          >
            <button
              v-if="row.node.children && row.node.children.length"
              type="button"
              class="tu-tree-toggle"
              @click="toggle(row.node.path, row.depth)"
            >{{ isOpen(row.node.path, row.depth) ? '▾' : '▸' }}</button>
            <span v-else class="tu-tree-toggle is-leaf">·</span>
            <span class="tu-tree-key">{{ row.node.key }}</span>
            <span class="tu-tree-type">
              {{ row.node.type }}<template v-if="row.node.count !== undefined">[{{ row.node.count }}]</template>
            </span>
            <span v-if="!row.node.children" class="tu-tree-type">{{ row.node.preview }}</span>
          </div>
        </div>
      </TuOutput>

      <div class="tu-row">
        <button type="button" class="tu-btn ghost" :disabled="!result.text" @click="copy(result.text)">
          复制结果
        </button>
        <button
          type="button"
          class="tu-btn ghost"
          :disabled="!result.text"
          @click="save('data.json', result.text, 'application/json')"
        >下载 JSON</button>
      </div>
    </div>

    <details class="tu-folding tu-span">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>粘贴 JSON 后自动校验，右侧实时显示格式化结果。</li>
          <li>语法错误会定位到具体行与列，便于快速修正。</li>
          <li>「树形」页签按层级折叠浏览，默认展开前两层。</li>
          <li>所有处理在浏览器本地完成，不上传任何数据。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-span { grid-column: 1 / -1; }
.tu-code {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
.tu-tree-toggle {
  width: 16px;
  flex: none;
  padding: 0;
  background: transparent;
  border: none;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.tu-tree-toggle.is-leaf { color: var(--color-text-muted); }
.tu-tree-row { flex-wrap: wrap; }
</style>

<script setup lang="ts">
/**
 * 企业征信报文结构说明（二代 · V5.0）
 *
 * 层级化视图：数据块 → 信息单元 → 信息段 → 数据项（四层），逐项展示
 * 中文名称 / 标识(XML Tag) / 数据类型 / 长度 / 必填·选填 / 出现次数 / 格式与取值约束。
 *
 * 筛选：
 * - 业务域：源文档无「报文类型/业务场景」列，按 22 个数据块语义派生（见 creditReportData.ts）
 * - 关键字：名称 / 标识 / 类型 / 约束 实时匹配并高亮
 * - 必填·选填：全部 / 必含(M) / 选填(O) / 可重复(R)
 *
 * 数据来自 creditReportData.ts（由《企业征信报告结构说明（二代 · V5.0）》Excel 规范全量抽取生成）。
 */
import { ref, computed } from 'vue'
import {
  CREDIT_TREE,
  CREDIT_DOMAINS,
  CREDIT_MODEL,
  CREDIT_VERSION,
  CREDIT_CODE_TABLES
} from './creditReportData'
import type { CreditField } from './creditReportData'

const LEVEL_LABEL: Record<string, string> = { block: '数据块', unit: '信息单元', segment: '信息段', item: '数据项' }

const domainFilter = ref('')
const keyword = ref('')
const reqFilter = ref('') // '' | 'M' | 'O' | 'R'
const selectedTag = ref('EAA')
const expanded = ref<Set<string>>(new Set<string>(['EAA']))

const filterActive = computed(
  () => domainFilter.value !== '' || keyword.value.trim() !== '' || reqFilter.value !== ''
)

function domainOk(n: CreditField): boolean {
  return domainFilter.value === '' || n.domain === domainFilter.value
}
function kwOk(n: CreditField): boolean {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return true
  const hay = (n.name + ' ' + n.tag + ' ' + (n.type || '') + ' ' + (n.remark || '')).toLowerCase()
  return hay.includes(k)
}
function reqOk(n: CreditField): boolean {
  return reqFilter.value === '' || (n.requiredCode || '') === reqFilter.value
}

function build(nodes: CreditField[]): CreditField[] {
  const out: CreditField[] = []
  for (const n of nodes) {
    const kids = n.children ? build(n.children) : []
    if ((domainOk(n) && kwOk(n) && reqOk(n)) || kids.length) out.push({ ...n, children: kids })
  }
  return out
}
const displayTree = computed(() => (filterActive.value ? build(CREDIT_TREE) : CREDIT_TREE))

const isExpanded = (tag: string): boolean => (filterActive.value ? true : expanded.value.has(tag))
function toggle(tag: string): void {
  if (filterActive.value) return
  const s = new Set(expanded.value)
  if (s.has(tag)) s.delete(tag)
  else s.add(tag)
  expanded.value = s
}
function select(n: CreditField): void {
  selectedTag.value = n.tag
  if (!filterActive.value) {
    const s = new Set(expanded.value)
    s.add(n.tag)
    expanded.value = s
  }
}
function resetFilters(): void {
  domainFilter.value = ''
  keyword.value = ''
  reqFilter.value = ''
  selectedTag.value = 'EAA'
  expanded.value = new Set<string>(['EAA'])
}

interface Row {
  node: CreditField
  depth: number
  hasKids: boolean
}
const visibleRows = computed<Row[]>(() => {
  const rows: Row[] = []
  const walk = (ns: CreditField[], depth: number) => {
    for (const n of ns) {
      if (n.level === 'item') continue // 数据项不进入左侧树，仅在选中信息段时于右侧详情区列出
      const hasKids = !!(n.children && n.children.some((c) => c.level !== 'item'))
      rows.push({ node: n, depth, hasKids })
      if (hasKids && isExpanded(n.tag)) walk(n.children as CreditField[], depth + 1)
    }
  }
  walk(displayTree.value, 0)
  return rows
})

const selected = computed<CreditField | undefined>(() => {
  let found: CreditField | undefined
  const dfs = (ns: CreditField[]) => {
    for (const n of ns) {
      if (n.tag === selectedTag.value) {
        found = n
        return
      }
      if (n.children) dfs(n.children)
    }
  }
  dfs(CREDIT_TREE)
  return found
})

/**
 * 选中节点后，右侧展示「数据项」的承载节点（信息段 / 汇总类信息单元，数据项直接挂在单元下）。
 * - 选中信息段：直接是其全部数据项
 * - 选中数据项：回退到父承载（信息段或汇总单元），并高亮该数据项
 * - 选中汇总类信息单元（EB04/EC01… 数据项直接挂在单元下）：展示该单元的数据项
 * - 选中含信息段的单元 / 数据块：聚合其下所有承载节点的数据项，按承载分组展示
 */
function collectContainers(nodes: CreditField[], out: CreditField[]): void {
  for (const n of nodes) {
    if ((n.children || []).some((c) => c.level === 'item')) out.push(n)
    else if (n.children) collectContainers(n.children, out)
  }
}
const detailContainers = computed<CreditField[]>(() => {
  const cur = selected.value
  if (!cur) return []
  if (cur.level === 'item') {
    let parent: CreditField | undefined
    const dfs = (ns: CreditField[], par?: CreditField) => {
      for (const n of ns) {
        if (n.tag === cur.tag) {
          parent = par
          return
        }
        if (n.children) dfs(n.children, n)
      }
    }
    dfs(CREDIT_TREE)
    return parent ? [parent] : []
  }
  const out: CreditField[] = []
  collectContainers([cur], out)
  return out
})

const totals = (() => {
  const c: Record<string, number> = { block: 0, unit: 0, segment: 0, item: 0 }
  const dfs = (ns: CreditField[]) =>
    ns.forEach((n) => {
      c[n.level] = (c[n.level] || 0) + 1
      if (n.children) dfs(n.children)
    })
  dfs(CREDIT_TREE)
  return c
})()

/** 关键字高亮分段 */
function parts(text: string): { t: string; hit: boolean }[] {
  const k = keyword.value.trim()
  if (!k) return [{ t: text, hit: false }]
  const lower = text.toLowerCase()
  const kl = k.toLowerCase()
  const out: { t: string; hit: boolean }[] = []
  let i = 0
  for (;;) {
    const idx = lower.indexOf(kl, i)
    if (idx < 0) {
      out.push({ t: text.slice(i), hit: false })
      break
    }
    if (idx > i) out.push({ t: text.slice(i, idx), hit: false })
    out.push({ t: text.slice(idx, idx + k.length), hit: true })
    i = idx + k.length
  }
  return out
}
</script>

<template>
  <div class="tu-t1 cr">
    <!-- 工具条：业务域 / 关键字 / 必填选填 -->
    <div class="tu-toolbar">
      <label class="tu-label">业务域</label>
      <select class="tu-select" v-model="domainFilter">
        <option value="">全部</option>
        <option v-for="d in CREDIT_DOMAINS" :key="d.id" :value="d.id">{{ d.id }}</option>
      </select>
      <input
        class="tu-input cr-kw"
        v-model="keyword"
        placeholder="搜索名称 / 标识 / 类型 / 约束…"
      />
      <div class="tu-seg">
        <button :class="{ on: reqFilter === '' }" @click="reqFilter = ''">全部</button>
        <button :class="{ on: reqFilter === 'M' }" @click="reqFilter = 'M'">必含</button>
        <button :class="{ on: reqFilter === 'O' }" @click="reqFilter = 'O'">选填</button>
        <button :class="{ on: reqFilter === 'R' }" @click="reqFilter = 'R'">可重复</button>
      </div>
      <span class="tu-spacer"></span>
      <button class="tu-btn ghost" @click="resetFilters">重置</button>
    </div>

    <!-- 左树 + 右详情 -->
    <div class="tu-t4 cr-main">
      <div class="cr-left">
        <div class="tu-stat cr-stat">
          <span>数据块 {{ totals.block }}</span>
          <span>信息单元 {{ totals.unit }}</span>
          <span>信息段 {{ totals.segment }}</span>
          <span>数据项 {{ totals.item }}</span>
          <span v-if="filterActive" class="cr-match">显示 {{ visibleRows.length }} 个节点</span>
        </div>
        <div class="cr-tree-wrap">
          <div class="tu-tree">
            <div
              v-for="row in visibleRows"
              :key="row.node.tag"
              class="cr-row"
              :class="{ on: row.node.tag === selectedTag }"
              :style="{ paddingLeft: 6 + row.depth * 16 + 'px' }"
              @click="select(row.node)"
            >
              <button
                v-if="row.hasKids"
                class="tu-tree-toggle"
                type="button"
                @click.stop="toggle(row.node.tag)"
              >
                {{ isExpanded(row.node.tag) ? '▾' : '▸' }}
              </button>
              <span v-else class="cr-dot">·</span>
              <span class="cr-lvl" :class="'cr-lvl-' + row.node.level">{{ LEVEL_LABEL[row.node.level] }}</span>
              <span class="cr-name">
                <template v-for="(p, i) in parts(row.node.name)" :key="i">
                  <mark v-if="p.hit" class="cr-mark">{{ p.t }}</mark>
                  <span v-else>{{ p.t }}</span>
                </template>
              </span>
              <code class="cr-tag">{{ row.node.tag }}</code>
            </div>
          </div>
        </div>
      </div>

      <div class="cr-right">
        <template v-if="selected">
          <div class="cr-dhead">
            <span class="cr-lvl" :class="'cr-lvl-' + selected.level">{{ LEVEL_LABEL[selected.level] }}</span>
            <h3 class="cr-title">{{ selected.name }}</h3>
            <code class="cr-code">{{ selected.tag }}</code>
            <span class="cr-domain">{{ selected.domain }}</span>
          </div>

          <div class="tu-table-wrap cr-detail-wrap">
            <table class="tu-table">
              <tbody>
                <tr><th>中文名称</th><td>{{ selected.name }}</td></tr>
                <tr><th>标识（XML Tag）</th><td><code>{{ selected.tag }}</code></td></tr>
                <tr><th>层级</th><td>{{ LEVEL_LABEL[selected.level] }}</td></tr>
                <tr><th>出现次数</th><td>{{ selected.occurrence }}</td></tr>
                <tr v-if="selected.type !== undefined"><th>数据类型</th><td><code>{{ selected.type }}</code></td></tr>
                <tr v-if="selected.length !== undefined"><th>长度</th><td>{{ selected.length }}</td></tr>
                <tr v-if="selected.required !== undefined">
                  <th>必填 / 选填</th>
                  <td><span class="cr-req" :class="'cr-req-' + (selected.requiredCode || '')">{{ selected.required }}</span></td>
                </tr>
                <tr><th>业务域</th><td>{{ selected.domain }}</td></tr>
                <tr v-if="selected.remark">
                  <th>格式与取值约束</th>
                  <td class="cr-remark">
                    <template v-for="(p, i) in parts(selected.remark)" :key="i">
                      <mark v-if="p.hit" class="cr-mark">{{ p.t }}</mark>
                      <span v-else>{{ p.t }}</span>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 选中任一节点（信息段 / 汇总单元 / 单元 / 数据块）时，完整展示其下数据项，按承载节点分组 -->
          <template v-if="detailContainers.length">
            <template v-for="seg in detailContainers" :key="seg.tag">
              <div class="cr-sub-title">
                {{ LEVEL_LABEL[seg.level] }} {{ seg.tag }} · {{ seg.name }}（含 {{ seg.children?.length ?? 0 }} 个数据项，点击卡片可聚焦该数据项）
              </div>
              <div
                v-for="c in seg.children ?? []"
                :key="c.tag"
                class="cr-item-card"
                :class="{ on: c.tag === selectedTag }"
                @click="select(c)"
              >
                <div class="cr-item-head">
                  <span class="cr-lvl cr-lvl-item">数据项</span>
                  <span class="cr-item-name">
                    <template v-for="(p, i) in parts(c.name)" :key="i">
                      <mark v-if="p.hit" class="cr-mark">{{ p.t }}</mark>
                      <span v-else>{{ p.t }}</span>
                    </template>
                  </span>
                  <code class="cr-tag">{{ c.tag }}</code>
                  <span class="cr-req" :class="'cr-req-' + (c.requiredCode || '')">{{ c.required || '—' }}</span>
                </div>
                <div class="tu-table-wrap cr-item-detail">
                  <table class="tu-table">
                    <tbody>
                      <tr><th>数据类型</th><td><code>{{ c.type || '—' }}</code></td></tr>
                      <tr><th>长度</th><td>{{ c.length || '—' }}</td></tr>
                      <tr><th>出现次数</th><td>{{ c.occurrence }}</td></tr>
                      <tr>
                        <th>必填 / 选填</th>
                        <td><span class="cr-req" :class="'cr-req-' + (c.requiredCode || '')">{{ c.required || '—' }}</span></td>
                      </tr>
                      <tr><th>业务域</th><td>{{ c.domain }}</td></tr>
                      <tr v-if="c.remark">
                        <th>格式与取值约束</th>
                        <td class="cr-remark">
                          <template v-for="(p, i) in parts(c.remark)" :key="i">
                            <mark v-if="p.hit" class="cr-mark">{{ p.t }}</mark>
                            <span v-else>{{ p.t }}</span>
                          </template>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div v-if="c.codeTable" class="cr-codetable">
                  <div class="cr-sub-title">
                    码表引用（表{{ c.codeTable.no }} · {{ c.codeTable.name }}）
                    <span class="cr-ct-count">{{ c.codeTable.entries.length }} 条</span>
                  </div>
                  <div class="tu-table-wrap cr-ct-wrap">
                    <table class="tu-table">
                      <thead><tr><th>码值</th><th>含义</th><th>说明</th></tr></thead>
                      <tbody>
                        <tr v-for="e in c.codeTable.entries" :key="e.code">
                          <td><code>{{ e.code }}</code></td>
                          <td>{{ e.name }}</td>
                          <td class="cr-ct-desc">{{ e.desc || '—' }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </template>
          </template>
          <div v-else class="cr-empty tu-hint">
            本节点下暂无数据项明细。
          </div>
        </template>
        <div v-else class="cr-empty tu-hint">从左侧选择任意节点查看字段详情。</div>
      </div>
    </div>

    <!-- 说明 / 版本 / 代码表 -->
    <details class="tu-folding cr-about">
      <summary>关于本结构说明（层级模型 / 版本 / 代码表）</summary>
      <div class="tu-folding-body">
        <p class="cr-model">{{ CREDIT_MODEL }}</p>
        <p class="cr-note">
          说明：数据层由《企业征信报告结构说明（二代 · V5.0）》官方 Excel 规范全量抽取，
          覆盖全部 22 个数据块 / 47 个信息单元 / 43 个信息段 / 993 个数据项，以及 72 张代码表；
          其中汇总类信息单元（如授信协议汇总 EB04、基本概况 EC01、注册资本 EC02 等）的数据项直接挂在单元之下，无独立信息段。
          数据项出现次数 <code>[1..1]</code> 为必含、<code>[0..1]</code> 为选填、
          <code>[0..*]/[0..99]</code> 为可重复；Enum 类型数据项经「代码表」解译为中文含义。
        </p>
        <table class="tu-table cr-ver">
          <thead><tr><th>版本</th><th>变更内容</th><th>时间</th></tr></thead>
          <tbody>
            <tr v-for="v in CREDIT_VERSION" :key="v.version">
              <td><code>{{ v.version }}</code></td>
              <td>{{ v.change }}</td>
              <td>{{ v.time }}</td>
            </tr>
          </tbody>
        </table>
        <p class="cr-note" v-if="CREDIT_CODE_TABLES.length">
          代码表目录（共 {{ CREDIT_CODE_TABLES.length }} 张，数据项备注中标注「码表N」的字段已自动挂载对应码值映射）：
        </p>
        <div v-if="CREDIT_CODE_TABLES.length" class="tu-table-wrap cr-codes-wrap">
          <table class="tu-table">
            <thead>
              <tr>
                <th>表号</th>
                <th>名称</th>
                <th>码值数</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in CREDIT_CODE_TABLES" :key="t.no">
                <td><code>{{ t.no }}</code></td>
                <td>{{ t.name }}</td>
                <td>{{ t.entries.length }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </details>
  </div>
</template>

<style scoped>
.cr {
  min-height: 0;
}
.cr-main {
  min-height: 0;
}
.cr-left {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.cr-stat {
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.cr-match {
  color: var(--color-primary);
  font-weight: 600;
}
.cr-tree-wrap {
  max-height: 62vh;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 4px;
}
.cr-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12.5px;
}
.cr-row:hover {
  background: var(--color-bg-hover);
}
.cr-row.on {
  background: var(--color-primary-soft);
}
.cr-dot {
  width: 16px;
  text-align: center;
  color: var(--color-text-muted);
  flex: 0 0 16px;
}
.cr-lvl {
  flex: 0 0 auto;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  color: var(--color-text-muted);
  background: var(--color-bg-card);
}
.cr-lvl-block {
  color: var(--color-primary);
  border-color: var(--color-primary);
}
.cr-lvl-segment {
  color: var(--color-text-secondary);
}
.cr-name {
  font-weight: 500;
  color: var(--color-text);
}
.cr-tag {
  margin-left: auto;
  font-family: var(--font-family-mono);
  font-size: 11px;
  color: var(--color-text-muted);
  background: var(--color-bg-input);
  padding: 1px 5px;
  border-radius: 5px;
  flex: 0 0 auto;
}
.cr-mark {
  background: var(--color-warning-soft);
  color: var(--color-warning);
  border-radius: 2px;
  padding: 0 1px;
}
.cr-right {
  min-height: 0;
}
.cr-dhead {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.cr-title {
  font-size: 16px;
  margin: 0;
  color: var(--color-text);
}
.cr-code {
  font-family: var(--font-family-mono);
  font-size: 12px;
  color: var(--color-text-muted);
  background: var(--color-bg-input);
  padding: 2px 6px;
  border-radius: 6px;
}
.cr-domain {
  font-size: 11px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  padding: 2px 8px;
  border-radius: 999px;
  margin-left: auto;
}
.cr-detail-wrap {
  max-height: 36vh;
}
.cr-req {
  font-weight: 600;
}
.cr-req-M {
  color: var(--color-error);
}
.cr-req-O {
  color: var(--color-text-muted);
}
.cr-req-R {
  color: var(--color-warning);
}
.cr-remark {
  line-height: 1.7;
  color: var(--color-text-secondary);
}
.cr-sub-title {
  font-size: 12px;
  color: var(--color-text-secondary);
  margin: 12px 0 6px;
}
.cr-sub-wrap {
  max-height: 24vh;
}
.cr-item-card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  margin-bottom: 10px;
  cursor: pointer;
  background: var(--color-bg-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.cr-item-card:hover {
  border-color: var(--color-primary);
}
.cr-item-card.on {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-soft);
}
.cr-item-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}
.cr-item-name {
  font-weight: 600;
  color: var(--color-text);
}
.cr-item-detail {
  max-height: 30vh;
}
.cr-lvl-item {
  color: var(--color-text-secondary);
  border-color: var(--color-border);
}
.cr-codetable {
  margin-top: 12px;
}
.cr-ct-count {
  margin-left: 6px;
  font-size: 11px;
  color: var(--color-text-muted);
  font-weight: 400;
}
.cr-ct-wrap {
  max-height: 30vh;
}
.cr-ct-desc {
  color: var(--color-text-secondary);
  line-height: 1.6;
}
.cr-codes-wrap {
  max-height: 32vh;
}
.cr-empty {
  padding: 20px;
}
.cr-kw {
  flex: 1;
  min-width: 160px;
}
.cr-about {
  margin-top: 4px;
}
.cr-model {
  margin: 6px 0;
  line-height: 1.8;
  color: var(--color-text-secondary);
}
.cr-note {
  margin: 8px 0;
  line-height: 1.7;
  color: var(--color-text-muted);
  font-size: 12px;
}
.cr-ver {
  margin: 8px 0;
}
</style>

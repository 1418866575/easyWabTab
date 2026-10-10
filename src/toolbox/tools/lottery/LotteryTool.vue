<script setup lang="ts">
/**
 * 年会抽奖（纯前端，名单与记录持久化到 IndexedDB store: lottery）
 *
 * - 名单导入：粘贴文本或选择 txt/csv 文件 → parsePeople 解析（同名去重、可带部门）
 * - 抽奖：选中奖项 → 点击「开始抽奖」→ 大屏滚动动效 → 定格中奖者；
 *   中奖者自动移出候选池，保证同一人不会进入下一次抽奖
 * - 记录：每次中奖写入 wins（含奖项、序号、时间），可按奖项分组查看 / 导出 CSV
 * - 一键清除：同时清空名单与中奖记录（IndexedDB + 内存态同步）
 * - 大屏投屏：用工具面板自带的「全屏展示」按钮即可铺满视口，本组件字号随之放大
 */
import { ref, computed, onMounted } from 'vue'
import { useToast } from '@/composables/useToast'
import { idbGet, idbPut, idbClear } from '@/composables/useIdb'
import { exportXlsx } from '@/composables/xlsxExport'
import {
  parsePeople,
  candidatesOf,
  drawOne,
  makeWin,
  groupWinsByAward,
  normalizeLotteryData,
  DEFAULT_AWARDS,
  type LotteryAward,
  type LotteryData,
  type LotteryPerson,
  type LotteryWin
} from '../../core/lottery'

const toast = useToast()

const people = ref<LotteryPerson[]>([])
const wins = ref<LotteryWin[]>([])
const awards = ref<LotteryAward[]>(DEFAULT_AWARDS.map(a => ({ ...a })))
const loaded = ref(false)

/** 导入名单的原始文本 */
const rawText = ref('')
/** 当前选中的奖项 id */
const activeAwardId = ref(DEFAULT_AWARDS[0].id)
/** 抽奖动效状态 */
const rolling = ref(false)
/** 当前展示（大屏）的名字 */
const displayName = ref('')
const displayDept = ref('')
/** 刚中奖的高亮态 */
const justWon = ref(false)

const LS_STORE = 'lottery' as const

const pool = computed(() => candidatesOf(people.value, wins.value))
const activeAward = computed(() => awards.value.find(a => a.id === activeAwardId.value) || awards.value[0])
/** 该奖项已抽出的人数 */
const activeAwardWonCount = computed(() => wins.value.filter(w => w.awardId === activeAwardId.value).length)
/** 该奖项是否已抽满 */
const activeAwardDone = computed(
  () => !!activeAward.value && activeAwardWonCount.value >= activeAward.value.count
)
const winMap = computed(() => groupWinsByAward(wins.value))

/* ---------------- 持久化 ---------------- */

/**
 * 深拷贝成纯 JSON 数据再入库。
 *
 * 不能只 `toRaw()`：那只能脱最外层 Proxy，脱不掉数组**元素**上的 Proxy。
 * 抽奖写记录用的是 `wins.value = [...wins.value, win]`，展开 reactive 数组时
 * Vue 会把读到的每个元素包成 reactive Proxy，于是新数组里旧元素全是 Proxy，
 * 结构化克隆直接抛 DataCloneError。people 那边能存成功只是因为
 * `people.value = list` 的元素本就来自 parsePeople 的裸对象。
 *
 * 与 studentGoals / studentGrades / teacher 等 store 的 JSON 深拷贝写法一致。
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

async function persist(): Promise<void> {
  const data: LotteryData = toPlain({ people: people.value, wins: wins.value })
  try {
    await idbPut(LS_STORE, data)
  } catch (err) {
    console.error('抽奖数据保存失败', err)
    toast.error('保存失败：' + (err as Error).message)
  }
}

async function load(): Promise<void> {
  try {
    const raw = await idbGet<unknown>(LS_STORE)
    const data = normalizeLotteryData(raw)
    people.value = data.people
    wins.value = data.wins
  } catch (err) {
    console.error('抽奖数据读取失败', err)
    toast.error('读取失败：' + (err as Error).message)
  } finally {
    loaded.value = true
  }
}

onMounted(load)

/* ---------------- 名单导入 / 清除 ---------------- */

/** 若首行是「姓名/部门」表头（含中英文），导入时跳过，避免带出两个假人 */
function stripHeaderIfAny(text: string): string {
  const lines = (text || '').split(/\r?\n/)
  if (!lines.length) return text
  const first = lines[0].trim()
  const isHeader = /^(姓名|name)$/i.test(first) || /^(姓名|name)[,，\t]/i.test(first)
  return isHeader ? lines.slice(1).join('\n') : text
}

function onImportText() {
  const list = parsePeople(stripHeaderIfAny(rawText.value))
  if (!list.length) {
    toast.warning('未解析到有效姓名，请检查名单内容')
    return
  }
  people.value = list
  persist()
  toast.success(`已导入 ${list.length} 人`)
}

async function onPickFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const name = f.name.toLowerCase()
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      await importXlsx(f)
    } else {
      const text = await f.text()
      rawText.value = text
      onImportText()
    }
  } catch (err) {
    toast.error('读取文件失败：' + (err as Error).message)
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

/** 解析 Excel 名单（xlsx/xls）：取首个工作表，第一列姓名、第二列部门，转文本后复用 parsePeople */
async function importXlsx(f: File) {
  const XLSX = await import('xlsx')
  const buf = await f.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })
  const firstSheet = wb.SheetNames[0]
  if (!firstSheet) {
    toast.error('Excel 中没有工作表')
    return
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], {
    header: 1,
    blankrows: false,
    defval: ''
  }) as unknown[][]
  const text = rows
    .filter(r => Array.isArray(r) && r.some(c => c !== '' && c !== null && c !== undefined))
    .map(r => (r as unknown[]).map(c => (c === null || c === undefined ? '' : String(c).trim())))
    .map(r => (r[1] ? `${r[0]},${r[1]}` : `${r[0]}`))
    .join('\n')
  rawText.value = text
  onImportText()
}

async function clearAll() {
  if (!people.value.length && !wins.value.length) {
    toast.info('名单与记录均为空，无需清除')
    return
  }
  people.value = []
  wins.value = []
  rawText.value = ''
  displayName.value = ''
  displayDept.value = ''
  try {
    await idbClear(LS_STORE)
  } catch (err) {
    // 清库失败也要把内存态清空，避免界面残留
    console.error('抽奖数据清除失败', err)
    toast.error('清除失败：' + (err as Error).message)
  }
  toast.success('已清除全部名单与抽奖记录')
}

/* ---------------- 抽奖 ---------------- */

let timer: ReturnType<typeof setInterval> | undefined

function stopRolling() {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
  rolling.value = false
}

function startDraw() {
  if (rolling.value) return
  if (!people.value.length) {
    toast.warning('请先导入抽奖名单')
    return
  }
  if (activeAwardDone.value) {
    toast.warning(`「${activeAward.value?.name}」已抽满 ${activeAward.value?.count} 人`)
    return
  }
  if (!pool.value.length) {
    toast.warning('候选池已空，所有人均已中奖')
    return
  }

  justWon.value = false
  rolling.value = true
  const candidates = pool.value
  // 滚动动效：定时切换候选名字，定格后写入中奖记录
  timer = setInterval(() => {
    const p = candidates[Math.floor(Math.random() * candidates.length)]
    displayName.value = p.name
    displayDept.value = p.dept || ''
  }, 60)

  // 动效时长：按候选人数给一个稳定的展示时长（1.6s）
  setTimeout(() => {
    stopRolling()
    const winner = drawOne(candidates)
    const award = activeAward.value
    if (!award) return
    const seq = activeAwardWonCount.value + 1
    const win = makeWin(winner, award, seq, Date.now())
    wins.value = [...wins.value, win]
    displayName.value = winner.name
    displayDept.value = winner.dept || ''
    justWon.value = true
    persist()
    toast.success(`${award.name}：${winner.name}${winner.dept ? '（' + winner.dept + '）' : ''}`)
  }, 1600)
}

/* ---------------- 中奖记录删除 ---------------- */

/**
 * 删除一条中奖记录：该人自动回到候选池（pool 是 computed，会随 wins 变化），
 * 同奖项剩余记录按抽取先后顺序重排序号保持 1..n 连续。
 * 元素统一 `{ ...x }` 展开成普通对象，避免 reactive Proxy 混进数组。
 */
function removeWin(w: LotteryWin) {
  const removed = wins.value.find(x => x.id === w.id)
  if (!removed) return
  let seq = 0
  wins.value = wins.value
    .filter(x => x.id !== w.id)
    .map(x => ({ ...x, seq: x.awardId === removed.awardId ? ++seq : x.seq }))
  persist()
  toast.success(`已删除：${removed.name}${removed.dept ? '（' + removed.dept + '）' : ''}，已回到候选池`)
}

/* ---------------- 记录导出 / 模板下载 ---------------- */

/** 下载名单导入模板（xlsx，含「姓名/部门」表头与示例行） */
async function downloadTemplate() {
  await exportXlsx(
    '抽奖名单模板',
    ['姓名', '部门'],
    [
      ['张三', '研发部'],
      ['李四', '市场部'],
      ['王五', '销售部']
    ],
    { sheetName: '抽奖名单' }
  )
  toast.success('模板已下载（xlsx），填写后用「选择文件」导入')
}

/** 导出中奖记录为 xlsx */
async function exportRecords() {
  if (!wins.value.length) {
    toast.info('暂无中奖记录')
    return
  }
  const headers = ['奖项', '序号', '姓名', '部门', '中奖时间']
  const rows = wins.value.map(w => [
    w.awardName,
    w.seq,
    w.name,
    w.dept || '',
    new Date(w.ts).toLocaleString('zh-CN')
  ])
  await exportXlsx('抽奖记录', headers, rows, { sheetName: '中奖记录' })
  toast.success('已导出中奖记录（xlsx）')
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('zh-CN', { hour12: false })
}
</script>

<template>
  <div class="tu-t2 lot">
    <!-- 左：名单与奖项 -->
    <div class="tu-t1">
      <div class="tu-field">
        <label class="tu-label">抽奖名单（每行一人，可写「姓名,部门」；同名自动去重）</label>
        <textarea
          v-model="rawText"
          class="tu-textarea"
          style="min-height: 140px"
          placeholder="张三&#10;李四,研发部&#10;王五，销售部"
        />
        <div class="tu-row" style="margin-top: 8px">
          <button class="tu-btn" @click="onImportText">导入名单</button>
          <label class="tu-btn ghost" style="cursor: pointer">
            选择文件
            <input type="file" accept=".txt,.csv,.xlsx,.xls" hidden @change="onPickFile" />
          </label>
          <button class="tu-btn ghost" title="下载 CSV 模板，按模板填写后导入" @click="downloadTemplate">下载模板</button>
          <button class="tu-btn ghost" :disabled="!people.length && !wins.length" @click="clearAll">清除全部</button>
        </div>
        <p class="tu-hint" style="margin-top: 6px">
          共 <strong>{{ people.length }}</strong> 人 ·
          候选 <strong>{{ pool.length }}</strong> 人 ·
          已中奖 <strong>{{ wins.length }}</strong> 人
        </p>
      </div>

      <div class="tu-field">
        <label class="tu-label">奖项（点击选中，再点右侧「开始抽奖」）</label>
        <div class="lot-awards">
          <button
            v-for="a in awards"
            :key="a.id"
            class="lot-award"
            :class="{ 'is-on': a.id === activeAwardId }"
            @click="activeAwardId = a.id"
          >
            <span class="lot-award-name">{{ a.name }}</span>
            <span class="lot-award-num">
              {{ wins.filter(w => w.awardId === a.id).length }}/{{ a.count }}
            </span>
          </button>
        </div>
      </div>

      <div class="tu-field">
        <button class="tu-btn" :disabled="rolling || !people.length" @click="startDraw">
          {{ rolling ? '抽奖中…' : `开始抽奖（${activeAward?.name || ''}）` }}
        </button>
        <p v-if="activeAwardDone" class="tu-hint">该奖项已抽满，可切换其它奖项。</p>
        <p v-else-if="!pool.length && people.length" class="tu-hint">候选池已空，所有人均已中奖。</p>
      </div>

      <div v-if="wins.length" class="tu-field">
        <label class="tu-label">中奖记录</label>
        <div class="tu-row" style="margin-bottom: 6px">
          <button class="tu-btn ghost" @click="exportRecords">导出 Excel</button>
        </div>
        <div v-for="a in awards" :key="a.id" class="lot-wins">
          <template v-if="(winMap.get(a.id) || []).length">
            <div class="lot-wins-title">{{ a.name }}</div>
            <ul class="lot-wins-list">
              <li v-for="w in winMap.get(a.id)" :key="w.id" class="lot-win-item">
                <span class="lot-win-text">
                  {{ w.seq }}. {{ w.name }}<template v-if="w.dept">（{{ w.dept }}）</template>
                  <span class="lot-wins-time">{{ fmtTime(w.ts) }}</span>
                </span>
                <button
                  type="button"
                  class="lot-del"
                  :data-testid="`lot-del-${w.id}`"
                  title="删除该条记录，该人回到候选池可重新抽取"
                  @click="removeWin(w)"
                >删除</button>
              </li>
            </ul>
          </template>
        </div>
      </div>
    </div>

    <!-- 右：大屏展示区 -->
    <div class="tu-t1">
      <div class="lot-stage" :class="{ 'is-rolling': rolling, 'is-won': justWon }">
        <div class="lot-stage-label">{{ activeAward?.name || '抽奖' }}</div>
        <div class="lot-stage-name" data-testid="lot-display-name">{{ displayName || '待开奖' }}</div>
        <div v-if="displayDept" class="lot-stage-dept">{{ displayDept }}</div>
        <div class="lot-stage-hint">
          <template v-if="rolling">正在抽取…</template>
          <template v-else-if="justWon">恭喜中奖！</template>
          <template v-else>点击「开始抽奖」开始</template>
        </div>
      </div>
      <p class="tu-hint" style="margin-top: 10px; text-align: center">
        投屏：点击工具面板右上角的<b>「全屏展示」</b>按钮铺满视口，字号自动放大。
      </p>
    </div>
  </div>
</template>

<style scoped>
/* 奖项按钮组 */
.lot-awards { display: flex; flex-wrap: wrap; gap: 8px; }
.lot-award {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--motion-duration) var(--motion-ease);
}
.lot-award.is-on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.lot-award-num { color: var(--color-text-muted); font-size: 12px; }
.lot-award.is-on .lot-award-num { color: var(--color-primary); }

/* 中奖记录 */
.lot-wins + .lot-wins { margin-top: 10px; }
.lot-wins-title { font-size: 13px; color: var(--color-text-secondary); margin-bottom: 2px; }
.lot-wins-time { color: var(--color-text-muted); font-size: 12px; margin-left: 6px; }
/* 自己定义列表样式：不用 <ol> 原生编号（会与手写 seq 撞成「1. 1.」双序号） */
.lot-wins-list { margin: 0; padding: 0; list-style: none; font-size: 12.5px; line-height: 1.9; }
.lot-win-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.lot-del {
  flex: 0 0 auto;
  border: none;
  background: none;
  padding: 1px 6px;
  border-radius: 4px;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity var(--motion-duration) var(--motion-ease);
}
.lot-del:hover {
  opacity: 1;
  color: var(--color-error);
  background: var(--color-error-soft);
}

/* 大屏展示区：字号偏大，投屏时可读 */
.lot-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 320px;
  padding: 28px 20px;
  text-align: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);
}
.lot-stage-label {
  font-size: clamp(15px, 2vw, 20px);
  color: var(--color-text-secondary);
}
.lot-stage-name {
  font-size: clamp(34px, 9vw, 84px);
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-text);
  word-break: break-all;
}
.lot-stage.is-rolling .lot-stage-name {
  color: var(--color-text-secondary);
  /* 滚动时轻微抖动，营造抽奖动效 */
  animation: lot-jitter 0.12s linear infinite;
}
.lot-stage.is-won .lot-stage-name {
  color: var(--color-primary);
  animation: lot-pop 0.5s var(--motion-ease);
}
.lot-stage-dept { font-size: clamp(15px, 2.4vw, 24px); color: var(--color-text-secondary); }
.lot-stage-hint { font-size: 13px; color: var(--color-text-muted); }

@keyframes lot-jitter {
  0% { transform: translateY(0); }
  50% { transform: translateY(-2px); }
  100% { transform: translateY(0); }
}
@keyframes lot-pop {
  0% { transform: scale(0.9); }
  60% { transform: scale(1.06); }
  100% { transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .lot-stage.is-rolling .lot-stage-name,
  .lot-stage.is-won .lot-stage-name { animation: none; }
}
</style>

<script setup lang="ts">
/**
 * 乘法表（大九九 19×19 + 小九九 9×9 对照）
 *
 * 设计要点：
 * - 默认渲染完整 19×19 大九九方阵（361 个算式）；
 * - **小九九区（1–9 的下三角，共 45 格）用底色区分**，即实际背诵范围；
 * - **主对角线 1×1…19×19 再深一档**；
 * - 悬停/点击某格时高亮整行整列，便于观察「交换律」对称关系；
 * - 三种显示：只显示积（默认，361 格也读得清）/ 算式 / 口诀；
 * - 导出：Excel（.xlsx，走项目通用 exportXlsx）、CSV、复制；打印（新窗口独立文档）。
 */
import { computed, ref } from 'vue'
import {
  MULT_MAX,
  SMALL_MAX,
  buildExercises,
  buildMulTable,
  cellText,
  chantText,
  countAll,
  countSmall,
  exerciseSheet,
  exerciseText,
  hasChant,
  printDocument,
  tableHeader,
  tableTsv,
  type ExerciseOptions,
  type MulCell,
  type MulView
} from '../../core/multiplication'
import { useToast } from '@/composables/useToast'
import { exportXlsx } from '@/composables/xlsxExport'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuOutput from '../../components/tool/TuOutput.vue'

const view = ref<MulView>('value')
const onlySmall = ref(false)
/** 悬停（或点击固定的）格，用于整行整列高亮 */
const hover = ref<{ row: number; col: number } | null>(null)
const pinned = ref<{ row: number; col: number } | null>(null)
const focus = computed(() => hover.value || pinned.value)

useDirtyFlag(() => onlySmall.value || view.value !== 'value')
const toast = useToast()
const { copy, save } = useToolActions()

const header = tableHeader(MULT_MAX)
const table = buildMulTable(MULT_MAX)
/** 可见格：默认 361 格大九九；onlySmall 时仅小九九 45 格 */
const rows = computed<(MulCell | null)[][]>(() =>
  table.map(cells => cells.map(c => (onlySmall.value && !c.small ? null : c)))
)

/** 是否落在高亮行/列上 */
function onLine(c: MulCell): boolean {
  return !!focus.value && (focus.value.row === c.row || focus.value.col === c.col)
}

function onEnter(c: MulCell): void {
  hover.value = { row: c.row, col: c.col }
}
function onLeave(): void {
  hover.value = null
}
function onPick(c: MulCell): void {
  const same = pinned.value && pinned.value.row === c.row && pinned.value.col === c.col
  pinned.value = same ? null : { row: c.row, col: c.col }
}

/** 当前格的同值对称格（交换律：row×col ↔ col×row），主对角线无对称格 */
const mirror = computed(() => {
  const f = focus.value
  if (!f || f.row === f.col) return null
  return { row: f.col, col: f.row }
})

/** 导出文本：与当前视图一致，保证「复制」和「看到的一致」 */
const fullText = computed(() => {
  if (view.value === 'chant') return chantText(SMALL_MAX)
  return tableTsv(MULT_MAX, true)
})

const fileName = computed(() => (view.value === 'chant' ? '小九九口诀.txt' : '大九九乘法表.csv'))

function copyAll(): void {
  copy(fullText.value, `已复制${view.value === 'chant' ? '小九九口诀' : '大九九乘法表'}`)
}

/** 练习卷范围：跟随「只看小九九」开关 */
function exOpts(withResult: boolean, shuffle = false): ExerciseOptions {
  return { max: MULT_MAX, onlySmall: onlySmall.value, withResult, shuffle, seed: 20260101 }
}

const exCount = computed(() => buildExercises(exOpts(true)).length)

/** 导出 Excel（.xlsx）：走项目通用封装，自动算列宽 */
async function exportExcel(withResult: boolean): Promise<void> {
  const { headers, rows: data } = exerciseSheet(exOpts(withResult))
  const name = onlySmall.value ? '小九九' : '大九九'
  const prefix = withResult ? `${name}乘法表` : `${name}乘法练习卷`
  try {
    await exportXlsx(prefix, headers, data, { sheetName: name })
    toast.success(`已导出 ${prefix}.xlsx`)
  } catch {
    toast.error('导出失败，请检查浏览器是否拦截了下载')
  }
}

/** 导出练习卷为 CSV（轻量备选，不需要 Excel 时用） */
function downloadCsv(withResult: boolean): void {
  const name = onlySmall.value ? '小九九' : '大九九'
  const prefix = withResult ? `${name}乘法表` : `${name}乘法练习卷`
  save(`${prefix}.csv`, exerciseText(exOpts(withResult)), 'text/csv')
}

/**
 * 打印：在新窗口写入独立打印文档后调window.print()。
 * - 用新窗口而非直接 window.print()：工具在弹框里（position:fixed + z-index 200），
 *   直接打印会把整页框架、遮罩、按钮一起打出来；新窗口文档只含表格与题目，排版可控。
 * - 内联样式见 core/multiplication.ts 的 printDocument()，不受宿主页主题影响。
 */
function printSheet(): void {
  const title = onlySmall.value ? '小九九乘法练习卷' : '大九九乘法练习卷'
  const html = printDocument({
    ...exOpts(false),
    title,
    subtitle: `${onlySmall.value ? '小九九（1–9）' : '大九九（1–19）'} · 共 ${exCount.value} 题 · 答案留空可直接作答`
  })
  const win = window.open('', '_blank')
  if (!win) {
    toast.warning('浏览器拦截了新窗口，请允许弹窗后重试打印')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  // 等待资源与字体就绪再打印，避免首屏未排版完成就出纸
  win.focus()
  const go = (): void => {
    win.print()
    win.close()
  }
  if (win.document.readyState === 'complete') setTimeout(go, 120)
  else win.addEventListener('load', () => setTimeout(go, 120))
}

const smallCount = countSmall(SMALL_MAX)
const allCount = countAll(MULT_MAX)
</script>

<template>
  <div class="tu-t6">
    <div class="tu-toolbar">
      <button
        type="button"
        class="tu-check"
        :class="{ 'is-on': view === 'value' }"
        data-testid="tb-mt-view-value"
        @click="view = 'value'"
      >
        只看积
      </button>
      <button
        type="button"
        class="tu-check"
        :class="{ 'is-on': view === 'formula' }"
        data-testid="tb-mt-view-formula"
        @click="view = 'formula'"
      >
        算式
      </button>
      <button
        type="button"
        class="tu-check"
        :class="{ 'is-on': view === 'chant' }"
        data-testid="tb-mt-view-chant"
        @click="view = 'chant'"
      >
        口诀
      </button>
      <button
        type="button"
        class="tu-check"
        :class="{ 'is-on': onlySmall }"
        data-testid="tb-mt-only-small"
        @click="onlySmall = !onlySmall"
      >
        只看小九九
      </button>
      <span class="tu-spacer" />
      <button type="button" class="tu-btn ghost" @click="copyAll">复制全表</button>
      <button type="button" class="tu-btn" data-testid="tb-mt-print" @click="printSheet">打印练习卷</button>
    </div>

    <div class="tu-stat">
      <span>大九九 {{ allCount }} 个算式（19×19）</span>
      <span>小九九 {{ smallCount }} 个算式（底色标注，背诵范围）</span>
      <span v-if="focus">当前：{{ focus.row }}×{{ focus.col }}={{ focus.row * focus.col }}</span>
    </div>

    <div class="mt-wrap">
      <div class="mt-table" :class="`is-${view}`">
        <div class="mt-row mt-head">
          <div class="mt-corner">×</div>
          <div v-for="c in header" :key="`h${c}`" class="mt-h">{{ c }}</div>
        </div>
        <div v-for="(row, ri) in rows" :key="`r${ri}`" class="mt-row">
          <div
            class="mt-h is-row"
            :class="{ 'is-hl': !!focus && focus.row === ri + 1 }"
          >{{ ri + 1 }}</div>
          <template v-for="c in row" :key="`${ri}-${c ? c.col : 0}`">
            <div
              v-if="c"
              class="mt-cell"
              :class="{
                'is-small': c.small,
                'is-diag': c.diag,
                'is-line': onLine(c),
                'is-mirror': !!mirror && mirror.row === c.row && mirror.col === c.col,
                'is-focus': !!focus && focus.row === c.row && focus.col === c.col,
                'is-nochant': view === 'chant' && !hasChant(c.row, c.col)
              }"
              :title="`${c.row}×${c.col}=${c.value}`"
              data-testid="tb-mt-cell"
              @mouseenter="onEnter(c)"
              @mouseleave="onLeave"
              @click="onPick(c)"
            >{{ cellText(c.row, c.col, view) }}</div>
            <div v-else class="mt-cell is-blank" />
          </template>
        </div>
      </div>
    </div>

    <div class="tu-row">
      <span class="tu-legend"><i class="dot small" />小九九区（1–9 背诵范围）</span>
      <span class="tu-legend"><i class="dot plain" />仅大九九区（交换律补全）</span>
      <span class="tu-legend"><i class="dot diag" />主对角线（平方）</span>
      <span class="tu-legend"><i class="dot mirror" />同值对称格</span>
    </div>

    <section class="mt-export">
      <div class="mt-export-head">
        <h4 class="mt-export-title">导出与打印</h4>
        <span class="mt-export-hint">
          当前范围：{{ onlySmall ? '小九九 1–9' : '大九九 1–19' }} · 共 {{ exCount }} 题
        </span>
      </div>
      <div class="tu-row">
        <button type="button" class="tu-btn" data-testid="tb-mt-xlsx" @click="exportExcel(true)">
          Excel 乘法表（含答案）
        </button>
        <button type="button" class="tu-btn" @click="exportExcel(false)">Excel 练习卷（答案留空）</button>
        <button type="button" class="tu-btn ghost" @click="downloadCsv(true)">CSV 乘法表</button>
        <button type="button" class="tu-btn ghost" @click="downloadCsv(false)">CSV 练习卷</button>
        <button type="button" class="tu-btn ghost" data-testid="tb-mt-print2" @click="printSheet">
          打印练习卷（A4）
        </button>
      </div>
      <p class="mt-export-note">
        练习卷默认<b>答案留空</b>，适合直接打印给孩子做；需要答案时点「含答案」版本。
        打印会打开新窗口（仅含表格与题目，不含页面框架），A4 横向适合大九九、纵向适合小九九。
      </p>
    </section>

    <TuOutput :title="view === 'chant' ? '小九九口诀全文' : '大九九乘法表数据'" :text="fullText" :filename="fileName" empty="—">
      <pre class="mt-pre">{{ fullText }}</pre>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>
            <strong>大九九</strong>为 19×19 的完整方阵共 361 个算式（江南一带传统的「十九乘十九表」）；
            <strong>小九九</strong>是其中 1–9 的下三角共 45 个算式，即目前小学实际背诵与默写的范围，故用底色区分。
          </li>
          <li>因等式可交换，19×19 中有 171 组等价算式，实际需要记忆的仍只是小九九那 45 个。</li>
          <li>鼠标悬停某格会高亮整行整列，并标出交换律的同值对称格；点击可固定高亮。</li>
          <li>
            「口诀」模式按教材读法：积为一位数加「得」（二三得六），两位数直接连读（三四十二）；
            因口诀只到 9×9，超出范围的格子自动回落为显示积。
          </li>
          <li>「只看小九九」隐藏小九九以外的 316 格，便于单独打印背诵用表；导出与打印的范围跟随此开关。</li>
          <li>
            导出 Excel 走项目通用封装（<code>.xlsx</code>，自动列宽）；练习卷版本结果列留空，可直接当口算题打印。
          </li>
          <li>
            打印在新窗口生成独立文档：含乘法表 + 口算题清单 + 姓名/日期/用时/得分栏，样式内联，
            不受系统深色主题影响。
          </li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.mt-wrap { overflow-x: auto; padding-bottom: 2px; }
.mt-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: max-content;
  min-width: 100%;
}
.mt-row { display: grid; grid-template-columns: 28px repeat(19, minmax(30px, 1fr)); gap: 2px; }
.mt-h {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg-hover);
  border-radius: var(--radius-sm);
}
.mt-head .mt-h { color: var(--color-primary); background: var(--color-primary-soft); }
.mt-h.is-row.is-hl { color: var(--color-primary); background: var(--color-primary-soft); }
.mt-corner {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-muted);
}
.mt-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  padding: 2px 3px;
  font-size: 11.5px;
  color: var(--color-text-secondary);
  text-align: center;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background-color 0.12s, color 0.12s, border-color 0.12s;
}
/* 小九九区：1–9 的下三角含主对角线，底色区分 */
.mt-cell.is-small {
  color: var(--color-text);
  background: var(--color-primary-soft);
  border-color: var(--color-primary-soft);
}
/* 主对角线（平方）：独立底色，从小九九区里再分一层 */
.mt-cell.is-diag {
  font-weight: 600;
  color: var(--color-primary-700);
  background: var(--color-primary-200);
  border-color: var(--color-primary-300);
}
html.dark .mt-cell.is-diag {
  color: var(--color-primary-100);
  background: rgba(59, 130, 246, 0.34);
  border-color: var(--color-primary-400);
}
.mt-cell.is-blank { background: transparent; border-color: transparent; cursor: default; }
.mt-cell.is-line { border-color: var(--color-primary); }
.mt-cell.is-mirror { color: var(--color-primary); border-color: var(--color-primary); }
.mt-cell.is-focus {
  color: var(--color-primary);
  background: var(--color-primary);
  border-color: var(--color-primary);
  font-weight: 600;
}
.mt-cell.is-focus.is-small { color: #fff; }
/* 口诀模式下超范围（>9×9）的格子回落为积，压暗以示「无口诀」 */
.mt-cell.is-nochant { opacity: 0.55; }
/* 算式模式需要更宽的格 */
.mt-table.is-formula .mt-cell { font-size: 11px; letter-spacing: -0.2px; }
.mt-table.is-formula .mt-row { grid-template-columns: 28px repeat(19, minmax(52px, 1fr)); }
.mt-table.is-chant .mt-row { grid-template-columns: 28px repeat(19, minmax(48px, 1fr)); }
.mt-table.is-chant .mt-cell { font-size: 12px; letter-spacing: 0.5px; }
.mt-pre {
  margin: 0;
  max-height: 220px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre;
}
.mt-export {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}
.mt-export-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.mt-export-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--color-text); }
.mt-export-hint { font-size: 11.5px; color: var(--color-text-muted); }
.mt-export-note { margin: 0; font-size: 11.5px; line-height: 1.7; color: var(--color-text-secondary); }
.mt-export-note b { color: var(--color-text); }
.tu-legend { display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; color: var(--color-text-secondary); }
.dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; border: 1px solid var(--color-border); }
.dot.small { background: var(--color-primary-soft); border-color: var(--color-primary-soft); }
.dot.plain { background: var(--color-bg-card); }
.dot.diag { background: var(--color-primary-200); border-color: var(--color-primary-300); }
.dot.mirror { background: var(--color-bg-card); border-color: var(--color-primary); }
html.dark .dot.diag { background: rgba(59, 130, 246, 0.34); border-color: var(--color-primary-400); }
@media (max-width: 480px) {
  .mt-cell { font-size: 10px; padding: 1px 2px; }
  .mt-row { grid-template-columns: 24px repeat(19, minmax(26px, 1fr)); }
}
</style>
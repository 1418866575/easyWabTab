// xlsxExport.ts 纯函数测试（文件名 / 工作表名清洗 / 显示宽度 / 列宽；npm run test:xlsx）
// 结构镜像 scripts/test-panel-paging-core.ts（node:assert/strict Proxy 计数 + test 注册表 + 汇总退出码）
// 说明：exportXlsx 依赖 DOM 与动态 import('xlsx')，不在此测试；这里只覆盖零依赖的纯函数。
import assert from 'node:assert/strict'
import { colWidths, displayWidth, safeSheetName, xlsxFileName } from '../src/composables/xlsxExport.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

let assertCount = 0
const a: typeof assert = new Proxy(assert, {
  get(t, prop) {
    const v = Reflect.get(t, prop)
    if (typeof v === 'function') {
      return (...args: unknown[]) => {
        assertCount++
        return (v as (...x: unknown[]) => unknown).apply(t, args)
      }
    }
    return v
  }
})

// T1 — 文件名：prefix_YYYY-MM-DD.xlsx（日期取当天，正则校验形状）
test('T1 xlsxFileName 形状', () => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const expect = `收摊记录_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.xlsx`
  a.equal(xlsxFileName('收摊记录'), expect)
  a.match(xlsxFileName('库存总览'), /^库存总览_\d{4}-\d{2}-\d{2}\.xlsx$/)
  a.match(xlsxFileName('2026年月度报表'), /_\d{4}-\d{2}-\d{2}\.xlsx$/)
})

// T2 — 工作表名清洗：非法字符、长度、空串回退
test('T2 safeSheetName 清洗', () => {
  a.equal(safeSheetName('收摊记录'), '收摊记录')
  a.equal(safeSheetName('应收实收对账-2026'), '应收实收对账-2026')
  a.equal(safeSheetName('a\\b/c?d*e[f]:g'), 'abcdefg')
  a.equal(safeSheetName('一二三四五六七八九十'.repeat(5)), '一二三四五六七八九十'.repeat(4).slice(0, 31))
  a.equal(safeSheetName('一二三四五六七八九十'.repeat(5)).length, 31)
  a.equal(safeSheetName(''), 'Sheet1')
  a.equal(safeSheetName('   '), 'Sheet1')
  a.equal(safeSheetName('***'), 'Sheet1')
})

// T3 — 显示宽度：中文/全角按 2 计，空值 0，数字按字符数
test('T3 displayWidth 计宽', () => {
  a.equal(displayWidth('日期'), 4)
  a.equal(displayWidth('abc'), 3)
  a.equal(displayWidth('营业额'), 6)
  a.equal(displayWidth(null), 0)
  a.equal(displayWidth(undefined), 0)
  a.equal(displayWidth(''), 0)
  a.equal(displayWidth(12.5), 4)
  a.equal(displayWidth('12.00'), 5)
})

// T4 — 列宽：表头与数据取最大值，钳制 8~30（含 +2 余量）
test('T4 colWidths 自适应与钳制', () => {
  const headers = ['日期', '商品', '备注']
  const rows = [['2026-09-28', '烤肠', '早市补货'], ['2026-09-29', '冰粉', '']]
  const w = colWidths(headers, rows)
  a.equal(w.length, 3)
  // 日期列：'2026-09-28' 10 → 12；商品列：表头 4 与 '烤肠' 4 → 6 → 钳到 8；备注列：'早市补货' 8 → 10
  a.equal(w[0], 12)
  a.equal(w[1], 8)
  a.equal(w[2], 10)
})

// T5 — 列宽钳制边界：超长文本封顶 30，全空列取最小 8
test('T5 colWidths 边界', () => {
  const long = '超长备注'.repeat(20)
  const w = colWidths(['备注'], [[long], ['']])
  a.equal(w[0], 30)
  a.equal(colWidths(['', ''], [['', '']])[0], 8)
  a.equal(colWidths([], []).length, 0)
})

let passed = 0
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    passed++
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${t.name}`)
    console.error(e)
  }
}
if (failed > 0) {
  console.error(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 1`)
  process.exitCode = 1
} else {
  console.log(`\n${passed}/${tests.length} passed, ${assertCount} assertions, exit 0`)
}

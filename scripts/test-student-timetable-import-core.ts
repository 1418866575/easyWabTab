import assert from "node:assert/strict"
import {
  TEMPLATE_HEADERS, REQUIRED_HEADERS, TEMPLATE_INSTRUCTIONS, TEMPLATE_SAMPLE_ROWS,
  mapHeaders, parseWeekday, parsePeriod, normalizeWeekRange,
  validateImportRows, buildImportErrorCsv, importSummaryText,
  type ImportRawRow
} from "../src/composables/studentTimetableImportCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

/** 按模板列顺序把对象转成 values 数组 */
function row(day, period, subject, extra = {}) {
  const o = { 课程名称: subject, 授课教师: "", 上课星期: day, 节次: period, 起始周: "", 结束周: "", 教室: "", 班级: "", ...extra }
  return TEMPLATE_HEADERS.map(h => o[h])
}

function rowsWithIndex(list) {
  const headers = mapHeaders(TEMPLATE_HEADERS)
  return { headers, rows: list.map((values, i) => ({ row: i + 2, values })) }
}

const CTX = { periodsPerDay: 7, weeks: 20, timing: undefined, existing: {} }

test("T1 模板表头：含全部必填列 + 说明/示例非空", () => {
  for (const h of REQUIRED_HEADERS) assert.ok(TEMPLATE_HEADERS.includes(h), "缺必填列 " + h)
  assert.equal(TEMPLATE_HEADERS.includes("授课教师"), true)
  assert.equal(TEMPLATE_HEADERS.includes("起始周"), true)
  assert.equal(TEMPLATE_HEADERS.includes("结束周"), true)
  assert.equal(TEMPLATE_HEADERS.includes("教室"), true)
  assert.equal(TEMPLATE_HEADERS.includes("班级"), true)
  assert.ok(TEMPLATE_INSTRUCTIONS.length >= 8)
  assert.ok(TEMPLATE_SAMPLE_ROWS.length >= 3)
  // 示例数据列数应与表头一致
  for (const r of TEMPLATE_SAMPLE_ROWS) assert.equal(r.length, TEMPLATE_HEADERS.length)
})

test("T2 mapHeaders：齐全无缺失 + 缺必填列能识别", () => {
  const full = mapHeaders(TEMPLATE_HEADERS)
  assert.deepEqual(full.missing, [])
  assert.equal(full.index["课程名称"], 0)
  assert.equal(full.index["节次"], 3)
  const lack = mapHeaders(["课程名称", "教师"])
  assert.deepEqual(lack.missing.slice().sort(), ["上课星期", "节次"].sort())
  // 必填列带 * 标记时仍要能识别（模板下载出来就是带 * 的）
  const marked = mapHeaders(TEMPLATE_HEADERS.map(h => REQUIRED_HEADERS.includes(h) ? h + "*" : h))
  assert.deepEqual(marked.missing, [])
  assert.equal(marked.index["课程名称"], 0)
  // 列名里混入空格 / 全角空格也能识别
  const spaced = mapHeaders(TEMPLATE_HEADERS.map(h => Array.from(h).join(" ") + "　"))
  assert.deepEqual(spaced.missing, [])
  assert.equal(spaced.index["节次"], 3)
})

test("T3 parseWeekday：数字 / 周一…周日 / 星期三 / 非法", () => {
  for (let d = 1; d <= 7; d++) assert.equal(parseWeekday(d), d)
  assert.equal(parseWeekday("1"), 1)
  assert.equal(parseWeekday("7"), 7)
  assert.equal(parseWeekday("周一"), 1)
  assert.equal(parseWeekday("周日"), 7)
  assert.equal(parseWeekday("星期三"), 3)
  assert.equal(parseWeekday("星期五"), 5)
  assert.equal(parseWeekday("0"), 0)
  assert.equal(parseWeekday("8"), 0)
  assert.equal(parseWeekday(""), 0)
  assert.equal(parseWeekday("星期八"), 0)
  assert.equal(parseWeekday(undefined), 0)
})

test("T4 parsePeriod：1-12 合法，其余非法", () => {
  assert.equal(parsePeriod(1), 1)
  assert.equal(parsePeriod(12), 12)
  assert.equal(parsePeriod("3"), 3)
  assert.equal(parsePeriod(0), 0)
  assert.equal(parsePeriod(13), 0)
  assert.equal(parsePeriod(-1), 0)
  assert.equal(parsePeriod("abc"), 0)
  assert.equal(parsePeriod(""), 0)
})

test("T5 normalizeWeekRange：缺省 1..weeks；越界/倒序返回 null", () => {
  assert.deepEqual(normalizeWeekRange("", "", 20), { startWeek: 1, endWeek: 20 })
  assert.deepEqual(normalizeWeekRange(3, 8, 20), { startWeek: 3, endWeek: 8 })
  assert.deepEqual(normalizeWeekRange("2", "10", 20), { startWeek: 2, endWeek: 10 })
  assert.equal(normalizeWeekRange(0, 5, 20), null)   // 起始周 < 1
  assert.equal(normalizeWeekRange(1, 21, 20), null)  // 结束周 > 总周数
  assert.equal(normalizeWeekRange(9, 5, 20), null)   // 起始 > 结束
  assert.equal(normalizeWeekRange("x", "y", 20), null)
})

test("T6 validateImportRows 正常：产出 cell + 时间按节次配置推算 + 周次缺省", () => {
  const { headers, rows } = rowsWithIndex([row("周一", 1, "语文", { 授课教师: "王老师", 教室: "301" })])
  const r = validateImportRows(rows, headers, CTX)
  assert.equal(r.total, 1)
  assert.equal(r.success, 1)
  assert.equal(r.created, 1)
  assert.equal(r.updated, 0)
  assert.equal(r.failed, 0)
  const cell = r.cells["1_1"]
  assert.equal(cell.subject, "语文")
  assert.equal(cell.teacher, "王老师")
  assert.equal(cell.room, "301")
  // 默认配置：第 1 节 08:00-08:45
  assert.equal(cell.startHHMM, "08:00")
  assert.equal(cell.endHHMM, "08:45")
  assert.equal(cell.startWeek, 1)
  assert.equal(cell.endWeek, 20)
})

test("T7 节次超出当前每日节数 → 失败并给出可理解原因", () => {
  const { headers, rows } = rowsWithIndex([row("周一", 9, "体育")])
  const r = validateImportRows(rows, headers, CTX)
  assert.equal(r.success, 0)
  assert.equal(r.failed, 1)
  assert.match(r.errors[0].reason, /超出当前每日节数 7/)
  assert.equal(r.errors[0].row, 2)
})

test("T8 文件内重复：同一星期+节次两行 → 第二行失败并指出首行行号", () => {
  const { headers, rows } = rowsWithIndex([row("周一", 1, "语文"), row("周一", 1, "数学")])
  const r = validateImportRows(rows, headers, CTX)
  assert.equal(r.success, 1)
  assert.equal(r.failed, 1)
  assert.equal(r.errors[0].row, 3)
  assert.match(r.errors[0].reason, /与第 2 行重复/)
})

test("T9 星期写法不同但指向同一格 → 判重复；同教师跨天同节次不算冲突", () => {
  // 「周一」与数字 1 等价，两行占同一格 → 第二行重复
  const diffFmt = rowsWithIndex([
    row("周一", 1, "语文", { 授课教师: "王老师" }),
    row(1, 1, "数学", { 授课教师: "王老师" })
  ])
  const r = validateImportRows(diffFmt.rows, diffFmt.headers, CTX)
  assert.equal(r.success, 1)
  assert.equal(r.failed, 1)
  assert.match(r.errors[0].reason, /与第 2 行重复/)
  // 同一教师在不同天同一节次：时间不同，不算冲突
  const crossDay = rowsWithIndex([
    row("周一", 1, "语文", { 授课教师: "王老师" }),
    row("周二", 1, "数学", { 授课教师: "王老师" })
  ])
  const r2 = validateImportRows(crossDay.rows, crossDay.headers, CTX)
  assert.equal(r2.success, 2)
  assert.equal(r2.failed, 0)
})

test("T10 必填缺失：课程名称空 / 星期非法 / 节次非法 均失败", () => {
  const { headers, rows } = rowsWithIndex([
    row("周一", 1, ""),        // 空课程名
    row("星期八", 2, "数学"),   // 星期非法
    row("周一", 0, "英语")      // 节次非法
  ])
  const r = validateImportRows(rows, headers, CTX)
  assert.equal(r.failed, 3)
  assert.equal(r.success, 0)
  assert.match(r.errors[0].reason, /课程名称为空/)
  assert.match(r.errors[1].reason, /上课星期无效/)
  assert.match(r.errors[2].reason, /节次无效/)
})

test("T11 周次越界 → 失败", () => {
  const { headers, rows } = rowsWithIndex([row("周一", 1, "语文", { 起始周: 5, 结束周: 30 })])
  const r = validateImportRows(rows, headers, { ...CTX, weeks: 20 })
  assert.equal(r.failed, 1)
  assert.match(r.errors[0].reason, /周次范围无效/)
})

test("T12 已有课程 → 计入覆盖（updated）", () => {
  const { headers, rows } = rowsWithIndex([row("周一", 1, "语文"), row("周二", 2, "数学")])
  const existing = { "1_1": { subject: "旧课", startHHMM: "08:00", endHHMM: "08:45" } }
  const r = validateImportRows(rows, headers, { ...CTX, existing })
  assert.equal(r.created, 1)
  assert.equal(r.updated, 1)
  assert.equal(r.success, 2)
})

test("T13 buildImportErrorCsv 含行号 / 课程 / 原因", () => {
  const { headers, rows } = rowsWithIndex([row("周一", 1, ""), row("周一", 99, "数学")])
  const r = validateImportRows(rows, headers, CTX)
  const csv = buildImportErrorCsv(r.errors)
  assert.match(csv, /Excel 行号/)
  assert.match(csv, /课程名称为空/)
  assert.ok(csv.includes("2,") || csv.includes("2\r") || csv.includes(",2,"), "csv 应含行号 2")
})

test("T14 importSummaryText：全成功 / 部分失败 / 空数据", () => {
  const { headers, rows } = rowsWithIndex([row("周一", 1, "语文"), row("周一", 1, "数学")])
  const r = validateImportRows(rows, headers, CTX)
  assert.match(importSummaryText(r), /成功 1/)
  assert.match(importSummaryText(r), /失败 1/)
  const ok = validateImportRows(rowsWithIndex([row("周一", 1, "语文")]).rows, headers, CTX)
  assert.match(importSummaryText(ok), /新增 1 条/)
  assert.equal(importSummaryText({ total: 0, success: 0, created: 0, updated: 0, failed: 0, cells: {}, errors: [] }), "未解析到数据行")
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log(`  OK ${t.name}`) }
  catch (e) { f++; console.error(`  FAIL ${t.name}`); console.error(e) }
}
console.log(`\n${p}/${tests.length} passed`)
if (f > 0) process.exit(1)

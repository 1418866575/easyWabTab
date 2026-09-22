import assert from "node:assert/strict"
import {
  GOAL_ID_PREFIX,
  emptyGoalData, normalizeGoal, normalizeGoalData,
  deriveGoalStatus, calcGoalProgress, calcGoalStats,
  sortGoals, filterBySubject, filterByStatus,
  validateGoalInput, makeGoal
} from "../src/composables/studentGoalCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 emptyGoalData", () => {
  assert.deepEqual(emptyGoalData(), { entries: [] })
})

test("T2 normalizeGoal 非对象/无名/空名 → null", () => {
  assert.equal(normalizeGoal(null), null)
  assert.equal(normalizeGoal({}), null)
  assert.equal(normalizeGoal({ name: "   " }), null)
})

test("T3 normalizeGoal 兜底默认值", () => {
  const g = normalizeGoal({ name: "数学 90 分" })
  assert.equal(g.id.startsWith(GOAL_ID_PREFIX), true)
  assert.equal(g.goalType, "score")          // 缺省 score
  assert.equal(g.subject, "其他")            // 缺省 其他
  assert.equal(g.targetValue, 0)             // 缺省 0
  assert.equal(g.currentValue, 0)
  assert.equal(g.unit, "")
  assert.equal(g.status, "active")           // 缺省 active
  assert.ok(g.createdAt && g.updatedAt)
  assert.equal(g.deadline, undefined)
  assert.equal(g.note, undefined)
})

test("T4 normalizeGoal 数值钳 0-1e6 + 字段截断", () => {
  const g = normalizeGoal({ name: "x".repeat(80), subject: "  语文  ", goalType: "count", targetValue: 1.9, currentValue: -5, unit: " ".repeat(3) + "个".repeat(20), status: "weird" })
  assert.equal(g.name.length, 50)            // 截断 50
  assert.equal(g.subject, "语文")            // trim + 不截断（<20）
  assert.equal(g.goalType, "count")
  assert.equal(g.targetValue, 1)             // floor(1.9)=1
  assert.equal(g.currentValue, 0)            // 负数 → 0
  assert.equal(g.unit, "个".repeat(10))      // 单位截断 10
  assert.equal(g.status, "active")           // 非法 status → active
})

test("T5 normalizeGoal 保留合法 id/deadline/note + status", () => {
  const g = normalizeGoal({ id: "gl_fixed", name: "目标", goalType: "days", targetValue: 30, currentValue: 10, deadline: "2026-12-31", note: " 加油 ", status: "completed" })
  assert.equal(g.id, "gl_fixed")
  assert.equal(g.deadline, "2026-12-31")
  assert.equal(g.note, "加油")
  assert.equal(g.status, "completed")
})

test("T6 normalizeGoalData 裸数组 + 对象 + 非法 → empty", () => {
  const it = { name: "X", targetValue: 1, currentValue: 0 }
  assert.equal(normalizeGoalData([it]).entries.length, 1)
  assert.equal(normalizeGoalData({ entries: [it] }).entries.length, 1)
  assert.equal(normalizeGoalData({ entries: [{ name: "" }] }).entries.length, 0) // 非法条目被过滤
  assert.deepEqual(normalizeGoalData(""), emptyGoalData())
  assert.deepEqual(normalizeGoalData(null), emptyGoalData())
})

test("T7 deriveGoalStatus 透传 completed/abandoned", () => {
  const base = { name: "a", subject: "s", goalType: "score", targetValue: 100, currentValue: 50, status: "completed", createdAt: "", updatedAt: "" } as any
  assert.equal(deriveGoalStatus(base, "2026-01-01"), "completed")
  assert.equal(deriveGoalStatus({ ...base, status: "abandoned" }, "2026-01-01"), "abandoned")
})

test("T8 deriveGoalStatus 当前≥目标且目标>0 → completed", () => {
  const g = { name: "a", subject: "s", goalType: "count", targetValue: 10, currentValue: 10, status: "active", createdAt: "", updatedAt: "" } as any
  assert.equal(deriveGoalStatus(g, "2026-01-01"), "completed")
  const g2 = { ...g, currentValue: 20 }
  assert.equal(deriveGoalStatus(g2, "2026-01-01"), "completed")
})

test("T9 deriveGoalStatus 截止<今日 → overdue（active 前提）", () => {
  const g = { name: "a", subject: "s", goalType: "score", targetValue: 100, currentValue: 10, status: "active", deadline: "2026-01-01", createdAt: "", updatedAt: "" } as any
  assert.equal(deriveGoalStatus(g, "2026-02-01"), "overdue")
  // 截止今日（>=今日）不算逾期
  assert.equal(deriveGoalStatus(g, "2026-01-01"), "active")
  // 截止未来不逾期
  assert.equal(deriveGoalStatus({ ...g, deadline: "2026-03-01" }, "2026-02-01"), "active")
})

test("T10 calcGoalProgress 目标<=0→0 / 比例四舍五入 / 钳 100", () => {
  assert.equal(calcGoalProgress({ targetValue: 0, currentValue: 5 } as any), 0)
  assert.equal(calcGoalProgress({ targetValue: 3, currentValue: 1 } as any), 33)  // 33.3 -> 33
  assert.equal(calcGoalProgress({ targetValue: 3, currentValue: 2 } as any), 67)  // 66.7 -> 67
  assert.equal(calcGoalProgress({ targetValue: 10, currentValue: 10 } as any), 100)
  assert.equal(calcGoalProgress({ targetValue: 10, currentValue: 99 } as any), 100) // 钳顶
})

test("T11 calcGoalStats 空 + 混合", () => {
  assert.deepEqual(calcGoalStats([], "2026-06-01"), { total: 0, active: 0, completed: 0, overdue: 0 })
  const list = [
    { name: "a", subject: "s", goalType: "score", targetValue: 10, currentValue: 5, status: "active", deadline: "2026-05-01", createdAt: "", updatedAt: "" }, // overdue
    { name: "b", subject: "s", goalType: "score", targetValue: 10, currentValue: 10, status: "active", createdAt: "", updatedAt: "" }, // completed
    { name: "c", subject: "s", goalType: "score", targetValue: 10, currentValue: 3, status: "active", deadline: "2026-07-01", createdAt: "", updatedAt: "" }, // active
    { name: "d", subject: "s", goalType: "score", targetValue: 10, currentValue: 0, status: "abandoned", createdAt: "", updatedAt: "" }, // abandoned（不计入 active/overdue/completed）
  ] as any
  const s = calcGoalStats(list, "2026-06-01")
  assert.equal(s.total, 4)
  assert.equal(s.active, 1)
  assert.equal(s.completed, 1)
  assert.equal(s.overdue, 1)
})

test("T12 sortGoals updatedAt 降 → createdAt 降", () => {
  const list = [
    { id: "a", name: "", subject: "", goalType: "score", targetValue: 0, currentValue: 0, status: "active", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-05T00:00:00Z" },
    { id: "b", name: "", subject: "", goalType: "score", targetValue: 0, currentValue: 0, status: "active", createdAt: "2026-03-01T00:00:00Z", updatedAt: "2026-01-05T00:00:00Z" },
    { id: "c", name: "", subject: "", goalType: "score", targetValue: 0, currentValue: 0, status: "active", createdAt: "2026-02-01T00:00:00Z", updatedAt: "2026-01-10T00:00:00Z" },
  ] as any
  const sorted = sortGoals(list)
  assert.equal(sorted[0].id, "c") // updatedAt 最新
  assert.equal(sorted[1].id, "b") // updatedAt 同，createdAt 更新（b>a）
  assert.equal(sorted[2].id, "a")
})

test("T13 filterBySubject all + 指定学科", () => {
  const list = [
    { name: "", subject: "数学", goalType: "score", targetValue: 0, currentValue: 0, status: "active", createdAt: "", updatedAt: "" },
    { name: "", subject: "语文", goalType: "score", targetValue: 0, currentValue: 0, status: "active", createdAt: "", updatedAt: "" },
  ] as any
  assert.equal(filterBySubject(list, "all").length, 2)
  assert.equal(filterBySubject(list, "数学").length, 1)
  assert.equal(filterBySubject(list, "数学")[0].subject, "数学")
})

test("T14 filterByStatus all/active/completed/overdue", () => {
  const today = "2026-06-01"
  const list = [
    { name: "", subject: "s", goalType: "score", targetValue: 10, currentValue: 5, status: "active", deadline: "2026-05-01", createdAt: "", updatedAt: "" }, // overdue
    { name: "", subject: "s", goalType: "score", targetValue: 10, currentValue: 10, status: "active", createdAt: "", updatedAt: "" }, // completed
    { name: "", subject: "s", goalType: "score", targetValue: 10, currentValue: 3, status: "active", deadline: "2026-07-01", createdAt: "", updatedAt: "" }, // active
  ] as any
  assert.equal(filterByStatus(list, "all", today).length, 3)
  assert.equal(filterByStatus(list, "active", today).length, 1)
  assert.equal(filterByStatus(list, "completed", today).length, 1)
  assert.equal(filterByStatus(list, "overdue", today).length, 1)
})

test("T15 validateGoalInput empty/invalid-number/deadline-past/null", () => {
  assert.equal(validateGoalInput({ name: "  ", targetValue: 10, currentValue: 0 }), "empty")
  assert.equal(validateGoalInput({ name: "x", targetValue: -1, currentValue: 0 }), "invalid-number")
  assert.equal(validateGoalInput({ name: "x", targetValue: NaN, currentValue: 0 }), "invalid-number")
  assert.equal(validateGoalInput({ name: "x", targetValue: 10, currentValue: -1 }), "invalid-number")
  assert.equal(validateGoalInput({ name: "x", targetValue: 10, currentValue: 0, deadline: "2026-01-01", today: "2026-02-01" }), "deadline-past")
  assert.equal(validateGoalInput({ name: "x", targetValue: 10, currentValue: 0 }), null)
  assert.equal(validateGoalInput({ name: "x", targetValue: 10, currentValue: 0, deadline: "2026-07-01", today: "2026-02-01" }), null)
})

test("T16 makeGoal 构造归一化目标", () => {
  const g = makeGoal({ name: " 数学 90 分 ", subject: " 数学 ", goalType: "score", targetValue: 90, currentValue: 0, unit: " 分 ", deadline: "2026-12-31", note: " 冲 " }, "2026-06-01")
  assert.equal(g.id.startsWith(GOAL_ID_PREFIX), true)
  assert.equal(g.name, "数学 90 分")
  assert.equal(g.subject, "数学")
  assert.equal(g.unit, "分")
  assert.equal(g.note, "冲")
  assert.equal(g.status, "active")
  assert.equal(g.deadline, "2026-12-31")
  assert.ok(g.createdAt === g.updatedAt)
  // 数值取整 + 钳
  const g2 = makeGoal({ name: "x", subject: "", goalType: "count", targetValue: 1.9, currentValue: -3 }, "2026-06-01")
  assert.equal(g2.subject, "其他")
  assert.equal(g2.targetValue, 1)
  assert.equal(g2.currentValue, 0)
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)

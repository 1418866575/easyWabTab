import assert from "node:assert/strict"
import {
  STUDENT_HABIT_ID_PREFIX, STUDENT_HABIT_RECORD_ID_PREFIX,
  categoryLabel, isBuiltinCategory,
  emptyStudentHabitsData, normalizeStudentHabit, normalizeStudentHabitRecord,
  normalizeStudentHabitsData, shouldSeedStageHabits, buildStageSeedHabits,
  mergeStageSeedHabits, filterHabitsByCategory,
  normalizeHabitPoints, validateHabitPoints,
  DEFAULT_HABIT_POINTS, HABIT_POINTS_MIN, HABIT_POINTS_MAX
} from "../src/composables/studentHabitsCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 empty 零引用", () => {
  const a = emptyStudentHabitsData(), b = emptyStudentHabitsData()
  assert.deepEqual(a, { habits: [], records: [] })
  assert.notEqual(a, b)
})
test("T2 categoryLabel 内置+回退", () => {
  assert.equal(categoryLabel("life"), "生活")
  assert.equal(categoryLabel("study"), "学习")
  assert.equal(categoryLabel("exercise"), "运动")
  assert.equal(categoryLabel(""), "未分类")
  assert.equal(categoryLabel("cu"), "cu")
})
test("T3 isBuiltinCategory", () => {
  assert.equal(isBuiltinCategory("life"), true)
  assert.equal(isBuiltinCategory(""), false)
})
test("T4 normalizeHabit 空名→null / 合法回填前缀", () => {
  assert.equal(normalizeStudentHabit(null), null)
  assert.equal(normalizeStudentHabit({ name: "   " }), null)
  const h = normalizeStudentHabit({ name: "背", category: "study" })
  assert.ok(h)
  assert.ok(h.id.startsWith(STUDENT_HABIT_ID_PREFIX))
  assert.equal(h.category, "study")
  assert.equal(h.frequency, 7)
})
test("T5 normalizeHabit freq 钳 1..7 / color 默认", () => {
  const a = normalizeStudentHabit({ name: "A", frequency: 99 })
  assert.equal(a.frequency, 7)
  const b = normalizeStudentHabit({ name: "B", frequency: -1, color: "bad" })
  assert.equal(b.frequency, 1)
  assert.ok(b.color.startsWith("#"))
})
test("T6 normalizeRecord 缺 habitId/date → null / parentMarked=true 保留", () => {
  assert.equal(normalizeStudentHabitRecord(null), null)
  assert.equal(normalizeStudentHabitRecord({ date: "2026-01-01" }), null)
  const r = normalizeStudentHabitRecord({ habitId: "h1", date: "2026-01-01", parentMarked: true })
  assert.ok(r)
  assert.ok(r.id.startsWith(STUDENT_HABIT_RECORD_ID_PREFIX))
  assert.equal(r.parentMarked, true)
})
test("T7 normalizeData 孤儿剔除 + 同日去重", () => {
  const raw = {
    habits: [{ id: "h1", name: "跑", category: "exercise", frequency: 7, color: "#10b981", createdAt: "" }],
    records: [
      { habitId: "h1", date: "2026-01-01" },
      { habitId: "h1", date: "2026-01-01" },
      { habitId: "xx", date: "2026-01-01" },
    ]
  }
  const o = normalizeStudentHabitsData(raw)
  assert.equal(o.habits.length, 1)
  assert.equal(o.records.length, 1)
})
test("T8 normalizeData 非法→empty", () => {
  assert.deepEqual(normalizeStudentHabitsData(null), emptyStudentHabitsData())
})
test("T9 shouldSeedStageHabits", () => {
  assert.equal(shouldSeedStageHabits(undefined, "P"), true)
  assert.equal(shouldSeedStageHabits("P", "P"), false)
})
test("T10 buildStageSeedHabits K=7 P=6 J=5 freq=每日", () => {
  assert.equal(buildStageSeedHabits("K").length, 7)
  assert.equal(buildStageSeedHabits("P").length, 6)
  assert.equal(buildStageSeedHabits("J").length, 5)
})
test("T11 merge 同名大小写不敏感跳过", () => {
  const ex = [{ id: "e1", name: "运动", category: "exercise", frequency: 7, color: "#10b981", createdAt: "" }]
  const sd = buildStageSeedHabits("K")
  const m = mergeStageSeedHabits(ex, sd)
  assert.equal(m.length, ex.length + sd.length - 1)
})
test("T12 filterHabitsByCategory all/uncategorized/精确", () => {
  const hs = [
    { id: "a", name: "A", category: "", frequency: 1, color: "#10b981", createdAt: "" },
    { id: "b", name: "B", category: "study", frequency: 1, color: "#10b981", createdAt: "" },
  ]
  assert.equal(filterHabitsByCategory(hs, "all").length, 2)
  assert.equal(filterHabitsByCategory(hs, "uncategorized").length, 1)
  assert.equal(filterHabitsByCategory(hs, "study").length, 1)
})

let p = 0, f = 0
// T13 — normalizeHabitPoints：缺省/非法回退默认 5，越界钳到 [0,100]，小数取整
test('T13 normalizeHabitPoints 默认值与钳制', () => {
  assert.equal(DEFAULT_HABIT_POINTS, 5)
  assert.equal(HABIT_POINTS_MIN, 0)
  assert.equal(HABIT_POINTS_MAX, 100)
  assert.equal(normalizeHabitPoints(undefined), 5)
  assert.equal(normalizeHabitPoints('abc'), 5)
  assert.equal(normalizeHabitPoints(NaN), 5)
  assert.equal(normalizeHabitPoints(3), 3)
  assert.equal(normalizeHabitPoints(-5), 0)
  assert.equal(normalizeHabitPoints(999), 100)
  assert.equal(normalizeHabitPoints(7.6), 8)
})

// T14 — validateHabitPoints：0-100 整数合法，负数/超限/小数/非数字非法
test('T14 validateHabitPoints 边界校验', () => {
  assert.equal(validateHabitPoints(0), null)
  assert.equal(validateHabitPoints(5), null)
  assert.equal(validateHabitPoints(100), null)
  assert.equal(validateHabitPoints(-1), 'out-of-range')
  assert.equal(validateHabitPoints(101), 'out-of-range')
  assert.equal(validateHabitPoints(1.5), 'not-a-number')
  assert.equal(validateHabitPoints('5'), 'not-a-number')
})

// T15 — 打卡记录归一化写入 points：缺省 5，0 保留（本次不加分），超限钳到 100
test('T15 打卡记录归一化带 points', () => {
  const base = normalizeStudentHabitRecord({ habitId: 'shb_1', date: '2026-09-22' })
  assert.ok(base)
  assert.equal(base.points, 5)
  const zero = normalizeStudentHabitRecord({ habitId: 'shb_1', date: '2026-09-22', points: 0 })
  assert.equal(zero.points, 0)
  const custom = normalizeStudentHabitRecord({ habitId: 'shb_1', date: '2026-09-22', points: 20 })
  assert.equal(custom.points, 20)
  const tooBig = normalizeStudentHabitRecord({ habitId: 'shb_1', date: '2026-09-22', points: 500 })
  assert.equal(tooBig.points, 100)
})

for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)


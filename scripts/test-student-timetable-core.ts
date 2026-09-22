import assert from "node:assert/strict"
import {
  TIMETABLE_VERSION, DEFAULT_PERIODS_PER_DAY, DEFAULT_WEEKS,
  emptyTimetableData, isValidTime, isValidTimeRange, normalizeCell, normalizeTimetableData,
  cellKey, parseCellKey, weekdayLabel, setCell, clearCell, getCell, sortCellsByStartTime,
  normalizeTiming, computePeriodTime, computePeriodTimes, periodSection,
  applyTimingToSchedule, timeToMinutes, minutesToTime
} from "../src/composables/studentTimetableCore.ts"

const tests = []
function test(n, f) { tests.push({ name: n, fn: f }) }

test("T1 常量 / empty schedule 对象", () => {
  assert.equal(TIMETABLE_VERSION, 1); assert.equal(DEFAULT_PERIODS_PER_DAY, 7); assert.equal(DEFAULT_WEEKS, 20)
  const d = emptyTimetableData()
  assert.equal(d.version, 1); assert.equal(d.weeks, 20); assert.equal(d.periodsPerDay, 7)
  assert.deepEqual(d.schedule, {})
  assert.equal(Array.isArray((d as any).cells), false)
})

test("T2 isValidTime HH:MM", () => {
  assert.equal(isValidTime("08:00"), true)
  assert.equal(isValidTime("24:00"), false)
  assert.equal(isValidTime("08:60"), false)
  assert.equal(isValidTime("8:00"), false)
})

test("T3 isValidTimeRange start<end / 必须都是合法 time", () => {
  assert.equal(isValidTimeRange("08:00", "09:00"), true)
  assert.equal(isValidTimeRange("09:00", "09:00"), false)
  assert.equal(isValidTimeRange("10:00", "09:00"), false)
  assert.equal(isValidTimeRange("bad", "09:00"), false)
})

test("T4 normalizeCell subject 非空 / startHHMM+endHHMM 必填且合法；空 subject→null；teacher/room 非空才写字段", () => {
  assert.equal(normalizeCell(null), null)
  assert.equal(normalizeCell({ subject: "   " }), null)
  assert.equal(normalizeCell({ subject: "S" }), null)
  assert.equal(normalizeCell({ subject: "S", startHHMM: "bad", endHHMM: "09:00" }), null)
  assert.equal(normalizeCell({ subject: "S", startHHMM: "09:00", endHHMM: "08:00" }), null)
  const c = normalizeCell({ subject: " 数学 ", teacher: " 王老师 ", room: " Rm 1 ", startHHMM: "08:00", endHHMM: "09:00" })!
  assert.equal(c.subject, "数学"); assert.equal(c.startHHMM, "08:00"); assert.equal(c.endHHMM, "09:00")
  assert.equal(c.teacher, "王老师"); assert.equal(c.room, "Rm 1")
  const noTr = normalizeCell({ subject: "S", startHHMM: "08:00", endHHMM: "09:00", teacher: "   ", room: "" })!
  assert.ok(!("teacher" in noTr)); assert.ok(!("room" in noTr))
})

test("T5 normalizeCell teacher 20 / room 20 截断", () => {
  const c = normalizeCell({ subject: "S", startHHMM: "08:00", endHHMM: "09:00", teacher: "T".repeat(30), room: "C".repeat(50) })!
  assert.equal(c.teacher!.length, 20); assert.equal(c.room!.length, 20)
})

test("T6 normalizeTimetableData：非法→默认；合法 version/weeks/periods 保留；schedule 仅保留合法；periodsPerDay 范围 1..12", () => {
  assert.deepEqual(normalizeTimetableData(123), emptyTimetableData())
  assert.deepEqual(normalizeTimetableData([]), emptyTimetableData())
  const raw = { version: 2, weeks: 30, periodsPerDay: 8, schedule: { "1_1": { subject: "M", startHHMM: "08:00", endHHMM: "09:00" }, "1_2": { subject: "X" } } }
  const out = normalizeTimetableData(raw)
  assert.equal(out.version, 2); assert.equal(out.weeks, 30); assert.equal(out.periodsPerDay, 8)
  assert.ok(out.schedule["1_1"]); assert.equal(!!out.schedule["1_2"], false)
  // 钳位
  assert.equal(normalizeTimetableData({ weeks: 100 }).weeks, DEFAULT_WEEKS)
  assert.equal(normalizeTimetableData({ periodsPerDay: 0 }).periodsPerDay, DEFAULT_PERIODS_PER_DAY)
  assert.equal(normalizeTimetableData({ periodsPerDay: 13 }).periodsPerDay, DEFAULT_PERIODS_PER_DAY)
})

test("T7 cellKey / parseCellKey (下划线分隔；period 1..12、day 1..7 非法返回 null)", () => {
  assert.equal(cellKey(1, 2), "1_2")
  const p = parseCellKey("5_3")!
  assert.equal(p.day, 5); assert.equal(p.period, 3)
  assert.equal(parseCellKey("5-3"), null)
  assert.equal(parseCellKey("8_1"), null)
  assert.equal(parseCellKey("1_0"), null)
  assert.equal(parseCellKey("1_13"), null)
})

test("T8 weekdayLabel 1-7 正确；越界返回空串", () => {
  const expected = ["周一","周二","周三","周四","周五","周六","周日"]
  for (let i = 1; i <= 7; i++) assert.equal(weekdayLabel(i), expected[i-1])
  assert.equal(weekdayLabel(0), "")
  assert.equal(weekdayLabel(8), "")
})

test("T9 setCell 同 key 覆盖 + 新 key 追加 + 返回新对象；getCell 读取", () => {
  const s = {}
  const s1 = setCell(s, 1, 1, { subject: "数学", startHHMM: "08:00", endHHMM: "09:00" })
  assert.equal(Object.keys(s1).length, 1)
  const s2 = setCell(s1, 1, 1, { subject: "英语", startHHMM: "09:00", endHHMM: "10:00" })
  assert.equal(Object.keys(s2).length, 1)
  assert.equal(getCell(s2, 1, 1)!.subject, "英语")
  const s3 = setCell(s2, 1, 2, { subject: "体育", startHHMM: "10:00", endHHMM: "11:00" })
  assert.equal(Object.keys(s3).length, 2)
  assert.deepEqual(s, {})
})

test("T10 clearCell 删除 + 再删无副作用；getCell 不存在 undefined", () => {
  let s = {}
  s = setCell(s, 2, 3, { subject: "X", startHHMM: "08:00", endHHMM: "09:00" })
  const s2 = clearCell(s, 2, 3)
  assert.equal(Object.keys(s2).length, 0)
  const s3 = clearCell(s2, 2, 3)
  assert.equal(Object.keys(s3).length, 0)
  assert.equal(getCell(s, 2, 4), undefined)
})

test("T11 sortCellsByStartTime startHHMM 升序 + 不改入参", () => {
  const list = [
    { subject: "C", startHHMM: "10:00", endHHMM: "11:00" },
    { subject: "A", startHHMM: "08:00", endHHMM: "09:00" },
    { subject: "B", startHHMM: "09:00", endHHMM: "10:00" },
  ]
  const copy = list.map(x => ({ ...x }))
  const out = sortCellsByStartTime(list)
  assert.equal(out[0].subject, "A"); assert.equal(out[1].subject, "B"); assert.equal(out[2].subject, "C")
  assert.deepEqual(list, copy)
})

test("T12 normalizeTiming：缺失/非法回落默认，数值按上下限钳位", () => {
  const d = normalizeTiming(undefined)
  assert.equal(d.firstStart, "08:00"); assert.equal(d.lessonMinutes, 45)
  assert.equal(d.breakMinutes, 10); assert.equal(d.morningPeriods, 4)
  assert.equal(d.afternoonStart, "14:00")
  assert.deepEqual(normalizeTiming(null), d)
  assert.deepEqual(normalizeTiming([]), d)
  assert.equal(normalizeTiming({ firstStart: "bad" }).firstStart, "08:00")
  assert.equal(normalizeTiming({ afternoonStart: "bad" }).afternoonStart, "14:00")
  assert.equal(normalizeTiming({ afternoonStart: "" }).afternoonStart, "14:00")
  assert.equal(normalizeTiming({ lessonMinutes: 999 }).lessonMinutes, 120)
  assert.equal(normalizeTiming({ lessonMinutes: 0 }).lessonMinutes, 1)
  assert.equal(normalizeTiming({ breakMinutes: -5 }).breakMinutes, 0)
  assert.equal(normalizeTiming({ morningPeriods: 99 }).morningPeriods, 12)
  const custom = normalizeTiming({ firstStart: "07:30", afternoonStart: "13:20", lessonMinutes: 40, breakMinutes: 5, morningPeriods: 3 })
  assert.equal(custom.firstStart, "07:30"); assert.equal(custom.afternoonStart, "13:20")
  assert.equal(custom.lessonMinutes, 40)
  assert.equal(custom.breakMinutes, 5); assert.equal(custom.morningPeriods, 3)
})

test("T13 computePeriodTime：默认 08:00 起，每节 45 分钟 + 课间休息 10 分钟", () => {
  assert.deepEqual(computePeriodTime(1), { startHHMM: "08:00", endHHMM: "08:45" })
  assert.deepEqual(computePeriodTime(2), { startHHMM: "08:55", endHHMM: "09:40" })
  assert.deepEqual(computePeriodTime(3), { startHHMM: "09:50", endHHMM: "10:35" })
  assert.deepEqual(computePeriodTime(4), { startHHMM: "10:45", endHHMM: "11:30" })
  // 下午不与上午连排：第 5 节从下午第一节开始时间 14:00 重新起算
  assert.deepEqual(computePeriodTime(5), { startHHMM: "14:00", endHHMM: "14:45" })
  assert.deepEqual(computePeriodTime(6), { startHHMM: "14:55", endHHMM: "15:40" })
  assert.deepEqual(computePeriodTime(7), { startHHMM: "15:50", endHHMM: "16:35" })
  // 第 0 / 负数按第 1 节处理
  assert.deepEqual(computePeriodTime(0), { startHHMM: "08:00", endHHMM: "08:45" })
})

test("T14 computePeriodTime：自定义首节时间 / 单节时长 / 课间休息", () => {
  const t = { firstStart: "07:30", afternoonStart: "13:20", lessonMinutes: 40, breakMinutes: 5, morningPeriods: 3 }
  assert.deepEqual(computePeriodTime(1, t), { startHHMM: "07:30", endHHMM: "08:10" })
  assert.deepEqual(computePeriodTime(2, t), { startHHMM: "08:15", endHHMM: "08:55" })
  assert.deepEqual(computePeriodTime(3, t), { startHHMM: "09:00", endHHMM: "09:40" })
  // 第 4 节 = 下午第一节，从 13:20 起算；第 5 节 = 13:20 + 45
  assert.deepEqual(computePeriodTime(4, t), { startHHMM: "13:20", endHHMM: "14:00" })
  assert.deepEqual(computePeriodTime(5, t), { startHHMM: "14:05", endHHMM: "14:45" })
})

test("T15 computePeriodTimes 批量推算 + timeToMinutes / minutesToTime 往返", () => {
  const list = computePeriodTimes(3)
  assert.equal(list.length, 3)
  assert.equal(list[0].period, 1); assert.equal(list[2].period, 3)
  assert.equal(list[2].startHHMM, "09:50")
  assert.deepEqual(computePeriodTimes(0), [])
  assert.equal(timeToMinutes("08:00"), 480)
  assert.equal(timeToMinutes("bad"), -1)
  assert.equal(minutesToTime(480), "08:00")
  assert.equal(minutesToTime(480 + 55), "08:55")
  // 跨天取模，始终落在 00:00-23:59
  assert.equal(minutesToTime(1440 + 60), "01:00")
  assert.equal(minutesToTime(-60), "23:00")
})

test("T16 periodSection：第 1~morningPeriods 节为上午，其余为下午", () => {
  assert.equal(periodSection(1), "morning")
  assert.equal(periodSection(4), "morning")
  assert.equal(periodSection(5), "afternoon")
  assert.equal(periodSection(6), "afternoon")
  assert.equal(periodSection(2, { morningPeriods: 1 }), "afternoon")
})

test("T17 applyTimingToSchedule：按配置重刷全部 cell 时间（保留学科，不改入参）", () => {
  let s = {}
  s = setCell(s, 1, 1, { subject: "数学", startHHMM: "08:00", endHHMM: "08:45" })
  s = setCell(s, 2, 3, { subject: "语文", startHHMM: "09:50", endHHMM: "10:35" })
  const before = JSON.parse(JSON.stringify(s))
  const out = applyTimingToSchedule(s, { firstStart: "07:30", lessonMinutes: 40, breakMinutes: 5 })
  assert.equal(out["1_1"].subject, "数学")
  assert.equal(out["1_1"].startHHMM, "07:30"); assert.equal(out["1_1"].endHHMM, "08:10")
  assert.equal(out["2_3"].subject, "语文")
  assert.equal(out["2_3"].startHHMM, "09:00"); assert.equal(out["2_3"].endHHMM, "09:40")
  assert.deepEqual(s, before)
})

test("T18 下午第一节开始时间：下午独立起算，与上午互不干扰", () => {
  const base = { firstStart: "08:00", afternoonStart: "14:00", lessonMinutes: 45, breakMinutes: 10, morningPeriods: 4 }
  // 只改下午起点 → 上午第 1~4 节完全不变
  const a = { ...base, afternoonStart: "13:00" }
  assert.deepEqual(computePeriodTime(1, a), computePeriodTime(1, base))
  assert.deepEqual(computePeriodTime(4, a), computePeriodTime(4, base))
  assert.deepEqual(computePeriodTime(5, a), { startHHMM: "13:00", endHHMM: "13:45" })
  assert.deepEqual(computePeriodTime(7, a), { startHHMM: "14:50", endHHMM: "15:35" })
  // 改上午起点 / 上午节数 → 下午仍从 afternoonStart 起算，第 morningPeriods+1 节恒为下午第一节
  const b = { ...base, firstStart: "07:00", morningPeriods: 2 }
  assert.deepEqual(computePeriodTime(1, b), { startHHMM: "07:00", endHHMM: "07:45" })
  assert.deepEqual(computePeriodTime(3, b), { startHHMM: "14:00", endHHMM: "14:45" })
  assert.deepEqual(computePeriodTime(4, b), { startHHMM: "14:55", endHHMM: "15:40" })
  // 批量推算与逐节推算结果一致
  const list = computePeriodTimes(7, base)
  for (let i = 1; i <= 7; i++) assert.deepEqual(list[i - 1], { period: i, ...computePeriodTime(i, base) })
  // 全部节次均为上午时，afternoonStart 不参与计算
  const allMorning = { ...base, morningPeriods: 12 }
  for (let i = 1; i <= 7; i++) {
    assert.deepEqual(computePeriodTime(i, allMorning), computePeriodTime(i, { ...base, morningPeriods: 12, afternoonStart: "23:00" }))
  }
})

let p = 0, f = 0
for (const t of tests) {
  try { t.fn(); p++; console.log("  OK " + t.name) }
  catch (e) { f++; console.error("  FAIL " + t.name); console.error(e) }
}
console.log("\n" + p + "/" + tests.length + " passed")
if (f > 0) process.exit(1)

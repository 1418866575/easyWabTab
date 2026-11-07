// 健康方案模板纯逻辑单测：node --experimental-strip-types scripts/test-health-plan-templates.ts
//
// 重点不是覆盖率，而是三件在编译期抓不到的事：
//   1. 模块能否被单独 import（漏 import / 循环依赖只有运行期才炸，见 MEMORY 飞书硬约束第 9 条）
//   2. 模板数据本身自洽（7 天齐全、休息日无动作、总组数与海报一致）
//   3. 展开成周计划的条目数量与语义正确（尤其「傍晚行只在有拉伸时出现」这条曾被写错）

import assert from 'node:assert'
import {
  DIET_PLAN_TEMPLATES,
  EXERCISE_PLAN_TEMPLATES,
  PLAN_TRUST_LABEL,
  PLAN_TRUST_NOTE,
  activeGainWeekIndex,
  buildDietWeekItems,
  buildExerciseWeekItems,
  planDayDoneSets,
  planDayTotalSets,
  progressKey
} from '../src/composables/healthPlanTemplates.ts'

let pass = 0
function ok(name: string, cond: boolean, extra?: unknown): void {
  assert.ok(cond, `${name}${extra === undefined ? '' : ` → ${JSON.stringify(extra)}`}`)
  pass++
}
function eq(name: string, actual: unknown, expected: unknown): void {
  assert.deepStrictEqual(actual, expected, `${name} → 期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`)
  pass++
}

// ---------- S1 跟练模板结构 ----------
const tpl = EXERCISE_PLAN_TEMPLATES[0]
ok('S1-1 模块可独立加载且至少一套跟练方案', !!tpl)
eq('S1-2 一周恰好 7 天', tpl.days.length, 7)
eq('S1-3 星期序号连续 1..7', tpl.days.map(d => d.day), [1, 2, 3, 4, 5, 6, 7])

const trainDays = tpl.days.filter(d => !d.isRest)
const restDays = tpl.days.filter(d => d.isRest)
eq('S1-4 训练日 = 周一/三/五/日', trainDays.map(d => d.day), [1, 3, 5, 7])
eq('S1-5 休息日 = 周二/四/六', restDays.map(d => d.day), [2, 4, 6])
ok('S1-6 休息日不得带动作', restDays.every(d => d.moves.length === 0))
ok('S1-7 训练日必须有动作', trainDays.every(d => d.moves.length > 0))

// ---------- S2 组数：与海报逐条核对 ----------
// 周一 2+2+3+2+2=11；周三 2+2+3+2=9；周五 2+2+2+2=8；周日 2+2+3+2=9
eq('S2-1 周一总组数', planDayTotalSets(tpl.days[0]), 11)
eq('S2-2 周三总组数', planDayTotalSets(tpl.days[2]), 9)
eq('S2-3 周五总组数', planDayTotalSets(tpl.days[4]), 8)
eq('S2-4 周日总组数', planDayTotalSets(tpl.days[6]), 9)

// ---------- S3 勾选进度 ----------
const keyA = progressKey(tpl.id, 0, 0)
const keyB = progressKey(tpl.id, 0, 1)
ok('S3-1 进度键不重复', keyA !== keyB, [keyA, keyB])
eq('S3-2 未勾选时为 0', planDayDoneSets(tpl.days[0], tpl.id, []), 0)
eq('S3-3 勾两组 = 2', planDayDoneSets(tpl.days[0], tpl.id, [keyA, keyB]), 2)
eq('S3-4 休息日永远 0（即使有脏进度）', planDayDoneSets(tpl.days[1], tpl.id, [keyA, keyB]), 0)

// ---------- S4 展开成周计划 ----------
const items = buildExerciseWeekItems(tpl)
eq('S4-1 只排早晨行 + 有拉伸的傍晚行', items.length, 9)
eq('S4-2 早晨行每天一条', items.filter(i => i.rowKey === 'morning').length, 7)
// 周一、周日脚注含「拉伸」；周三「减负」、周五「减量」不含 → 不写傍晚
eq('S4-3 傍晚行只在脚注含拉伸时出现', items.filter(i => i.rowKey === 'evening').map(i => i.day), [1, 7])
ok('S4-4 休息日写成「休息」', items.filter(i => i.rowKey === 'morning' && i.name === '休息').map(i => i.day).join(',') === '2,4,6')
const monItem = items.find(i => i.rowKey === 'morning' && i.day === 1)
eq('S4-5 训练日条目带「N 项 · M 组」', monItem?.value, '5 项 · 11 组')
eq('S4-6 训练日条目名 = 方案名', monItem?.name, tpl.name)
ok('S4-7 条目 id 互不相同', new Set(items.map(i => i.id)).size === items.length)
ok('S4-8 全部初始未完成', items.every(i => i.done === false))

// ---------- S5 食谱模板 ----------
eq('S5-1 两套食谱方案', DIET_PLAN_TEMPLATES.length, 2)
const gain = DIET_PLAN_TEMPLATES.find(t => t.id === 'gain-4w')
const loss = DIET_PLAN_TEMPLATES.find(t => t.id === 'loss-30d')
ok('S5-2 增肌方案存在', !!gain)
ok('S5-3 减脂方案存在', !!loss)

if (gain) {
  eq('S5-4 增肌为 4 周', gain.weeks?.length, 4)
  eq('S5-5 每周 5 餐', gain.weeks?.every(w => w.meals.length === 5), true)
  eq('S5-6 每餐都有内容', gain.weeks?.every(w => w.meals.every(m => m.items.length > 0)), true)
  eq('S5-7 餐序固定', gain.weeks?.[0].meals.map(m => m.key), ['breakfast', 'am', 'lunch', 'pm', 'dinner'])
  const dItems = buildDietWeekItems(gain, 0)
  eq('S5-8 展开成周计划 = 7 天 × 3 餐', dItems.length, 21)
  eq('S5-9 只写早/午/晚三行', [...new Set(dItems.map(i => i.rowKey))].sort(), ['breakfast', 'dinner', 'lunch'])
  ok('S5-10 越界周次返回空数组', buildDietWeekItems(gain, 9).length === 0)
}

if (loss) {
  eq('S5-11 减脂为 3 段', loss.stages?.length, 3)
  eq('S5-12 每段 10 天', loss.stages?.map(s => s.days.length), [10, 10, 10])
  const allDays = (loss.stages ?? []).flatMap(s => s.days.map(d => d.day))
  eq('S5-13 30 天连续无缺', allDays, Array.from({ length: 30 }, (_, i) => i + 1))
  ok('S5-14 每天三餐都不为空', (loss.stages ?? []).every(s => s.days.every(d => d.breakfast && d.lunch && d.dinner)))
  // 可信度必须如实标注，不允许全部标 high
  eq('S5-15 可信度标注', loss.stages?.map(s => s.trust), ['high', 'mid', 'low'])
  ok('S5-16 每档可信度都有文案', (['high', 'mid', 'low'] as const).every(t => !!PLAN_TRUST_LABEL[t] && !!PLAN_TRUST_NOTE[t]))
}

// ---------- S6 今天该执行第几周 ----------
eq('S6-1 启用当天 = 第 1 周', activeGainWeekIndex('2026-11-07', '2026-11-07', 4), 0)
eq('S6-2 第 8 天 = 第 2 周', activeGainWeekIndex('2026-11-07', '2026-11-14', 4), 1)
eq('S6-3 第 15 天 = 第 3 周', activeGainWeekIndex('2026-11-07', '2026-11-21', 4), 2)
eq('S6-4 第 22 天 = 第 4 周', activeGainWeekIndex('2026-11-07', '2026-11-28', 4), 3)
eq('S6-5 超过 4 周封顶在第 4 周', activeGainWeekIndex('2026-11-07', '2027-01-30', 4), 3)
eq('S6-6 早于启用日期回落第 1 周', activeGainWeekIndex('2026-11-07', '2026-11-01', 4), 0)
eq('S6-7 非法日期不抛错', activeGainWeekIndex('', '', 4), 0)

console.log(`\n[test-health-plan-templates] ${pass} 项断言全部通过`)

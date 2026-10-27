// 健康周计划纯逻辑单测：mondayOfDate / weekDayKeys / normalizeWeeklyPlans
// 运行：env -u NODE_OPTIONS node --experimental-strip-types --experimental-loader ./scripts/resolve-extensionless.mjs scripts/test-health-week-plan.ts
import assert from 'node:assert/strict'
import { mondayOfDate, weekDayKeys, normalizeWeeklyPlans, normalizeHealthData } from '../src/composables/healthCore.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

// T1 — mondayOfDate：周一返回自身；周日回退到前一天的周一（ISO 周，周一为一周之始）
test('T1 mondayOfDate', () => {
  assert.equal(mondayOfDate('2026-10-26'), '2026-10-26') // 周一
  assert.equal(mondayOfDate('2026-10-27'), '2026-10-26') // 周二 → 本周周一
  assert.equal(mondayOfDate('2026-11-01'), '2026-10-26') // 周日 → 本周周一
  assert.equal(mondayOfDate('2026-11-02'), '2026-11-02') // 下周一
})

// T2 — weekDayKeys：周一起连排 7 天，跨月/跨年不断档
test('T2 weekDayKeys', () => {
  const keys = weekDayKeys('2026-10-26')
  assert.deepEqual(keys, ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  const crossYear = weekDayKeys('2026-12-28')
  assert.equal(crossYear[0], '2026-12-28')
  assert.equal(crossYear[6], '2027-01-03')
})

// T3 — normalizeWeeklyPlans：合法数据透传；脏键/脏条目剔除；kcal 取整
test('T3 normalizeWeeklyPlans', () => {
  const raw = {
    '2026-10-26': {
      exercise: [
        { id: 'wp_1', day: 1, rowKey: 'morning', name: ' 晨跑 ', value: '5 km', done: true },
        { id: '', day: 2, rowKey: 'morning', name: '坏数据' },
        { id: 'wp_2', day: 9, rowKey: 'morning', name: '越界 day' },
        { id: 'wp_3', day: 3, rowKey: 'evening', name: '', value: 'x' }
      ],
      diet: [{ id: 'wp_4', day: 1, rowKey: 'breakfast', name: '燕麦', kcal: 380.6 }],
      updatedAt: '2026-10-26T08:00:00.000Z'
    },
    'bad-key': { exercise: [], diet: [], updatedAt: '' }
  }
  const out = normalizeWeeklyPlans(raw)
  assert.ok(out)
  assert.equal(Object.keys(out).length, 1)
  const week = out['2026-10-26']
  assert.equal(week.exercise.length, 1)
  assert.equal(week.exercise[0].name, '晨跑')
  assert.equal(week.exercise[0].done, true)
  assert.equal(week.diet.length, 1)
  assert.equal(week.diet[0].kcal, 381)
})

// T4 — normalizeHealthData 透传 weeklyPlans/plansUpdatedAt（旧数据无该字段 → undefined）
test('T4 normalizeHealthData passthrough', () => {
  const withPlans = normalizeHealthData({
    plans: {},
    records: { exercise: [], diet: [], sleep: [], weight: [] },
    weeklyPlans: { '2026-10-26': { exercise: [], diet: [], updatedAt: 'x' } },
    plansUpdatedAt: '2026-10-26T09:00:00.000Z'
  } as never)
  assert.ok(withPlans.weeklyPlans)
  assert.equal(withPlans.weeklyPlans?.['2026-10-26'].updatedAt, 'x')
  assert.equal(withPlans.plansUpdatedAt, '2026-10-26T09:00:00.000Z')

  const legacy = normalizeHealthData({ plans: {}, records: { exercise: [], diet: [], sleep: [], weight: [] } } as never)
  assert.equal(legacy.weeklyPlans, undefined)
  assert.equal(legacy.plansUpdatedAt, undefined)
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
console.log(`\n${passed}/${tests.length} passed`)
if (failed > 0) process.exit(1)

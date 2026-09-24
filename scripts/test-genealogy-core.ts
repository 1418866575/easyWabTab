import assert from 'node:assert/strict'
import {
  calcAge,
  ageGroupOf,
  genealogyStats,
  emptyGenealogyStats,
  AGE_GROUPS
} from '../src/composables/genealogyCore.ts'
import type { FamilyMember } from '../src/types'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

function member(patch: Partial<FamilyMember> & { id: string }): FamilyMember {
  return {
    name: patch.id,
    parents: [],
    spouses: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...patch
  } as FamilyMember
}

// T1 — calcAge 周岁：未过生日要减 1，已过生日不减
test('T1 calcAge 周岁计算', () => {
  const today = new Date('2026-09-24T00:00:00.000Z')
  assert.equal(calcAge('2000-01-01', undefined, today), 26)
  // 生日在基准日之后 → 还没到，减 1
  assert.equal(calcAge('2000-12-31', undefined, today), 25)
  // 生日当天 → 已到，不减
  assert.equal(calcAge('2000-09-24', undefined, today), 26)
  // 生日前一天 → 未满
  assert.equal(calcAge('2000-09-25', undefined, today), 25)
  // 出生当天
  assert.equal(calcAge('2026-09-24', undefined, today), 0)
  // 闰年 2/29：非闰年按 3/1 之后才算满（2/28 当天仍未满）
  assert.equal(calcAge('2000-02-29', undefined, new Date('2025-02-28T00:00:00.000Z')), 24)
  assert.equal(calcAge('2000-02-29', undefined, new Date('2025-03-01T00:00:00.000Z')), 25)
})

// T2 — calcAge 非法输入/已故成员
test('T2 calcAge 边界与享年', () => {
  const today = new Date('2026-09-24T00:00:00.000Z')
  assert.equal(calcAge(undefined, undefined, today), null)
  assert.equal(calcAge('', undefined, today), null)
  assert.equal(calcAge('bad-date', undefined, today), null)
  // 出生日期晚于基准日期（未来出生/脏数据）→ null，不臆造负数
  assert.equal(calcAge('2030-01-01', undefined, today), null)

  // 已故成员按去世日期计享年，与 today 无关
  const dead = calcAge('1940-06-01', '2020-06-01', today)
  assert.equal(dead, 80)
  // 去世日期早于出生日期 → null
  assert.equal(calcAge('1940-06-01', '1930-01-01', today), null)
})

// T3 — ageGroupOf 年龄段划分（互斥、无缝、全覆盖）
test('T3 ageGroupOf 年龄段判定', () => {
  assert.equal(ageGroupOf(0), 'infant')
  assert.equal(ageGroupOf(1), 'child')
  assert.equal(ageGroupOf(6), 'child')
  assert.equal(ageGroupOf(7), 'teen')
  assert.equal(ageGroupOf(17), 'teen')
  assert.equal(ageGroupOf(18), 'youth')
  assert.equal(ageGroupOf(59), 'youth')
  assert.equal(ageGroupOf(60), 'elder')
  assert.equal(ageGroupOf(120), 'elder')
  // 无年龄（缺出生日期）→ null
  assert.equal(ageGroupOf(null), null)
  // 全覆盖：0~130 每个年龄都要落在某个段，且不重段
  for (let a = 0; a <= 130; a++) {
    assert.ok(ageGroupOf(a) !== null, `年龄 ${a} 未落在任何年龄段`)
  }
  // 分段定义本身无缝：相邻段 min = 上一段 max + 1
  for (let i = 1; i < AGE_GROUPS.length; i++) {
    const prev = AGE_GROUPS[i - 1]
    assert.equal(AGE_GROUPS[i].min, (prev.max ?? 0) + 1, `${AGE_GROUPS[i].label} 段与前一段不连续`)
  }
  assert.equal(AGE_GROUPS[0].min, 0)
  assert.equal(AGE_GROUPS[AGE_GROUPS.length - 1].max, null)
})

// T4 — genealogyStats 总数 / 男女 / 年龄段
test('T4 genealogyStats 人口与年龄段统计', () => {
  const today = new Date('2026-09-24T00:00:00.000Z')
  const members: FamilyMember[] = [
    member({ id: 'baby', gender: 'male', birthDate: '2026-01-01' }),        // 0 岁 → 婴儿
    member({ id: 'kid', gender: 'female', birthDate: '2022-01-01' }),       // 4 岁 → 儿童
    member({ id: 'teen', gender: 'male', birthDate: '2012-01-01' }),        // 14 岁 → 少年
    member({ id: 'youth', gender: 'female', birthDate: '1996-01-01' }),     // 30 岁 → 青年
    member({ id: 'elder', gender: 'male', birthDate: '1950-01-01' }),       // 76 岁 → 老年
    member({ id: 'unknown', gender: '' })                                    // 无出生日期
  ]
  const s = genealogyStats(members, today)
  assert.equal(s.total, 6)
  assert.equal(s.male, 3)
  assert.equal(s.female, 2)
  assert.equal(s.unknownGender, 1)
  assert.equal(s.groups.infant, 1)
  assert.equal(s.groups.child, 1)
  assert.equal(s.groups.teen, 1)
  assert.equal(s.groups.youth, 1)
  assert.equal(s.groups.elder, 1)
  assert.equal(s.unknownAge, 1)
  // 各年龄段人数之和 + 年龄未知 = 总数
  const sum = Object.values(s.groups).reduce((a, b) => a + b, 0)
  assert.equal(sum + s.unknownAge, s.total)
  // 男女 + 未知性别 = 总数
  assert.equal(s.male + s.female + s.unknownGender, s.total)
})

// T5 — genealogyStats 空数据 / 已故成员按享年归入年龄段
test('T5 genealogyStats 空态与已故成员', () => {
  const today = new Date('2026-09-24T00:00:00.000Z')
  const empty = genealogyStats([], today)
  assert.deepEqual(empty, emptyGenealogyStats())
  assert.equal(empty.total, 0)
  assert.equal(Object.values(empty.groups).reduce((a, b) => a + b, 0), 0)

  // 已故：1950 年生、2005 年去世 → 享年 55（青年段），不按 today 的 76（老年段）计
  const dead = genealogyStats([member({ id: 'd', gender: 'male', birthDate: '1950-01-01', deathDate: '2005-01-01' })], today)
  assert.equal(dead.total, 1)
  assert.equal(dead.groups.youth, 1)
  assert.equal(dead.groups.elder, 0)
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

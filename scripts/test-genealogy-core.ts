import assert from 'node:assert/strict'
import {
  calcAge,
  ageGroupOf,
  genealogyStats,
  emptyGenealogyStats,
  AGE_GROUPS,
  calcZodiac,
  ZODIAC_ANIMALS,
  filterParentCandidates,
  filterSpouseCandidates,
  mergeFamily
} from '../src/composables/genealogyCore.ts'
import { activeOnly } from '../src/composables/tombstoneCore.ts'
import type { FamilyMember, GenealogyData } from '../src/types'

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

// T6 — calcZodiac 生肖推导（下标 = (年份 - 4) % 12）
test('T6 calcZodiac 生肖推导', () => {
  assert.equal(calcZodiac(undefined), null)
  assert.equal(calcZodiac(''), null)
  assert.equal(calcZodiac('bad-date'), null)
  // 已知年份校验
  assert.equal(calcZodiac('2020-01-01'), '鼠')   // 2020 鼠年
  assert.equal(calcZodiac('2023-09-24'), '兔')   // 2023 兔年
  assert.equal(calcZodiac('2000-01-01'), '龙')   // 2000 龙年
  assert.equal(calcZodiac('2024-02-10'), '龙')   // 2024 龙年
  assert.equal(calcZodiac('1985-06-15'), '牛')   // 1985 牛年
  assert.equal(calcZodiac('1993-01-01'), '鸡')   // 1993 鸡年
  // 12 生肖全覆盖、无错位：1900 鼠年起逐年代位
  for (let y = 1900; y < 1900 + 12; y++) {
    assert.equal(calcZodiac(`${y}-01-01`), ZODIAC_ANIMALS[y - 1900])
  }
})

// T7 — filterParentCandidates 父母候选合理性过滤
test('T7 filterParentCandidates 父母候选过滤', () => {
  const members: FamilyMember[] = [
    member({ id: 'p', gender: 'male', birthDate: '1950-01-01', parents: ['pa'] }),
    member({ id: 'pa', gender: 'female', birthDate: '1920-01-01' }),   // 现有父母（女）
    member({ id: 'c', gender: 'female', birthDate: '1980-01-01', parents: ['p'] }), // p 的后代
    member({ id: 'y', gender: 'male', birthDate: '1990-01-01' }),     // 比 p 年轻
    member({ id: 'f2', gender: 'female', birthDate: '1922-01-01' }),  // 同性别（女）于现有父母 → 冲突
    member({ id: 'o', gender: 'male', birthDate: '1928-01-01' }),     // 年长、男（不与女冲突）→ 合理
    member({ id: 'u', gender: '', birthDate: '1926-01-01' })          // 年长、性别未知 → 合理
  ]
  const ids = filterParentCandidates(members, 'p').map((m) => m.id).sort()
  // 保留：o（年长男）、u（年长未知）；排除：pa(现有父母)/c(后代)/y(年轻)/f2(同性别冲突)/p(自己)
  assert.deepEqual(ids, ['o', 'u'])

  // 被关联人无出生日期时，年龄过滤不生效（不臆造年龄，更年轻的候选仍保留）
  const noBirth: FamilyMember[] = [
    member({ id: 'x', gender: 'male', parents: [] }),
    member({ id: 'z', gender: 'male', birthDate: '2000-01-01' })
  ]
  assert.ok(filterParentCandidates(noBirth, 'x').some((m) => m.id === 'z'))
})

// T8 — filterSpouseCandidates 配偶候选合理性过滤（含关系互斥）
test('T8 filterSpouseCandidates 配偶候选过滤', () => {
  const members: FamilyMember[] = [
    member({ id: 's', gender: 'male', spouses: ['sp'], parents: ['pa'] }),
    member({ id: 'sp', gender: 'female' }),   // 现有配偶
    member({ id: 'f', gender: 'female' }),    // 异性、无亲属关系 → 合理
    member({ id: 'm', gender: 'male' }),      // 同性 → 排除
    member({ id: 'u', gender: '' }),          // 性别未知、无亲属关系 → 保留
    member({ id: 'pa', gender: 'female' }),   // 现有父母 → 关系互斥，排除
    member({ id: 'ch', gender: 'female', parents: ['s'] }),   // 现有子女 → 关系互斥，排除
    // 兄弟姐妹：与 s 共享父母 pa
    member({ id: 'sb', gender: 'female', parents: ['pa'] })
  ]
  const ids = filterSpouseCandidates(members, 's').map((m) => m.id).sort()
  // 保留：f（异性无关）、u（性别未知无关）；排除：sp(配偶)/m(同性)/pa(父母)/ch(子女)/sb(兄弟姐妹)/s(自己)
  assert.deepEqual(ids, ['f', 'u'])

  // 祖先/后代也互斥（pa 之上再加一代，sb 之下再加一代）
  const deep: FamilyMember[] = [
    member({ id: 's2', gender: 'male', parents: ['gp'] }),
    member({ id: 'gp', gender: 'female', parents: ['ggp'] }), // 祖母（祖先）
    member({ id: 'ggp', gender: 'female' }),                  // 曾祖母（祖先）
    member({ id: 'x', gender: 'female' })                    // 无关异性 → 合理
  ]
  const idsDeep = filterSpouseCandidates(deep, 's2').map((m) => m.id).sort()
  assert.deepEqual(idsDeep, ['x'])

  // 被关联人性别未知：仅排除自己、现有配偶、亲属；其余皆保留
  const unknown: FamilyMember[] = [
    member({ id: 's3', gender: '', spouses: [] }),
    member({ id: 'a', gender: 'male' }),
    member({ id: 'b', gender: 'female' })
  ]
  const ids2 = filterSpouseCandidates(unknown, 's3').map((m) => m.id).sort()
  assert.deepEqual(ids2, ['a', 'b'])
})

// T9~T11 — 墓碑感知合并：删除状态必须跨越合并存活（云同步「删除失效」的根因）
function data(members: FamilyMember[]): GenealogyData {
  return { members, rootId: null, names: [] }
}

test('T9 mergeFamily 墓碑：本地删除不被云端复活', () => {
  // 本端墓碑 ver=5 vs 云端活记录 ver=3 → 墓碑胜，保持删除
  const local = data([member({ id: 'm1', name: '张三', updatedAt: '2026-06-01T00:00:00.000Z', ver: 5, deletedAt: '2026-06-01T00:00:00.000Z' })])
  const remote = data([member({ id: 'm1', name: '张三', updatedAt: '2026-05-01T00:00:00.000Z', ver: 3 })])
  const merged = mergeFamily(local, remote)
  assert.equal(merged.members.length, 1)
  assert.equal(merged.members[0].deletedAt, '2026-06-01T00:00:00.000Z')
  // 展示层过滤后应为空 —— 删除真的生效了
  assert.equal(activeOnly(merged.members).length, 0)
})

test('T10 mergeFamily 墓碑：云端删除能同步到本地', () => {
  const local = data([member({ id: 'm1', name: '张三', updatedAt: '2026-05-01T00:00:00.000Z', ver: 2 })])
  const remote = data([member({ id: 'm1', name: '张三', updatedAt: '2026-06-01T00:00:00.000Z', ver: 6, deletedAt: '2026-06-01T00:00:00.000Z' })])
  const merged = mergeFamily(local, remote)
  assert.equal(activeOnly(merged.members).length, 0)
})

test('T11 mergeFamily 墓碑：远端新增仍然补入（不误伤）', () => {
  const local = data([member({ id: 'm1', name: '张三', updatedAt: '2026-05-01T00:00:00.000Z', ver: 2 })])
  const remote = data([member({ id: 'm2', name: '李四', updatedAt: '2026-05-01T00:00:00.000Z', ver: 1 })])
  const merged = mergeFamily(local, remote)
  assert.equal(activeOnly(merged.members).length, 2)
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

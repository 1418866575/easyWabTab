/**
 * 家谱 · 取名记录纯逻辑测试
 * 运行：npm run test:naming
 *
 * 覆盖：校验 / 归一化（导入清洗）/ 合并 / 过滤排序 / 导出信封
 */
import assert from 'node:assert/strict'
import {
  validateNameForm,
  normalizeNamesImport,
  mergeNames,
  filterNameRecords,
  buildNamesExport,
  isFutureDateKey,
  NAME_NAME_MAX,
  NAME_MEANING_MAX
} from '../src/composables/namingCore.ts'
import type { FamilyNameRecord } from '../src/types'

let passed = 0
function ok(name: string, fn: () => void): void {
  fn()
  passed++
  console.log(`  ✔ ${name}`)
}

const rec = (patch: Partial<FamilyNameRecord> & { id: string; name: string }): FamilyNameRecord => ({
  gender: '',
  namingDate: null,
  memberId: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...patch
})

console.log('家谱取名记录 core 测试\n')

// ---------- 校验 ----------
console.log('[校验]')
ok('名字为空 → 不通过', () => {
  assert.equal(validateNameForm({ name: '  ' }).ok, false)
})
ok('名字超 50 字 → 不通过', () => {
  assert.equal(validateNameForm({ name: '甲'.repeat(51) }).ok, false)
})
ok('正常名字 → 通过', () => {
  assert.equal(validateNameForm({ name: '沐宸' }).ok, true)
})
ok('未来取名日期 → 不通过', () => {
  const future = new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10)
  assert.equal(validateNameForm({ name: '沐宸', namingDate: future }).ok, false)
})
ok('今天/过去日期 → 通过', () => {
  const today = new Date().toISOString().slice(0, 10)
  assert.equal(validateNameForm({ name: '沐宸', namingDate: today }).ok, true)
})

// ---------- 导入清洗 ----------
console.log('[导入清洗]')
ok('裸数组可导入，名字缺失被跳过', () => {
  const r = normalizeNamesImport([
    { id: 'nm_1', name: '沐宸' },
    { id: 'nm_2', name: '' },
    { name: '      ' }
  ])
  assert.equal(r.valid, 1)
  assert.equal(r.skipped, 2)
})
ok('信封 kind=family-names 可导入', () => {
  const r = normalizeNamesImport({
    kind: 'family-names',
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    data: [{ id: 'nm_1', name: '沐宸' }, { id: 'nm_2', name: '思齐' }]
  })
  assert.equal(r.valid, 2)
})
ok('kind 不符 → 拒绝', () => {
  const r = normalizeNamesImport({ kind: 'easy-web-tab-genealogy', data: [] })
  assert.equal(r.records.length, 0)
  assert.ok(r.warnings.some((w) => w.includes('类型标识不符')))
})
ok('非 JSON 字符串 → 抛错由调用方捕获（此处给对象则空）', () => {
  const r = normalizeNamesImport(42 as unknown)
  assert.equal(r.records.length, 0)
})
ok('寓意/备注超 500 字 → 截断并提示', () => {
  const long = '字'.repeat(NAME_MEANING_MAX + 10)
  const r = normalizeNamesImport([{ id: 'nm_1', name: '沐宸', meaning: long, note: long }])
  assert.equal(r.valid, 1)
  const got = r.records[0]
  assert.ok(got.meaning && got.meaning.length === NAME_MEANING_MAX)
  assert.ok(got.note && got.note.length === NAME_MEANING_MAX)
  assert.ok(r.warnings.some((w) => w.includes('寓意')))
})
ok('未来取名日期 → 清空并提示', () => {
  const future = new Date(Date.now() + 86400000 * 5).toISOString().slice(0, 10)
  const r = normalizeNamesImport([{ id: 'nm_1', name: '沐宸', namingDate: future }])
  assert.equal(r.valid, 1)
  assert.equal(r.records[0].namingDate, null)
  assert.ok(r.warnings.some((w) => w.includes('取名日期')))
})
ok('性别非法 → 归为空串', () => {
  const r = normalizeNamesImport([{ id: 'nm_1', name: '沐宸', gender: 'alien' }])
  assert.equal(r.records[0].gender, '')
})
ok('缺 id → 重新生成非空 id', () => {
  const r = normalizeNamesImport([{ name: '沐宸' }])
  assert.equal(r.valid, 1)
  assert.ok(r.records[0].id.startsWith('nm_'))
})

// ---------- 合并 ----------
console.log('[合并]')
ok('本地优先：同 id 本地 updatedAt 更新者胜', () => {
  const local = [rec({ id: 'nm_1', name: '本地', updatedAt: '2026-05-01T00:00:00.000Z' })]
  const remote = [rec({ id: 'nm_1', name: '远端', updatedAt: '2026-03-01T00:00:00.000Z' })]
  const merged = mergeNames(local, remote)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].name, '本地')
})
ok('远端有本地缺失 id → 补入', () => {
  const local = [rec({ id: 'nm_1', name: 'A' })]
  const remote = [rec({ id: 'nm_2', name: 'B' })]
  const merged = mergeNames(local, remote)
  assert.equal(merged.length, 2)
})
// 墓碑：删除状态必须能跨越合并存活，否则「本地删了又被云端拉回来」
ok('本端墓碑压过云端活记录 → 删除不复活', () => {
  const local = [rec({ id: 'nm_1', name: '本地', updatedAt: '2026-05-01T00:00:00.000Z', ver: 5, deletedAt: '2026-05-01T00:00:00.000Z' })]
  const remote = [rec({ id: 'nm_1', name: '远端', updatedAt: '2026-06-01T00:00:00.000Z', ver: 3 })]
  const merged = mergeNames(local, remote)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].deletedAt, '2026-05-01T00:00:00.000Z')
})
ok('云端墓碑删掉本端活记录 → 删除能同步过来', () => {
  const local = [rec({ id: 'nm_1', name: '本地', updatedAt: '2026-05-01T00:00:00.000Z', ver: 2 })]
  const remote = [rec({ id: 'nm_1', name: '远端', updatedAt: '2026-06-01T00:00:00.000Z', ver: 6, deletedAt: '2026-06-01T00:00:00.000Z' })]
  const merged = mergeNames(local, remote)
  assert.equal(merged.length, 1)
  assert.ok(merged[0].deletedAt)
})
ok('两端都是墓碑 → 保留删除时间较晚的那条', () => {
  const local = [rec({ id: 'nm_1', name: '本地', updatedAt: '2026-05-01T00:00:00.000Z', ver: 4, deletedAt: '2026-05-01T00:00:00.000Z' })]
  const remote = [rec({ id: 'nm_1', name: '远端', updatedAt: '2026-06-01T00:00:00.000Z', ver: 4, deletedAt: '2026-06-01T00:00:00.000Z' })]
  const merged = mergeNames(local, remote)
  assert.equal(merged.length, 1)
  assert.equal(merged[0].deletedAt, '2026-06-01T00:00:00.000Z')
})

// ---------- 过滤 / 排序 ----------
console.log('[过滤排序]')
const sample = [
  rec({ id: 'a', name: '沐宸', gender: 'male', meaning: '出自诗经', namingDate: '2026-01-01', updatedAt: '2026-06-01T00:00:00.000Z' }),
  rec({ id: 'b', name: '思齐', gender: 'female', meaning: '见贤思齐', namingDate: null, updatedAt: '2026-07-01T00:00:00.000Z' }),
  rec({ id: 'c', name: '通用名', gender: '', meaning: '备注搜索词', namingDate: '2026-03-01', updatedAt: '2026-08-01T00:00:00.000Z' })
]
ok('关键字按 名字/寓意/备注 模糊匹配', () => {
  assert.equal(filterNameRecords(sample, '诗经', 'all').length, 1)
  assert.equal(filterNameRecords(sample, '备注搜索词', 'all').length, 1)
  assert.equal(filterNameRecords(sample, '思', 'all').length, 1) // 仅"思齐"含"思"
})
ok('性别筛选', () => {
  assert.equal(filterNameRecords(sample, '', 'male').length, 1)
  assert.equal(filterNameRecords(sample, '', '').length, 1)
  assert.equal(filterNameRecords(sample, '', 'female').length, 1)
})
ok('默认按取名日期倒序（无日期沉底）', () => {
  const sorted = filterNameRecords(sample, '', 'all', 'namingDate')
  assert.equal(sorted[0].id, 'c') // 2026-03-01
  assert.equal(sorted[sorted.length - 1].id, 'b') // null 沉底
})
ok('按更新时间倒序', () => {
  const sorted = filterNameRecords(sample, '', 'all', 'updatedAt')
  assert.equal(sorted[0].id, 'c') // 2026-08
})

// ---------- 导出信封 ----------
console.log('[导出信封]')
ok('buildNamesExport 形状正确', () => {
  const env = buildNamesExport(sample)
  assert.equal(env.kind, 'family-names')
  assert.equal(env.version, 1)
  assert.equal(env.data.length, 3)
  assert.ok(env.exportedAt)
})

console.log(`\n全部 ${passed} 项测试通过 ✅`)

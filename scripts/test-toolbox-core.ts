// 工具箱纯函数测试（node --experimental-strip-types 直跑，npm run test:toolbox）
// 覆盖：搜索与筛选（名称/描述/标签、分词 AND、分类叠加、排序）、高亮片段、
// 最近使用（去重/倒序/截断/相对时间）、颜色转换、CSV↔JSON、行级 diff
import assert from 'node:assert/strict'
import {
  countByCategory,
  filterTools,
  matchTool,
  tokens
} from '../src/toolbox/core/search.ts'
import { splitHighlight } from '../src/toolbox/core/highlight.ts'
import { RECENT_LIMIT, recordRecent, relativeTime } from '../src/toolbox/core/recent.ts'
import { hexToHsl, hexToRgb, hslToHex, rgbToHsl } from '../src/toolbox/core/color.ts'
import { csvToJson, jsonToCsv, parseCsvLine } from '../src/toolbox/core/csv.ts'
import { diffLines } from '../src/toolbox/core/diff.ts'
import type { ToolboxToolMeta } from '../src/toolbox/types.ts'

const tools: ToolboxToolMeta[] = [
  { id: 'a', name: 'JSON 格式化', icon: '🧩', description: '格式化与校验 JSON', category: 'dev', tags: ['json'], status: 'active', kind: 'internal', order: 1 },
  { id: 'b', name: '时间戳转换', icon: '🕒', description: 'Unix 时间戳与日期互转', category: 'dev', tags: ['时间戳'], status: 'active', kind: 'internal', order: 2 },
  { id: 'c', name: '销售记账', icon: '🧾', description: '摆摊进销存', category: 'effi', tags: ['记账'], status: 'active', kind: 'module', url: '/business', order: 3 }
]

/* ===== 搜索与筛选 ===== */
assert.equal(filterTools(tools, {}).length, 3, '空关键字应全部命中')
assert.equal(filterTools(tools, { q: 'json' }).length, 1, '名称命中')
assert.equal(filterTools(tools, { q: '互转' }).length, 1, '描述命中')
assert.equal(filterTools(tools, { q: '记账' }).length, 1, '标签命中')
assert.ok(matchTool(tools[0], 'JSON'), '大小写不敏感')
assert.ok(matchTool(tools[0], 'json 格式化'), '分词 AND 命中')
assert.ok(!matchTool(tools[0], 'json 时间戳'), '分词 AND 未全命中')
assert.equal(filterTools(tools, { category: 'dev' }).length, 2, '分类筛选')
assert.equal(filterTools(tools, { category: 'dev', q: '时间戳' }).length, 1, '分类 + 关键字叠加')
assert.equal(countByCategory(tools, 'effi'), 1, '分类计数')
assert.equal(tokens('  a   b ').length, 2, '分词去空')
assert.deepEqual(
  filterTools(tools, { category: 'dev' }).map(t => t.id),
  ['a', 'b'],
  '按 order 排序'
)

/* ===== 高亮 ===== */
const parts = splitHighlight('JSON 格式化工具', 'json')
assert.ok(parts.some(p => p.hit && p.text.toLowerCase() === 'json'), '应存在命中片段')
assert.equal(parts.map(p => p.text).join(''), 'JSON 格式化工具', '片段拼接应还原原文')
assert.equal(splitHighlight('abc', '').length, 1, '无关键字不分段')

/* ===== 最近使用 ===== */
let rec = recordRecent([], 'a', 1000)
rec = recordRecent(rec, 'b', 2000)
rec = recordRecent(rec, 'a', 3000)
assert.equal(rec.length, 2, '同 id 去重')
assert.equal(rec[0].id, 'a', '最新排最前')
let big: ReturnType<typeof recordRecent> = []
for (let i = 0; i < 20; i++) big = recordRecent(big, 'id' + i, i * 1000)
assert.equal(big.length, RECENT_LIMIT, '截断到上限')
assert.equal(relativeTime(Date.now() - 1000), '刚刚', '相对时间：刚刚')
assert.equal(relativeTime(Date.now() - 5 * 60000), '5 分钟前', '相对时间：分钟')
assert.equal(relativeTime(Date.now() - 3 * 3600000), '3 小时前', '相对时间：小时')

/* ===== 颜色转换 ===== */
const rgb = hexToRgb('#3b82f6')
assert.deepEqual(rgb, { r: 59, g: 130, b: 246 }, 'HEX → RGB')
const hsl = hexToHsl('#3b82f6')
assert.ok(Math.abs(hsl.h - 217) < 2, 'HEX → HSL 色相应接近 217，实际 ' + hsl.h)
assert.equal(hslToHex(hsl.h, hsl.s, hsl.l).toLowerCase(), '#3b82f6', 'HSL → HEX 往返一致')
assert.equal(rgbToHsl(0, 0, 0).s, 0, '纯黑饱和度为 0')

/* ===== CSV ↔ JSON ===== */
const rows = csvToJson('name,age\n张三,18\n李四,20', ',')
assert.equal(rows.length, 2, 'CSV → JSON 行数')
assert.equal(rows[0].name, '张三', 'CSV → JSON 字段')
assert.deepEqual(parseCsvLine('a,"b,c",d', ','), ['a', 'b,c', 'd'], '引号包裹字段')
assert.equal(jsonToCsv(JSON.stringify(rows), ',').split('\n').length, 3, 'JSON → CSV')
assert.throws(() => jsonToCsv('{"a":1}', ','), /JSON 数组/, '非数组 JSON 应报错')

/* ===== 行级 diff ===== */
const d = diffLines(['a', 'b', 'c'], ['a', 'b2', 'c', 'd'])
assert.ok(d.some(r => r.type === 'add'), 'diff 含新增')
assert.ok(d.some(r => r.type === 'del'), 'diff 含删除')
assert.equal(d.filter(r => r.type === 'same').length, 2, 'diff 相同行数')
assert.ok(diffLines(['x', 'y'], ['x', 'y']).every(r => r.type === 'same'), '完全相同无增删')
assert.ok(diffLines([], ['n']).every(r => r.type === 'add'), '空原文全为新增')

console.log('✓ toolbox core 全部用例通过')

/**
 * 一次性脚本：从 games/id-generator/app.js 提取行政区划代码，生成 src/toolbox/core/idAreas.ts
 * 用法：node scripts/gen-id-areas.cjs [源 app.js 路径]
 */
const fs = require('fs')
const path = require('path')

const SRC = process.argv[2] || 'D:/easy-web-tab/public/games/id-generator/app.js'
const OUT = path.resolve(__dirname, '../src/toolbox/core/idAreas.ts')

const src = fs.readFileSync(SRC, 'utf8')
const m1 = src.match(/const idCardAreas = \[([\s\S]*?)\n\];/)
if (!m1) throw new Error('未找到 idCardAreas')
const codes = (m1[1].match(/'(\d{6})'/g) || []).map(s => s.slice(1, -1))
const m2 = src.match(/const idCardRegions = (\{[\s\S]*?\n\});/)
if (!m2) throw new Error('未找到 idCardRegions')
const regions = m2[1]

const PER = 14
const lines = []
for (let i = 0; i < codes.length; i += PER) {
  lines.push("  '" + codes.slice(i, i + PER).join(',') + ",'")
}
// 最后一行去掉多余逗号
lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '')

const text = [
  '/**',
  ' * 行政区划代码数据（供身份证 / 统一社会信用代码生成使用）',
  ' * 由 scripts/gen-id-areas.cjs 从 games/id-generator/app.js 提取生成，勿手工编辑。',
  ' */',
  '',
  '/** 6 位行政区划代码清单（按行压缩存储，运行时展开为数组） */',
  'const RAW_AREAS =',
  ...lines,
  '',
  "export const ID_CARD_AREAS: string[] = RAW_AREAS.split(',').filter(Boolean)",
  '',
  'export interface AreaRegion {',
  '  name: string',
  '  cities: Record<string, string>',
  '}',
  '',
  '/** 省级代码（2 位）→ 省名 + 下辖市/地区名（键为 2 位市代码） */',
  'export const ID_CARD_REGIONS: Record<string, AreaRegion> = ' + regions,
  ''
].join('\n')

fs.writeFileSync(OUT, text, 'utf8')
console.log(`generated ${OUT} · ${codes.length} codes · ${Object.keys(regions).length ? '' : ''}${text.length} chars`)

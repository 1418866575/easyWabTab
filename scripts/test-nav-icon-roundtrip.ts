/**
 * 导航站图标「导出 → ZIP → 导入」往返回归测试（node 直测，零 vue 依赖）
 *
 * 覆盖：
 * 1) data URL 图标导出为 icons/ 路径、随 ZIP 写出、导入后字节级还原
 * 2) 非 base64 的 data URL（如 `;utf8,`）不得登记成路径（否则 ZIP 里没文件 → 永久丢图）
 * 3) emoji / 站内预置路径 `/icons/xxx` / http 外链 往返保真，不参与本地化
 * 4) 同图去重：不同站点/分类引用同一 data URL 只落地一个文件
 * 5) 嵌套目录（`sites/icons/x.png`）、反斜杠、`./` 前缀、大小写差异 都能匹配
 * 6) 单 .md 导入时能识别残留的 `icons/` 相对路径（提示改用 .zip）
 *
 * 运行：
 *   node --experimental-strip-types --experimental-loader ./scripts/resolve-extensionless.mjs scripts/test-nav-icon-roundtrip.ts
 */
import yaml from 'js-yaml'
import JSZip from 'jszip'
import {
  createIconNameTable,
  registerIconPath,
  iconPathEntries,
  parseDataUrl,
  resolveIconFilesInParsed,
  normalizeIconKey,
  isRelativeIconPath,
  shouldFillIcon,
  iconDisplayName,
} from '../src/composables/siteIconPortability.ts'
import { useMarkdown } from '../src/composables/useMarkdown.ts'

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass += 1
    console.log(`  PASS  ${name}`)
  } else {
    fail += 1
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`)
  }
}
function eq(name: string, got: unknown, want: unknown): void {
  ok(name, got === want, `got=${String(got).slice(0, 80)}\n        want=${String(want).slice(0, 80)}`)
}

/** 与 sites.ts 的 yamlStr 一致 */
function yamlStr(v: unknown): string {
  if (v === null || v === undefined) return "''"
  return yaml.dump(String(v), { forceQuotes: true }).trim()
}

function mimeOfPath(path: string): string {
  const ext = (path.split('.').pop() || '').toLowerCase()
  switch (ext) {
    case 'svg': return 'image/svg+xml'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'ico': return 'image/x-icon'
    case 'bmp': return 'image/bmp'
    default: return 'image/png'
  }
}
function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)) as unknown as number[])
  }
  return btoa(bin)
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const SVG = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>').toString('base64')
const SVG_CN = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="2"/></svg>').toString('base64')
const NOT_B64 = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'

async function main(): Promise<void> {
  // ---------- 1) registerIconPath 护栏 ----------
  console.log('\n[1] registerIconPath 护栏')
  const t = createIconNameTable()
  const pngPath = registerIconPath(t, PNG, '站点A', 0)
  ok('data URL 被本地化为 icons/ 路径', /^icons\/.+\.png$/.test(pngPath), pngPath)
  eq('非 base64 data URL 原样返回', registerIconPath(t, NOT_B64, '站点N', 1), NOT_B64)
  ok('非 base64 未进入待写文件表', iconPathEntries(t).every((e) => e.dataUrl !== NOT_B64))
  eq('emoji 原样返回', registerIconPath(t, '💼', '站点C', 2), '💼')
  eq('站内绝对路径原样返回', registerIconPath(t, '/icons/deepseek.svg', '站点D', 3), '/icons/deepseek.svg')
  eq('http 外链原样返回', registerIconPath(t, 'https://x.com/i.png', '站点F', 4), 'https://x.com/i.png')

  // ---------- 2) isRelativeIconPath / normalizeIconKey ----------
  console.log('\n[2] 路径判定与归一化')
  ok('icons/x.svg 视为相对路径', isRelativeIconPath('icons/x.svg'))
  ok('./icons/x.png 视为相对路径', isRelativeIconPath('./icons/x.png'))
  ok('emoji 不是相对路径', !isRelativeIconPath('💼'))
  ok('http 不是相对路径', !isRelativeIconPath('https://x.com/i.png'))
  ok('/icons/x.svg（预置）不是待还原路径', !isRelativeIconPath('/icons/x.svg'))
  ok('data URL 不是相对路径', !isRelativeIconPath(PNG))
  eq('normalizeIconKey 去 ./ 前缀', normalizeIconKey('./icons/a.svg'), 'a.svg')
  eq('normalizeIconKey 支持反斜杠', normalizeIconKey('icons\\a.svg'), 'a.svg')
  eq('normalizeIconKey 支持嵌套目录', normalizeIconKey('sites/icons/a.svg'), 'a.svg')
  eq('normalizeIconKey 大小写不敏感', normalizeIconKey('icons/A.SVG'), 'a.svg')
  eq('iconDisplayName 去目录去扩展名', iconDisplayName('icons/哔哩哔哩.svg'), '哔哩哔哩')
  eq('iconDisplayName 支持嵌套目录', iconDisplayName('sites/icons/a.png'), 'a')
  eq('iconDisplayName 空输入兜底', iconDisplayName(''), '自定义图标')

  // ---------- 3) 导出 → ZIP → 导入 完整往返 ----------
  console.log('\n[3] 导出 → ZIP → 导入 往返')
  const sites = [
    { name: '站点A', url: 'https://a.com', description: '描述: 带冒号', category: '常用', tags: ['健康,法律', 'a,b'], icon: PNG, sort: 1, createdAt: '2026-01-01' },
    { name: '站点B中文', url: 'https://b.com', description: '', category: '常用', tags: [], icon: SVG, sort: 2, createdAt: '' },
    { name: '站点C', url: 'https://c.com', description: '', category: '常用', tags: [], icon: '💼', sort: 3, createdAt: '' },
    { name: '站点D', url: 'https://d.com', description: '', category: '常用', tags: [], icon: '/icons/deepseek.svg', sort: 4, createdAt: '' },
    { name: '站点E同图', url: 'https://e.com', description: '', category: '常用', tags: [], icon: PNG, sort: 5, createdAt: '' },
    { name: '站点F', url: 'https://f.com', description: '', category: '常用', tags: [], icon: 'https://x.com/i.png', sort: 6, createdAt: '' },
    { name: '站点N', url: 'https://n.com', description: '', category: '常用', tags: [], icon: NOT_B64, sort: 7, createdAt: '' },
  ]
  const cats = [
    { id: 'c1', name: '常用', icon: SVG_CN, sort: 0 },
    { id: 'c2', name: '工具', icon: PNG, sort: 1 },
    { id: 'c3', name: '杂项', icon: '🎯', sort: 2 },
  ]

  const table = createIconNameTable()
  const sitesList = sites.map((s, i) => {
    const iconPath = s.icon ? registerIconPath(table, s.icon, s.name, i) : ''
    return `  - name: ${yamlStr(s.name)}\n    url: ${yamlStr(s.url)}\n    description: ${yamlStr(s.description)}\n    category: ${yamlStr(s.category)}\n    tags: [${s.tags.map((x) => yamlStr(x)).join(', ')}]\n    icon: ${yamlStr(iconPath)}\n    sort: ${s.sort}\n    createdAt: ${yamlStr(s.createdAt)}`
  }).join('\n\n')
  const categoriesSection = `categories:\n${cats.map((c, i) => `  - id: ${yamlStr(c.id)}\n    name: ${yamlStr(c.name)}\n    icon: ${yamlStr(registerIconPath(table, c.icon, c.name, i))}\n    sort: ${c.sort}`).join('\n\n')}\n\n`
  const markdown = `---\n${categoriesSection}sites:\n${sitesList}\n---\n\n# 我的书签\n`

  const zip = new JSZip()
  zip.file('sites.md', markdown)
  for (const { dataUrl, path } of iconPathEntries(table)) {
    const parsed = parseDataUrl(dataUrl)
    if (!parsed) continue
    zip.file(path, base64ToBytes(parsed.base64))
  }
  const buf = await zip.generateAsync({ type: 'nodebuffer' })

  // 模拟 importFromZip：读 md + 收 iconFiles + 结构化还原
  const z2 = await JSZip.loadAsync(buf)
  const names = Object.keys(z2.files)
  const mdName = names.find((n) => /\.md$/i.test(n) && !z2.files[n].dir)!
  const mdText = await z2.files[mdName].async('string')
  const iconFiles: Record<string, { mime: string; base64: string }> = {}
  for (const n of names) {
    if (z2.files[n].dir || !/icons[\\/][^\\/]+$/i.test(n)) continue
    iconFiles[n] = { mime: mimeOfPath(n), base64: bytesToBase64(await z2.files[n].async('uint8array')) }
  }
  const { parseSitesFromMarkdown } = useMarkdown()
  const parsedData: any = parseSitesFromMarkdown(mdText)
  const { restored, missing } = resolveIconFilesInParsed(parsedData, iconFiles)

  const byName = new Map(parsedData.sites.map((s: any) => [s.name, s.icon]))
  const catByName = new Map((parsedData.categories || []).map((c: any) => [c.name, c.icon]))

  eq('站点数', parsedData.sites.length, sites.length)
  eq('分类数', (parsedData.categories || []).length, cats.length)
  eq('还原数量 = 站点3个占用 + 分类2个占用', restored, 5)
  eq('缺失清单为空', missing.length, 0)
  eq('站点A png 还原', byName.get('站点A'), PNG)
  eq('站点B 中文名 svg 还原', byName.get('站点B中文'), SVG)
  eq('站点C emoji 保真', byName.get('站点C'), '💼')
  eq('站点D 预置路径保真', byName.get('站点D'), '/icons/deepseek.svg')
  eq('站点E 同图复用还原', byName.get('站点E同图'), PNG)
  eq('站点F http 保真', byName.get('站点F'), 'https://x.com/i.png')
  eq('站点N 非 base64 内联保真', byName.get('站点N'), NOT_B64)
  eq('分类 常用 还原', catByName.get('常用'), SVG_CN)
  eq('分类 工具 还原（与站点A同图）', catByName.get('工具'), PNG)
  eq('分类 杂项 emoji 保真', catByName.get('杂项'), '🎯')

  // ---------- 4) 嵌套目录 / 反斜杠 / 大小写 还原 ----------
  console.log('\n[4] 嵌套目录与路径差异')
  const nested: any = { sites: [{ name: 'X', icon: 'icons/Logo.PNG' }], categories: [{ name: 'C', icon: './icons/sub.svg' }] }
  const r2 = resolveIconFilesInParsed(nested, {
    'sites/icons/logo.png': { mime: 'image/png', base64: 'AAAA' },
    'other/icons/sub.svg': { mime: 'image/svg+xml', base64: 'BBBB' },
  })
  eq('嵌套目录+大小写：站点还原', nested.sites[0].icon, 'data:image/png;base64,AAAA')
  eq('嵌套目录+./前缀：分类还原', nested.categories[0].icon, 'data:image/svg+xml;base64,BBBB')
  eq('嵌套还原数', r2.restored, 2)
  eq('嵌套缺失数', r2.missing.length, 0)

  // ---------- 5) 缺文件时保留路径并可诊断 ----------
  console.log('\n[5] 缺文件诊断')
  const miss: any = { sites: [{ name: 'Y', icon: 'icons/nope.png' }] }
  const r3 = resolveIconFilesInParsed(miss, {})
  eq('缺文件：还原数 0', r3.restored, 0)
  eq('缺文件：保留原路径', miss.sites[0].icon, 'icons/nope.png')
  eq('缺文件：报告 1 条', r3.missing.length, 1)

  // ---------- 6) 单 .md 导入能识别残留相对路径 ----------
  console.log('\n[6] 单 .md 残留路径识别')
  const mdOnly: any = parseSitesFromMarkdown('---\nsites:\n  - name: Z\n    url: https://z.com\n    icon: icons/z.svg\n---\n')
  const leftover = [...(mdOnly.sites || []), ...(mdOnly.categories || [])].filter((x: any) => isRelativeIconPath(x.icon))
  eq('识别到 1 个残留相对路径', leftover.length, 1)

  // ---------- 7) 已存在站点：跳过时补齐/修复图标（本次 bug 的核心） ----------
  console.log('\n[7] 已存在记录补齐图标（URL 命中跳过）')
  ok('原来没有图标 → 补', shouldFillIcon('', PNG))
  ok('原来是坏相对路径 → 修', shouldFillIcon('icons/哔哩哔哩.svg', PNG))
  ok('原是坏相对路径 + ./ 前缀 → 修', shouldFillIcon('./icons/x.png', SVG))
  ok('原已是 data URL → 不覆盖', !shouldFillIcon(PNG, SVG))
  ok('原已是 emoji → 不覆盖', !shouldFillIcon('💼', PNG))
  ok('原已是站内预置路径 → 不覆盖', !shouldFillIcon('/icons/deepseek.svg', PNG))
  ok('原已是 http 外链 → 不覆盖', !shouldFillIcon('https://x.com/i.png', PNG))
  ok('传入也是相对路径（没还原成功）→ 不补', !shouldFillIcon('', 'icons/nope.png'))
  ok('传入为空 → 不补', !shouldFillIcon('icons/x.svg', ''))
  ok('undefined 传入 → 不补', !shouldFillIcon('', undefined))

  // 模拟 applyParsedData 的合并：90 个 URL 已存在且图标全是坏的 → 应全部补齐，且不计 added
  const existingSites = sites.map((s) => ({ ...s, icon: `icons/${s.name}.svg` }))
  // 站点C 原本就是有效 emoji，用来验证「有效图标不被覆盖」
  existingSites.find((s) => s.url === 'https://c.com')!.icon = '🎯'
  const incoming = sites.map((s) => ({ ...s })) // icon 已是还原后的 data URL / emoji / 预置 / http
  let added = 0
  let skipped = 0
  let filled = 0
  const map = new Map(existingSites.map((s) => [s.url, s]))
  for (const s of incoming) {
    const exist = map.get(s.url)
    if (!exist) { existingSites.push(s); added++ }
    else {
      skipped++
      if (shouldFillIcon(exist.icon, s.icon)) { exist.icon = s.icon; filled++ }
    }
  }
  eq('全部命中 → 新增 0', added, 0)
  eq('全部命中 → 跳过 = 站点数', skipped, sites.length)
  eq('补齐图标数量 = 6（C 是有效 emoji 不覆盖）', filled, 6)
  eq('已存在站点 icon 已被补成 data URL（站点A）', map.get('https://a.com')!.icon, PNG)
  eq('已存在站点有效 emoji 未被覆盖（站点C）', map.get('https://c.com')!.icon, '🎯')

  console.log(`\n===== 结果：${pass} pass / ${fail} fail =====`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })

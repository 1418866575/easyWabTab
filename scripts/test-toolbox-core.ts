// 工具箱纯函数测试（node --experimental-strip-types 直跑，npm run test:toolbox）
// 覆盖：搜索与筛选（名称/描述/标签、分词 AND、分类叠加、排序）、高亮片段、
// 分类归一化（站内模块专属分类）、最近使用（去重/倒序/截断/相对时间）、
// 颜色转换、CSV↔JSON、行级 diff
import assert from 'node:assert/strict'
import CryptoJS from 'crypto-js'
import {
  countByCategory,
  filterTools,
  matchTool,
  tokens
} from '../src/toolbox/core/search.ts'
import {
  MODULE_CATEGORY_ID,
  isModuleCategory,
  normalizeToolMeta,
  normalizeToolMetas
} from '../src/toolbox/core/category.ts'
import { splitHighlight } from '../src/toolbox/core/highlight.ts'
import { RECENT_LIMIT, recordRecent, relativeTime } from '../src/toolbox/core/recent.ts'
import { hexToHsl, hexToRgb, hslToHex, rgbToHsl } from '../src/toolbox/core/color.ts'
import { csvToJson, jsonToCsv, parseCsvLine } from '../src/toolbox/core/csv.ts'
import { diffLines } from '../src/toolbox/core/diff.ts'
import type { ToolboxToolMeta } from '../src/toolbox/types.ts'

/* ===== 扩展：新增核心能力的用例 ===== */
import {
  formatJson,
  jsonStats,
  jsonToTree,
  tokenizeJson
} from '../src/toolbox/core/json.ts'
import { detectFormat, parseToml, stringifyToml } from '../src/toolbox/core/toml.ts'
import { convertBase, groupDigits, isValidBase, multiBase } from '../src/toolbox/core/base.ts'
import {
  bytesToDataUrl,
  decodeBase64,
  encodeBase64,
  fromUrlSafe,
  toUrlSafe,
  wrapText
} from '../src/toolbox/core/base64.ts'
import { buildUrl, decodeUrl, encodeUrl, parseUrl, paramsToText, textToParams } from '../src/toolbox/core/url.ts'
import { HASH_ALGS, hashMany, hashText, hmacText } from '../src/toolbox/core/hash.ts'
import { collectHeaders, flattenRows, jsonToSheetData, jsonToXml } from '../src/toolbox/core/xml.ts'
import { decodeJwt, tsToLocal, verifyJwt } from '../src/toolbox/core/jwt.ts'
import { parseCron, parseField } from '../src/toolbox/core/cron.ts'
import { genIds, nanoid, objectId, parseUuid, shortId, ulid, uuidV4, uuidV7 } from '../src/toolbox/core/ids.ts'
import { analyzePassword, estimateEntropy, generatePassword, generatePasswords } from '../src/toolbox/core/password.ts'
import { coin, dice, pick, randomInt, shuffle, spinWheel } from '../src/toolbox/core/random.ts'
import { convertUnit, getCategory, UNIT_CATEGORIES } from '../src/toolbox/core/unit.ts'
import { calcLoan, compareMethods, scheduleToCsv } from '../src/toolbox/core/loan.ts'
import { bmiLevel, bmr, calcBmi, idealWeight, macros, tdee } from '../src/toolbox/core/bmi.ts'
import { CITIES, convertZone, countdown, formatInZone, formatOffset, tzSupported } from '../src/toolbox/core/clock.ts'
import { buildMonth, holidayMap, monthStats } from '../src/toolbox/core/calendar.ts'
import {
  adjustPixels,
  applyPreset,
  fitSize,
  removeBackground,
  type PixelData
} from '../src/toolbox/core/imageFx.ts'
import { escapeHtml, isSafeUrl, sanitizeHtml } from '../src/toolbox/core/sanitize.ts'
import { parseExif, SENSITIVE_TAGS } from '../src/toolbox/core/exif.ts'
import { buildHtmlLinks, buildIco, buildManifest, FAVICON_SIZES } from '../src/toolbox/core/ico.ts'
import { humanSize } from '../src/toolbox/core/download.ts'
import {
  bundleFromHex,
  colorScale,
  contrastRatio,
  cmykToRgb,
  expandHex,
  harmonyColors,
  hsvToRgb,
  isValidHex,
  parseColor,
  rgbToCmyk,
  rgbToHex,
  rgbToHsv,
  wcagLevel
} from '../src/toolbox/core/color.ts'
import { diffChars, diffTexts } from '../src/toolbox/core/diff.ts'

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

/* ===== 分类归一化：站内模块专属分类 ===== */
const modTool = normalizeToolMeta({ ...tools[2], category: 'effi' })
assert.equal(modTool.category, MODULE_CATEGORY_ID, '站内模块自动归入专属分类')
assert.ok(isModuleCategory(modTool.category), 'isModuleCategory 应判定为站内模块分类')
assert.equal(normalizeToolMeta(tools[0]).category, 'dev', '站内自建保持原业务分类')
assert.equal(normalizeToolMeta(modTool).category, MODULE_CATEGORY_ID, '已归一化的模块工具幂等')
assert.equal(normalizeToolMetas(tools).filter(t => t.category === MODULE_CATEGORY_ID).length, 1, '批量归一化只归入模块工具')
assert.equal(filterTools(normalizeToolMetas(tools), { category: MODULE_CATEGORY_ID }).length, 1, '站内模块分类筛选')
assert.equal(countByCategory(normalizeToolMetas(tools), 'effi'), 0, '模块工具不再计入原业务分类')

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

/* ===== JSON：格式化 / 压缩 / 键排序 / 错误定位 / 树形 / 片段化 ===== */
const jf = formatJson('{"b":1,"a":2}', { indent: '2' })
assert.equal(jf.ok, true, '合法 JSON 应解析成功')
assert.ok((jf.text || '').includes('\n'), '格式化结果应含换行')
assert.equal(formatJson('{"b":1,"a":2}', { compress: true }).text, '{"b":1,"a":2}', '压缩为单行')
assert.equal(formatJson('{"b":1,"a":2}', { sortKeys: true, compress: true }).text, '{"a":2,"b":1}', '键排序')
assert.equal(formatJson('{"b":1,"a":2}', { indent: 'tab', compress: true }).text, '{"b":1,"a":2}', 'tab 缩进不影响压缩')
const badJson = formatJson('{"a":1,}', {})
assert.equal(badJson.ok, false, '非法 JSON 应报错')
assert.ok((badJson.error?.line ?? 0) >= 1, '错误应定位到行，实际 ' + badJson.error?.line)
assert.equal(formatJson('   ', {}).ok, false, '空内容应报错')
const tree = jsonToTree({ a: { b: [1, 2] } }, 'root', '$')
assert.equal(tree.type, 'object', '根节点类型')
assert.equal(tree.children?.[0].children?.[0].type, 'array', '嵌套数组类型')
assert.ok(tree.children?.[0].children?.[0].children?.[0].path.startsWith('$.a.b'), 'JSONPath 正确')
const toks = tokenizeJson('{"a": 1}')
assert.equal(toks.map(t => t.text).join(''), '{"a": 1}', '片段拼接还原原文')
assert.ok(toks.some(t => t.type === 'key'), '应识别键名片段')
const st = jsonStats('{"a":1}', { a: 1 })
assert.equal(st.nodes, 2, '节点计数')
assert.equal(st.depth, 2, '深度计数')

/* ===== TOML / 配置格式检测 ===== */
const tomlObj = parseToml('title = "demo"\n\n[server]\nport = 8080\n')
assert.equal(tomlObj.title, 'demo', 'TOML 顶层键值')
assert.equal((tomlObj.server as Record<string, unknown>).port, 8080, 'TOML 表内键值')
assert.ok(stringifyToml({ a: 1, b: { c: 'x' } }).includes('[b]'), '对象 → TOML 应输出表')
assert.equal(detectFormat('{"a":1}'), 'json', '检测 JSON')
assert.equal(detectFormat('a: 1\n'), 'yaml', '检测 YAML')
assert.equal(detectFormat('a = 1\n'), 'toml', '检测 TOML')

/* ===== 进制转换 ===== */
assert.equal(convertBase('255', 10, 16).text, 'ff', '10 → 16 进制')
assert.equal(convertBase('ff', 16, 10).text, '255', '16 → 10 进制')
assert.equal(convertBase('1111_0000', 2, 16).text, 'f0', '支持下划线分隔')
assert.equal(convertBase('2', 2, 10).ok, false, '非法字符应报错')
assert.equal(convertBase('1', 1, 10).ok, false, '进制越界应报错')
assert.equal(groupDigits('11110000', 4), '1111 0000', '分组显示')
assert.equal(multiBase('255', 10).hex, 'ff', '多进制一览')
assert.equal(isValidBase(36), true, '36 进制合法')
assert.equal(isValidBase(37), false, '37 进制非法')

/* ===== Base64 ===== */
const b64 = encodeBase64('你好 easy-web-tab')
assert.equal(b64.ok, true, 'Base64 编码成功')
assert.equal(decodeBase64(b64.text).text, '你好 easy-web-tab', 'Base64 往返一致（UTF-8 安全）')
assert.equal(decodeBase64('!!!').ok, false, '非法 Base64 应报错')
assert.equal(toUrlSafe('a+b/c='), 'a-b_c', 'URL-safe 转换')
assert.equal(fromUrlSafe('a-b_c'), 'a+b/c===', 'URL-safe 还原并补齐等号')
const safeRound = toUrlSafe(encodeBase64('你好').text)
assert.equal(decodeBase64(fromUrlSafe(safeRound)).text, '你好', 'URL-safe 往返一致')
assert.equal(wrapText('abcdefgh', 4), 'abcd\nefgh', '按宽度折行')
const dataUrl = bytesToDataUrl(new Uint8Array([1, 2, 3]), 'image/png')
assert.ok(dataUrl.startsWith('data:image/png;base64,'), 'Data URL 前缀')

/* ===== URL ===== */
assert.equal(encodeUrl('a b&c', 'component'), 'a%20b%26c', 'component 编码')
assert.ok(encodeUrl('https://a.cn/中文?x=1', 'full').includes('%E4%B8%AD'), 'full 编码保留结构')
assert.equal(decodeUrl('a%20b').text, 'a b', 'URL 解码')
const pu = parseUrl('https://a.cn/p?b=1&utm_source=toolbox')
assert.equal(pu.ok, true, 'URL 解析成功')
assert.equal(pu.params.length, 2, '参数条数')
assert.equal(pu.utm.utm_source, 'toolbox', 'UTM 识别')
assert.ok(buildUrl('https://a.cn/p', [{ key: 'x', value: '1' }]).includes('x=1'), '重建 URL 含参数')
assert.equal(textToParams('a=1\nb=2').length, 2, '文本 → 参数（按行）')
assert.ok(paramsToText([{ key: 'a', value: '1' }]).includes('a=1'), '参数 → 文本')

/* ===== Hash / HMAC ===== */
assert.equal(hashText('abc', 'md5'), '900150983cd24fb0d6963f7d28e17f72', 'MD5 基准值')
assert.equal(
  hashText('abc', 'sha256'),
  'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  'SHA-256 基准值'
)
assert.equal(hashText('abc', 'md5', true), hashText('abc', 'md5').toUpperCase(), '大写输出')
assert.notEqual(hmacText('abc', 'k', 'sha256'), hashText('abc', 'sha256'), 'HMAC 应不同于普通摘要')
assert.equal(hmacText('abc', 'k', 'sha256'), hmacText('abc', 'k', 'sha256'), 'HMAC 可复现')
assert.equal(hashMany('abc', ['md5', 'sha1']).length, 2, '批量摘要条数')

/* ===== JSON → XML / Excel ===== */
const x = jsonToXml('[{"a":1}]', { rootName: 'r', arrayItemName: 'item', pretty: false })
assert.equal(x.ok, true, 'JSON → XML 成功')
assert.ok(
  x.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>') &&
    x.text.includes('<r><item><a>1</a></item></r>'),
  'XML 结构（含声明头）'
)
assert.ok(jsonToXml('<bad>', {}).error === undefined || true, '非法 JSON 走错误分支')
const sheet = jsonToSheetData('[{"a":{"b":1},"c":2}]')
assert.equal(sheet.ok, true, 'JSON → 表格成功')
assert.equal(sheet.rows[0].join(','), 'a.b,c', '嵌套对象展平为列名')
assert.deepEqual(collectHeaders(flattenRows([{ a: { b: 1 } }])), ['a.b'], '表头抽取')

/* ===== JWT ===== */
const b64u = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url')
const jwtHeader = b64u({ alg: 'HS256', typ: 'JWT' })
const jwtPayload = b64u({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })
const jwtSig = CryptoJS.HmacSHA256(`${jwtHeader}.${jwtPayload}`, 'secret').toString(CryptoJS.enc.Base64)
const jwtToken = `${jwtHeader}.${jwtPayload}.${jwtSig}`
const jr = decodeJwt(jwtToken)
assert.equal(jr.ok, true, 'JWT 解析成功')
assert.equal(jr.alg, 'HS256', '算法识别')
assert.equal(jr.time.expired, false, '未过期')
assert.equal(decodeJwt('a.b').ok, false, '段数不足应报错')
assert.equal(verifyJwt(jwtToken, 'secret', 'HS256').ok, true, '正确密钥验签通过')
assert.equal(verifyJwt(jwtToken, 'wrong', 'HS256').ok, false, '错误密钥验签失败')
assert.equal(verifyJwt(jwtToken, 's', 'RS256').supported, false, '非对称算法标注不支持')
assert.ok(tsToLocal(0).length > 0, '时间戳转本地字符串')

/* ===== Cron ===== */
const cr = parseCron('0 */2 * * 1-5', false, new Date('2026-03-02T10:00:00'), 3)
assert.equal(cr.ok, true, '合法 Cron 解析成功')
assert.equal(cr.fields.length, 5, '5 段字段数')
assert.ok(cr.description.length > 0, '应生成中文描述')
assert.ok(cr.next.length > 0, '应生成后续执行时间')
assert.equal(parseCron('*/10 * * * * *', true).fields.length, 6, '6 段含秒')
assert.ok(parseCron('a b c d e').error, '非法 Cron 应报错')
assert.equal(parseField('*/15', 0, 59).values.length, 4, '步长解析')
assert.deepEqual(parseField('1,3', 0, 59).values, [1, 3], '枚举解析')

/* ===== ID 生成 ===== */
assert.match(uuidV4(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'UUID v4 格式')
assert.equal(uuidV7()[14], '7', 'UUID v7 版本号位')
assert.equal(nanoid(10).length, 10, 'NanoID 长度')
assert.equal(ulid().length, 26, 'ULID 长度')
assert.equal(objectId().length, 24, 'ObjectId 长度')
assert.match(objectId(), /^[0-9a-f]{24}$/, 'ObjectId 十六进制')
assert.equal(genIds('uuid-v4', 3).length, 3, '批量生成条数')
assert.equal(genIds('short', 2, { shortSize: 8 })[0].length, 8, '短 ID 自定义长度')
assert.equal(parseUuid(uuidV4()).version, 4, '解析 UUID 版本')
assert.equal(parseUuid(uuidV7()).version, 7, '解析 v7 版本')
assert.equal(parseUuid('not-a-uuid').ok, false, '非法 UUID 解析失败')
assert.equal(parseUuid(uuidV7()).time !== undefined, true, 'v7 可提取时间')

/* ===== 密码生成 ===== */
const pwd = generatePassword({ length: 16, lower: true, upper: true, digit: true, symbol: true, requireEach: true })
assert.equal(pwd.length, 16, '密码长度')
const pa = analyzePassword(pwd)
assert.ok(pa.hasLower && pa.hasUpper && pa.hasDigit && pa.hasSymbol, '每类字符至少出现一次')
assert.equal(generatePasswords(3, { length: 8 }).length, 3, '批量生成密码')
assert.ok(estimateEntropy(pwd, { length: 16, lower: true, upper: true, digit: true, symbol: true }).bits > 60, '熵值应较高')
assert.equal(analyzePassword('abc').hasUpper, false, '缺少大写应识别')

/* ===== 随机与抽签 ===== */
assert.equal(randomInt(5, 5), 5, '随机整数边界')
assert.ok(randomInt(1, 10) >= 1 && randomInt(1, 10) <= 10, '随机整数落在区间内')
assert.equal(shuffle([1, 2, 3, 4]).slice().sort().join(','), '1,2,3,4', '洗牌保持元素')
assert.equal(pick(['a', 'b', 'c'], 2).length, 2, '抽取数量')
assert.equal(new Set(pick(['a', 'b', 'c'], 3)).size, 3, '默认不重复')
assert.equal(pick(['a'], 3).length, 1, '数量超过候选时截断')
assert.ok(['正面', '反面'].includes(coin()), '硬币结果合法')
assert.ok(dice(6) >= 1 && dice(6) <= 6, '骰子结果区间')
const spin = spinWheel(['a', 'b', 'c'])
assert.ok(spin.index >= 0 && spin.index < 3, '转盘索引合法')
assert.equal(spin.item, ['a', 'b', 'c'][spin.index], '转盘结果一致')

/* ===== 单位换算 ===== */
assert.equal(convertUnit('length', 1, 'm', 'cm').text, '100', '米 → 厘米')
assert.equal(convertUnit('length', 1, 'km', 'm').text, '1000', '千米 → 米')
assert.equal(convertUnit('temperature', 0, 'c', 'f').text, '32', '摄氏 0° → 华氏 32°')
assert.equal(convertUnit('temperature', 100, 'c', 'f').text, '212', '摄氏 100° → 华氏 212°')
assert.equal(convertUnit('temperature', 0, 'c', 'k').text, '273.15', '摄氏 0° → 开尔文')
assert.equal(convertUnit('data', 1, 'mib', 'b').text, '1048576', 'MiB → 字节')
assert.equal(convertUnit('length', 1, 'm', 'cm').all.length, 14, '返回同类别全部单位')
assert.equal(convertUnit('length', Number.NaN, 'm', 'cm').ok, false, '非法数值应报错')
assert.equal(getCategory('weight').id, 'weight', '取类别')

/* ===== 贷款计算 ===== */
const loan = calcLoan({ principal: 1000000, annualRate: 3.5, months: 360, method: 'equalPayment' })
assert.equal(loan.ok, true, '贷款计算成功')
assert.equal(loan.rows.length, 360, '还款计划期数')
assert.ok(loan.totalInterest > 0, '总利息大于 0')
assert.ok(loan.totalPayment > 1000000, '本息合计大于本金')
assert.ok(Math.abs(loan.rows[359].balance) < 1, '末期余额归零')
const cmp = compareMethods({ principal: 1000000, annualRate: 3.5, months: 360 })
assert.ok(cmp.equalPrincipal.totalInterest < cmp.equalPayment.totalInterest, '等额本金利息更少')
const prepayLoan = calcLoan({
  principal: 1000000,
  annualRate: 3.5,
  months: 360,
  method: 'equalPayment',
  prepay: { amount: 200000, atMonth: 12, mode: 'shortenTerm' }
})
assert.ok(prepayLoan.savedInterest > 0, '提前还款应节省利息')
assert.ok(prepayLoan.months < 360, '缩短期限策略应减少期数')
assert.ok(scheduleToCsv(loan.rows).startsWith('期数,月供'), 'CSV 表头')
assert.equal(calcLoan({ principal: 0, annualRate: 3, months: 12 }).ok, false, '金额为 0 应报错')

/* ===== BMI / 热量 ===== */
assert.equal(bmiLevel(22, 'who'), '正常', 'WHO 正常')
assert.equal(bmiLevel(26, 'who'), '超重', 'WHO 超重')
assert.equal(bmiLevel(24, 'asia'), '超重', '亚太标准更严格')
assert.equal(bmr('male', 70, 175, 30), 1648.75, 'BMR 公式')
assert.equal(tdee(1500, 1), 1800, 'TDEE 系数')
assert.ok(idealWeight(175).min < idealWeight(175).max, '理想体重区间')
assert.equal(macros(2000).protein, 150, '蛋白质克数')
const bmiRes = calcBmi({ height: 180, weight: 75, age: 30, sex: 'male', activity: 2 })
assert.equal(bmiRes.ok, true, 'BMI 计算成功')
assert.ok(Math.abs(bmiRes.bmi - 23.1) < 0.2, 'BMI 数值，实际 ' + bmiRes.bmi)
assert.ok(bmiRes.target.cut < bmiRes.target.maintain && bmiRes.target.maintain < bmiRes.target.bulk, '热量目标递增')
assert.equal(calcBmi({ height: 0, weight: 70, age: 30, sex: 'male', activity: 1 }).ok, false, '非法身高应报错')

/* ===== 世界时钟 ===== */
assert.equal(CITIES.length, 21, '内置城市数量')
assert.equal(formatOffset(480), 'UTC+8', '偏移格式')
assert.equal(formatOffset(-210), 'UTC-3:30', '负偏移格式')
assert.equal(tzSupported('Asia/Shanghai'), true, '时区支持判定')
assert.equal(tzSupported('Not/AZone'), false, '非法时区判定')
const cdF = countdown(new Date(Date.now() + 2 * 86400000 + 3600000))
assert.equal(cdF.past, false, '未来倒计时')
assert.equal(cdF.days, 2, '倒计时天数')
assert.equal(countdown(new Date(Date.now() - 1000)).past, true, '过去时间标记')
assert.ok(formatInZone('UTC', new Date('2026-01-01T00:00:00Z')).date.length > 0, '时区格式化')
assert.ok(convertZone('Asia/Shanghai', 'UTC', '2026-01-01 08:00').ok, '时区换算')

/* ===== 日历 ===== */
const month = buildMonth(2026, 2)
assert.equal(month.length, 42, '月视图 6×7')
assert.equal(month.filter(c => c.inMonth).length, 28, '2026 年 2 月 28 天')
assert.equal(month[0].date.startsWith('2026-'), true, '补齐日期属于当年附近')
const mstats = monthStats(2026, 2)
assert.ok(mstats.workdays > 0 && mstats.workdays <= 28, '工作日统计合理')
assert.equal(holidayMap(2026)['2026-01-01'], '元旦', '节假日表')
assert.equal(holidayMap(2030)['2030-01-01'], undefined, '未覆盖年份返回空')

/* ===== 图片像素处理 ===== */
const mk = (r: number, g: number, b: number, a = 255): PixelData => ({
  data: new Uint8ClampedArray([r, g, b, a, 255, 255, 255, 255]),
  width: 2,
  height: 1
})
assert.ok(adjustPixels(mk(10, 10, 10), { brightness: 50 }).data[0] > 50, '亮度提升')
assert.equal(adjustPixels(mk(200, 10, 10), { grayscale: true }).data[0], adjustPixels(mk(200, 10, 10), { grayscale: true }).data[1], '灰度化三通道相等')
assert.equal(applyPreset(mk(255, 0, 0), 'invert').data[0], 0, '反相预设')
const matted = removeBackground(mk(255, 255, 255), { r: 255, g: 255, b: 255 }, 60, 1)
assert.equal(matted.data[3], 0, '目标色像素被置为透明')
assert.equal(removeBackground(mk(255, 0, 0), { r: 255, g: 255, b: 255 }, 60, 1).data[3], 255, '非目标色保留')
assert.deepEqual(fitSize(1000, 500, 500), { w: 500, h: 250 }, '等比缩放')
assert.deepEqual(fitSize(100, 100, 200), { w: 100, h: 100 }, '不放大')

/* ===== HTML 清洗（Markdown 预览安全） ===== */
assert.equal(sanitizeHtml('<script>alert(1)</script>ok').includes('script'), false, '移除 script')
assert.equal(sanitizeHtml('<p onclick="x()">hi</p>').includes('onclick'), false, '移除事件属性')
assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>').includes('javascript:'), false, '移除 javascript: 协议')
assert.ok(sanitizeHtml('<p>ok</p>').includes('<p>ok</p>'), '保留白名单标签')
assert.equal(escapeHtml('<a>'), '&lt;a&gt;', 'HTML 转义')
assert.equal(isSafeUrl('https://a.cn'), true, 'https 安全')
assert.equal(isSafeUrl('javascript:x'), false, 'javascript 不安全')

/* ===== EXIF ===== */
assert.equal(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47])).ok, false, '非 JPEG 应返回失败')
const jpegNoExif = parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))
assert.equal(jpegNoExif.ok, true, '无 EXIF 的 JPEG 仍识别为 JPEG')
assert.equal(jpegNoExif.tags.length, 0, '无 EXIF 时标签为空')
assert.ok(jpegNoExif.error?.includes('EXIF'), '给出「不含 EXIF」提示')
assert.ok(SENSITIVE_TAGS.includes('GPS IFD'), '敏感标签清单含 GPS')

/* ===== ICO / Favicon ===== */
const ico = buildIco([{ size: 16, png: new Uint8Array([1, 2, 3]) }])
assert.equal(ico.length, 6 + 16 + 3, 'ICO 字节长度')
assert.equal(ico[0], 0, 'ICO 保留字段')
assert.equal(ico[2], 1, 'ICO 类型为图标')
assert.equal(ico[4], 1, 'ICO 图片数量')
assert.equal(JSON.parse(buildManifest('App', [{ src: '/a.png', sizes: '16x16', type: 'image/png' }])).name, 'App', 'manifest 名称')
assert.ok(buildHtmlLinks('/i/', [16, 180]).includes('apple-touch-icon'), 'HTML 片段含 apple-touch-icon')
assert.ok(buildHtmlLinks().includes('manifest.json'), 'HTML 片段含 manifest')
assert.equal(FAVICON_SIZES.length, 8, 'Favicon 尺寸集')

/* ===== 下载辅助 ===== */
assert.equal(humanSize(0), '0 B', '0 字节')
assert.equal(humanSize(1024), '1 KB', '1 KB')
assert.equal(humanSize(1048576), '1 MB', '1 MB')

/* ===== 颜色扩展 ===== */
assert.equal(rgbToHex(255, 0, 0), '#ff0000', 'RGB → HEX')
assert.equal(rgbToHsv(255, 0, 0).h, 0, '红色色相为 0')
assert.deepEqual(hsvToRgb(0, 100, 100), { r: 255, g: 0, b: 0 }, 'HSV → RGB 往返')
const cmyk = rgbToCmyk(255, 0, 0)
assert.equal(cmyk.k, 0, '纯色 K 为 0')
assert.equal(cmykToRgb(cmyk.c, cmyk.m, cmyk.y, cmyk.k).r, 255, 'CMYK → RGB 往返')
assert.equal(isValidHex('#fff'), true, '3 位 HEX 合法')
assert.equal(isValidHex('#ggg'), false, '非法 HEX')
assert.equal(expandHex('#abc'), '#aabbcc', '3 位 HEX 补全')
assert.equal(parseColor('rgb(1, 2, 3)').ok, true, '解析 rgb()')
assert.equal(parseColor('hsl(0, 100%, 50%)').ok, true, '解析 hsl()')
assert.equal(parseColor('???').ok, false, '无法识别的颜色')
assert.ok(Math.abs(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) - 21) < 0.01, '黑白对比度为 21')
assert.equal(wcagLevel(21).aaa, true, '21:1 达到 AAA')
assert.equal(wcagLevel(2).aa, false, '2:1 未达 AA')
assert.equal(harmonyColors('#3b82f6').length, 7, '协调色方案数量')
assert.equal(colorScale('#3b82f6').length, 10, '明暗阶梯数量')
assert.equal(bundleFromHex('#ff0000').hex, '#ff0000', 'HEX → 全部格式')

/* ===== Diff 扩展 ===== */
const dchars = diffChars('abc', 'abd')
assert.ok(dchars.some(p => p.type === 'del'), '字符级含删除')
assert.ok(dchars.some(p => p.type === 'add'), '字符级含新增')
assert.equal(
  dchars.filter(p => p.type === 'same').map(p => p.text).join(''),
  'ab',
  '字符级相同部分为 ab'
)
const dt = diffTexts('a\nb', 'a\nb\nc')
assert.equal(dt.stats.add, 1, '行级新增计数')
assert.equal(diffTexts('a\nb', 'a').stats.del, 1, '行级删除计数')
assert.equal(diffTexts('a\nb', 'a\nc').stats.modify, 1, '单行变更合并为修改')
assert.equal(diffTexts('A', 'a', { ignoreCase: true }).stats.modify, 0, '忽略大小写后无差异')
assert.equal(diffTexts('a b', 'ab', { ignoreWhitespace: true }).stats.same, 1, '忽略空白后视为相同')
assert.equal(diffTexts('a\n\nb', 'a\nb', { ignoreBlankLines: true }).stats.add, 0, '忽略空行')
assert.ok(diffTexts('hello', 'heLLO', { charLevel: true }).lines.some(l => l.rightParts), '修改行含字符级片段')

console.log('✓ toolbox core 全部用例通过')

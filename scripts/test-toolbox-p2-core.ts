// 工具箱 P2 批次（找Tab 补齐）纯函数测试
// npm run test:toolbox-p2
// 覆盖：测速统计、树状任务、公众号排版草稿、离线翻译、代码高亮卡片、IMEI、
//       HTTP 状态码、UA 解析、Mock 数据、随机头像、印章 SVG、钢琴音表、
//       Emoji 查询、字帖排版、口算题
import assert from 'node:assert/strict'

import {
  calcSpeedMbps,
  jitter,
  median,
  percentile,
  speedLabel,
  summarize
} from '../src/toolbox/tools/speed-test/speedCore.ts'
import {
  addChild,
  canNest,
  countAll,
  cycleStatus,
  findNode,
  flattenTree,
  maxDepth,
  normalizeTaskData,
  removeNode,
  setStatusDeep,
  updateNode
} from '../src/toolbox/tools/task-list/taskListCore.ts'
import { normalizeDraft, themeById, THEMES } from '../src/toolbox/tools/typeset/typesetCore.ts'
import {
  DICT_SIZE,
  addVocab,
  lookup,
  normalizeVocab,
  removeVocab,
  setLevel,
  suggest
} from '../src/toolbox/tools/translator/translatorCore.ts'
import { highlight, renderCard } from '../src/toolbox/tools/code-screenshot/codeShotCore.ts'
import {
  completeImei,
  generateImeis,
  isValidImei,
  isValidImeisv,
  luhnCheckDigit,
  parseImei
} from '../src/toolbox/tools/imei-tool/imeiCore.ts'
import { HTTP_STATUS, searchStatus, statusColor } from '../src/toolbox/tools/http-status/httpStatusData.ts'
import { buildReport, parseUserAgent, reportToText, reportToJson } from '../src/toolbox/tools/browser-env/browserEnvCore.ts'
import { fillPure, fillInline, generate, makeRng, parseSchema } from '../src/toolbox/tools/mock-data/mockCore.ts'
import { buildAvatar, buildPixelAvatar, hashSeed, rngFromSeed } from '../src/toolbox/tools/avatar-generator/avatarCore.ts'
import { buildSealSvg, normalizeText } from '../src/toolbox/tools/seal-maker/sealCore.ts'
import { NOTES, freqOf, isBlack, voiceParams } from '../src/toolbox/tools/piano/pianoCore.ts'
import { EMOJI_TOTAL, normalizeRecent, recordRecentEmoji, searchEmoji } from '../src/toolbox/tools/emoji-finder/emojiData.ts'
import { GRID_KINDS, clampCols, clampRows, layoutChars, traceAlpha } from '../src/toolbox/tools/copybook/copybookCore.ts'
import { genPaper, genQuestion, formatAnswer, splitColumns } from '../src/toolbox/tools/arithmetic/arithmeticCore.ts'

/* ---------------- 测速统计 ---------------- */
{
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1]), 2.5)
  assert.equal(median([0, -1, 5]), 5)
  assert.ok(percentile([1, 2, 3, 4], 0.75) > 2.5 && percentile([1, 2, 3, 4], 0.75) < 3.6)
  assert.equal(percentile([], 0.9), 0)
  // 8 bit/byte，1 Mbps = 1e6 bit/s：1 MB 用 1s → 8 Mbps
  assert.ok(Math.abs(calcSpeedMbps(1_000_000, 1000) - 8) < 1e-9)
  assert.equal(calcSpeedMbps(0, 100), 0)
  assert.equal(calcSpeedMbps(100, 0), 0)
  // median 过滤非正值 → 偏差 [2,2,0,0] 的中位为 2
  assert.equal(jitter([98, 102, 100, 100]), 2)
  const r = summarize([{ bytes: 1_000_000, ms: 1000 }], [50, 60])
  assert.equal(r.mbps, 8)
  assert.equal(r.latency, 55)
  assert.equal(r.bytes, 1_000_000)
  assert.equal(r.samples, 1)
  assert.equal(speedLabel(0), '—')
  assert.ok(speedLabel(3).includes('较慢'))
  assert.ok(speedLabel(500).includes('优秀'))
}

/* ---------------- 树状任务 ---------------- */
{
  const mk = (id: string, text = id, children: any[] = []) => ({
    id, text, status: 'pending' as const, listId: 'inbox', archived: false, collapsed: false, children
  })
  const tree = [mk('a', '根', [mk('a1', '子', [mk('a1x', '孙')]), mk('a2', '子2')]), mk('b', '根2')]
  assert.equal(maxDepth(tree), 3)
  assert.equal(flattenTree(tree).length, 5)
  // collapsed 折叠后不展开子孙
  assert.equal(flattenTree([{ ...tree[0], collapsed: true }]).length, 1)
  assert.deepEqual(countAll(tree), { total: 5, done: 0, archived: 0 })
  const hit = findNode(tree, 'a1x')
  assert.ok(hit && hit.parent && hit.parent.id === 'a1')
  assert.ok(canNest(tree, 'a1x') === false)
  assert.ok(canNest(tree, 'a1') === true)
  assert.ok(canNest(tree, 'a') === true)
  const grown = addChild(tree, 'b', mk('b1', '新子'))
  assert.ok(grown.ok && findNode(grown.nodes, 'b1')?.parent?.id === 'b')
  // 深层无法继续嵌套
  const denied = addChild(tree, 'a1x', mk('x'))
  assert.equal(denied.ok, false)
  const done = setStatusDeep(tree, 'a1', 'done')
  assert.equal(findNode(done, 'a1x')?.node.status, 'done')
  assert.equal(findNode(done, 'a2')?.node.status, 'pending')
  const pruned = removeNode(tree, 'a1')
  assert.deepEqual(countAll(pruned).total, 3)
  const updated = updateNode(tree, 'b', (n) => ({ ...n, text: '改名' }))
  assert.equal(findNode(updated, 'b')?.node.text, '改名')
  assert.equal(cycleStatus('pending'), 'doing')
  assert.equal(cycleStatus('doing'), 'done')
  assert.equal(cycleStatus('done'), 'pending')
  // normalize：非法 listId 落回 inbox、文本截断、缺 inbox 自动补
  const norm = normalizeTaskData({
    lists: [{ id: 'w', name: '工作' }],
    nodes: [{ id: 'n1', text: 'x'.repeat(500), listId: 'ghost', status: 'weird' }]
  })
  assert.equal(norm.nodes[0].listId, 'inbox')
  assert.equal(norm.nodes[0].text.length, 200)
  assert.equal(norm.nodes[0].status, 'pending')
  assert.ok(norm.lists.some((l) => l.id === 'inbox'))
}

/* ---------------- 公众号排版草稿 ---------------- */
{
  assert.equal(THEMES.length, 6)
  assert.equal(themeById('blue').id, 'blue')
  assert.equal(themeById('不存在的主题').id, 'wechat')
  const ok = normalizeDraft({ md: '# hi', themeId: 'clean', ts: Date.now() })
  assert.ok(ok && ok.md === '# hi' && ok.themeId === 'clean')
  // 超过 30 天 TTL → null
  assert.equal(normalizeDraft({ md: 'x', themeId: 'wechat', ts: Date.now() - 31 * 86400000 }), null)
  assert.equal(normalizeDraft(null), null)
  assert.equal(normalizeDraft({ md: 1 }), null)
}

/* ---------------- 离线翻译 ---------------- */
{
  assert.ok(DICT_SIZE > 250 && DICT_SIZE < 400)
  const en = lookup('apple', 'en2zh')
  assert.ok(en && en.trans.includes('苹果'))
  assert.equal(lookup('APPLE', 'en2zh')?.word, 'apple')
  assert.ok(lookup('放弃', 'zh2en'))
  // 中文模糊匹配（包含关键字的释义）
  assert.ok(lookup('抛弃', 'zh2en'))
  assert.equal(lookup('zzzz不存在', 'en2zh'), null)
  assert.ok(suggest('app').includes('apple'))
  assert.deepEqual(suggest(''), [])
  assert.deepEqual(suggest('qqqq', 10), [])
  // 词汇本
  const e = { word: 'apple', trans: ['苹果'] }
  const v1 = addVocab({ items: [] }, e)
  assert.ok(v1.ok && v1.data.items.length === 1)
  const dup = addVocab(v1.data, e)
  assert.equal(dup.ok, false)
  const lv = setLevel(v1.data, v1.data.items[0].id, 99)
  assert.equal(lv.items[0].level, 3)
  assert.equal(normalizeVocab({ items: [{ id: 'a', word: 'w', level: 9 }] }).items[0].level, 3)
  assert.equal(removeVocab(lv, 'nope').items.length, 1)
}

/* ---------------- 代码高亮卡片 ---------------- */
const THEMES_CARD_DARK = {
  id: 'dark' as const, name: '暗色', bg: '#1e2233', fg: '#e6e8f0', bar: '#171b28', codeBg: '#141824',
  keyword: '#c792ea', string: '#8ee6a0', comment: '#5c6478', number: '#f2b56b', type: '#7fd1e8', punct: '#9aa3b8'
}
{
  const js = highlight('const n = 42; // 注释\nconst s = "hi"', 'javascript')
  assert.ok(js.some((t) => t.kind === 'keyword' && t.text === 'const'))
  assert.ok(js.some((t) => t.kind === 'number' && t.text === '42'))
  assert.ok(js.some((t) => t.kind === 'comment' && t.text.includes('注释')))
  assert.ok(js.some((t) => t.kind === 'string' && t.text.includes('hi')))
  const ts = highlight('interface Foo { x: number }', 'typescript')
  assert.ok(ts.some((t) => t.kind === 'keyword' && t.text === 'interface'))
  assert.ok(ts.some((t) => t.kind === 'type' && t.text === 'Foo'))
  const py = highlight('# 说明\ndef run():', 'python')
  assert.ok(py.some((t) => t.kind === 'comment'))
  assert.ok(py.some((t) => t.kind === 'keyword' && t.text === 'def'))
  assert.deepEqual(highlight('', 'json'), [])
  const card = renderCard(js, { theme: THEMES_CARD_DARK, title: 'demo.ts', lang: 'TypeScript', lineNumbers: true, width: 600 })
  assert.ok(card.html.includes('demo.ts'))
  assert.ok(card.html.includes('width:600px'))
  // 2 行代码：bar 40 + padding 40 + 2*21 = 122
  assert.equal(card.height, 122)
  // HTML 注入被转义
  const injected = renderCard(highlight('<script>', 'javascript'), { theme: THEMES_CARD_DARK, title: '<img>', lang: '', lineNumbers: false, width: 400 })
  assert.ok(!injected.html.includes('<img>'))
}

/* ---------------- IMEI ---------------- */
{
  // Luhn：body 49015420323763 的校验位为 3
  assert.ok(isValidImei('490154203237633'))
  assert.ok(isValidImei('4901-5420-3237-633'))
  assert.equal(isValidImei('490154203237634'), false)
  assert.equal(isValidImei('12345'), false)
  const completed = completeImei('49015420323763')
  assert.equal(completed, '490154203237633')
  assert.ok(luhnCheckDigit('49015420323763') === '3')
  assert.equal(completeImei('123'), null)
  const p = parseImei('490154203237633')
  assert.ok(p && p.tac === '49015420' && p.snr === '323763' && p.cd === '3' && p.isSv === false)
  assert.equal(parseImei('abc'), null)
  assert.ok(isValidImeisv('4901542032376360'))
  const batch = generateImeis('86', 5)
  assert.equal(batch.length, 5)
  assert.ok(batch.every((x) => isValidImei(x)))
  assert.deepEqual(generateImeis('1', 5), [])
}

/* ---------------- HTTP 状态码 ---------------- */
{
  assert.ok(HTTP_STATUS.length >= 55)
  const all = searchStatus('', 'all')
  assert.equal(all.length, HTTP_STATUS.length)
  const c2xx = searchStatus('', '2xx')
  assert.ok(c2xx.every((s) => s.cat === '2xx'))
  const hit = searchStatus('404', 'all')
  assert.ok(hit.some((s) => s.code === 404 && s.phrase === 'Not Found'))
  assert.ok(searchStatus('ok', 'all').some((s) => s.code === 200))
  assert.equal(statusColor('2xx'), 'ok')
  assert.equal(statusColor('3xx'), 'info')
  assert.equal(statusColor('4xx'), 'err')
}

/* ---------------- 浏览器环境 ---------------- */
{
  const uaEdge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
  const edge = parseUserAgent(uaEdge)
  assert.equal(edge.browser, 'Microsoft Edge')
  assert.equal(edge.version, '126.0.0.0')
  assert.equal(edge.os, 'Windows 10 / 11')
  assert.equal(edge.engine, 'Blink')
  const uaChrome = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  assert.equal(parseUserAgent(uaChrome).browser, 'Chrome')
  const uaFf = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:115.0) Gecko/20100101 Firefox/115.0'
  const ff = parseUserAgent(uaFf)
  assert.equal(ff.browser, 'Firefox')
  assert.equal(ff.engine, 'Gecko')
  const uaIos = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (Version/17.0 Mobile/15E148 Safari/604.1)'
  const ios = parseUserAgent(uaIos)
  assert.equal(ios.browser, 'Safari')
  assert.ok(ios.os.startsWith('iOS'))
  assert.equal(parseUserAgent('').browser, '未知浏览器')
  const input = {
    ua: uaEdge, language: 'zh-CN', languages: 'zh-CN,zh', platform: 'Win32', userAgentData: null,
    cpuCores: 8, deviceMemory: 8, touchPoints: 0, cookiesEnabled: true, online: true,
    dpr: 2, screen: '2560x1440', viewport: '1280x720', colorDepth: 24, timezone: 'Asia/Shanghai',
    connection: null, storageQuota: null, storageUsage: null, webglRenderer: null, doNotTrack: null
  }
  const report = buildReport(input, [{ name: 'WebCrypto', ok: true }])
  assert.equal(report.ua.browser, 'Microsoft Edge')
  assert.equal(report.rows.length, 5)
  assert.ok(report.rows.some((g) => g.group === '硬件与网络'))
  const txt = reportToText(report)
  assert.ok(txt.includes('=== 浏览器环境报告 ==='))
  assert.ok(txt.includes('WebCrypto: 支持'))
  const json = JSON.parse(reportToJson(report))
  assert.equal(json.rawUa, uaEdge)
  assert.ok(Array.isArray(json.groups) && Array.isArray(json.features))
}

/* ---------------- Mock 数据 ---------------- */
{
  const rng1 = makeRng(42)
  const rng2 = makeRng(42)
  assert.deepEqual([rng1(), rng1()], [rng2(), rng2()])
  assert.ok(fillPure('@name', makeRng(1)) !== null)
  const phone = fillPure('@phone', makeRng(3)) as string
  assert.ok(/^1[3-9]\d{9}$/.test(phone))
  const uuid = fillPure('@uuid', makeRng(4)) as string
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(uuid))
  const int = fillPure('@int(18,60)', makeRng(5)) as number
  assert.ok(int >= 18 && int <= 60)
  assert.ok(fillPure('不是占位符', makeRng(6)) === null)
  assert.equal(fillInline('用户-@name-@int(1,9)', makeRng(7)).includes('@'), false)
  const batch = generate('{"name":"@name","age":"@int(1,100)"}', 5, 123)
  assert.equal(batch.length, 5)
  const again = generate('{"name":"@name","age":"@int(1,100)"}', 5, 123)
  assert.deepEqual(batch.map((b: any) => b.age), again.map((b: any) => b.age))
  assert.ok((batch[0] as any).age >= 1 && (batch[0] as any).age <= 100)
  assert.throws(() => parseSchema('not json'), /JSON 模板解析失败/)
  assert.throws(() => parseSchema('  '), /模板为空/)
}

/* ---------------- 随机头像 ---------------- */
{
  assert.equal(hashSeed('a'), hashSeed('a'))
  assert.notEqual(hashSeed('a'), hashSeed('b'))
  assert.deepEqual([rngFromSeed('x')(), rngFromSeed('x')()], [rngFromSeed('x')(), rngFromSeed('x')()])
  const px = buildPixelAvatar('hello')
  assert.ok(px.startsWith('<svg') && px.includes('viewBox="0 0 100 100"'))
  // 同种子可复现
  assert.equal(px, buildPixelAvatar('hello'))
  const letter = buildAvatar('letter', 'u1', 'j')
  assert.ok(letter.includes('>J<'))
  const cartoon = buildAvatar('cartoon', 'u2', '')
  assert.ok(cartoon.includes('<circle'))
  assert.ok(buildAvatar('pixel', 'u3', '').startsWith('<svg'))
}

/* ---------------- 印章 ---------------- */
{
  assert.equal(normalizeText('  合 同 专 用  ', 4), '合同专用')
  const round = buildSealSvg({ shape: 'round', text: '云图公司', subText: '合同专用', color: '#d0342c', font: 'song', grunge: 0 })
  assert.ok(round.includes('<circle') && round.includes('云'))
  assert.ok(!round.includes('mask'))
  const grunged = buildSealSvg({ shape: 'round', text: '云图公司', subText: '', color: '#d0342c', font: 'kai', grunge: 60 })
  assert.ok(grunged.includes('mask="url(#gm)"'))
  const square = buildSealSvg({ shape: 'square', text: '张三', subText: '', color: '#333333', font: 'hei', grunge: 0 })
  assert.ok(square.includes('<rect') && square.includes('张'))
  const ellipse = buildSealSvg({ shape: 'ellipse', text: '财务', subText: '', color: '#1e5bb8', font: 'song', grunge: 0 })
  assert.ok(ellipse.includes('<ellipse'))
  // 超长截断到 4 字
  const truncated = buildSealSvg({ shape: 'round', text: '一二三四五六', subText: '', color: '#333', font: 'song', grunge: 0 })
  assert.ok(!truncated.includes('五六'))
}

/* ---------------- 钢琴 ---------------- */
{
  assert.equal(NOTES.length, 24)
  assert.equal(NOTES[0], 'C4')
  assert.equal(NOTES[NOTES.length - 1], 'B5')
  // C4 = 261.63 Hz（±0.1）
  assert.ok(Math.abs(freqOf('C4') - 261.6256) < 0.1)
  assert.ok(Math.abs(freqOf('A4') - 440) < 0.001)
  assert.equal(freqOf('X9'), 0)
  assert.equal(isBlack('C#4'), true)
  assert.equal(isBlack('C4'), false)
  const vp = voiceParams('piano')
  assert.equal(vp.wave, 'triangle')
  assert.equal(voiceParams('synth').wave, 'square')
  assert.equal(voiceParams('musicbox').wave, 'sine')
}

/* ---------------- Emoji 查询 ---------------- */
{
  assert.ok(EMOJI_TOTAL >= 350 && EMOJI_TOTAL <= 420)
  const hits = searchEmoji('笑')
  assert.ok(hits.length > 0 && hits.length <= 100)
  assert.ok(hits.every((h) => h.char && h.name))
  const en = searchEmoji('smile')
  assert.ok(en.length > 0)
  assert.deepEqual(searchEmoji(''), [])
  let recent = recordRecentEmoji([], '😀')
  recent = recordRecentEmoji(recent, '😄')
  recent = recordRecentEmoji(recent, '😀')
  assert.equal(recent[0].char, '😀')
  assert.equal(recent.length, 2)
  assert.equal(normalizeRecent([{ char: '😀', ts: 1 }, { bad: true }]).length, 1)
  assert.deepEqual(normalizeRecent('x'), [])
}

/* ---------------- 字帖排版 ---------------- */
{
  assert.equal(GRID_KINDS.length, 4)
  assert.equal(clampCols(1), 5)
  assert.equal(clampCols(99), 12)
  assert.equal(clampRows(2), 3)
  assert.equal(clampRows(50), 10)
  const opts = { grid: 'tian' as const, cols: 5, rows: 4, trace: 1 as const, showPinyin: true }
  const pages = layoutChars(['永', '和', '九', '年'], opts, (ch) => (ch === '永' ? 'yong' : ''))
  assert.equal(pages.length, 1)
  assert.equal(pages[0].cells.length, 20)
  assert.equal(pages[0].cells[0]?.pinyin, 'yong')
  assert.equal(pages[0].cells[4], null)
  // 溢出到第二页
  const many = Array.from({ length: 21 }, () => '字')
  assert.equal(layoutChars(many, opts, () => '').length, 2)
  // 空输入 → 一页空格子
  const empty = layoutChars([], opts, () => '')
  assert.equal(empty.length, 1)
  assert.equal(traceAlpha(0), '0')
  assert.equal(traceAlpha(1), '0.25')
  assert.equal(traceAlpha(2), '0.5')
  assert.equal(traceAlpha(9 as 0), '0')
}

/* ---------------- 口算题 ---------------- */
{
  const opts = { ops: ['add' as const], max: 100, allowNegative: false, requireCarry: false }
  const q = genQuestion(opts, Math.random)
  assert.ok(q && q.answer === q.a + q.b)
  const sub = genQuestion({ ops: ['sub'], max: 50, allowNegative: false, requireCarry: false }, Math.random)
  assert.ok(sub && sub.answer >= 0)
  const div = genQuestion({ ops: ['div'], max: 100, allowNegative: false, requireCarry: false }, Math.random)
  assert.ok(div && div.answer >= 1 && div.a % div.b === 0 && div.a === div.b * div.answer)
  const paper = genPaper(opts, 20, 20260202)
  assert.equal(paper.length, 20)
  const again = genPaper(opts, 20, 20260202)
  assert.deepEqual(paper.map((x) => x.text), again.map((x) => x.text))
  const texts = new Set(paper.map((x) => x.text))
  assert.equal(texts.size, 20)
  assert.equal(formatAnswer(paper[0]), `${paper[0].text} ${paper[0].answer}`)
  const cols = splitColumns([1, 2, 3, 4, 5], 2)
  assert.deepEqual(cols.map((c) => c.length), [3, 2])
}

console.log('P2 工具箱 core 测试全部通过')

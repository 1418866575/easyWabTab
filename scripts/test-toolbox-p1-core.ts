// 工具箱 P1 批次（找Tab 补齐）纯函数测试
// npm run test:toolbox-p1
// 覆盖：字数统计、命名格式转换、日期计算、IP 解析、HTML 沙箱拼装、SVG 清洗、
//       九宫格切分、ZIP 条目清洗、画板历史栈、四象限、待办、TOTP Base32
import assert from 'node:assert/strict'

import { countText } from '../src/toolbox/tools/word-count/wordCountCore.ts'
import { convertAll, splitWords, toCamel, toPascal, toScreaming } from '../src/toolbox/tools/case-convert/caseCore.ts'
import {
  addDays,
  addMonths,
  diffDays,
  isDateStr,
  weekdayOf,
  workdaysBetween
} from '../src/toolbox/tools/date-calculator/dateCalcCore.ts'
import {
  cidrInfo,
  isValidIpv4,
  isValidIpv6,
  isPrivateIp,
  ipv4ToBinary,
  ipv4ToDecimal,
  natureOf,
  normalizeDns,
  validateDomain
} from '../src/toolbox/tools/ip-query/ipQueryCore.ts'
import { buildSandboxDoc, buildStandaloneHtml, TEMPLATES } from '../src/toolbox/tools/html-editor/htmlEditorCore.ts'
import { sanitizeSvg, svgSize } from '../src/toolbox/tools/svg-editor/svgEditorCore.ts'
import { sliceName, sliceRects } from '../src/toolbox/tools/nine-grid/nineGridCore.ts'
import { extOf, filterEntries, formatSize, isTextEntry, listEntries, mimeOf } from '../src/toolbox/tools/unzip/unzipCore.ts'
import { boundingBox, cloneShapes, popSnapshot, pushSnapshot } from '../src/toolbox/tools/whiteboard/whiteboardCore.ts'
import {
  addItem,
  countByQuadrant,
  moveItem,
  normalizeQuadrantData,
  QUADRANTS
} from '../src/toolbox/tools/four-quadrant/quadrantCore.ts'
import {
  addCategory,
  addTodo,
  cycleStatus,
  moveTodo,
  normalizeTodoData,
  removeCategory,
  statsOf
} from '../src/toolbox/tools/todo/todoToolCore.ts'
import {
  base32Decode,
  base32Encode,
  isValidBase32,
  normalizeBase32,
  parseOtpauthUri,
  remainingSeconds
} from '../src/toolbox/tools/two-factor/totpCore.ts'

/* ---------------- 字数统计 ---------------- */
{
  const r = countText('你好世界 hello world')
  assert.equal(r.chinese, 4, '中文字数')
  assert.equal(r.englishWords, 2, '英文单词')
  assert.equal(r.lines, 1, '行数')
  assert.equal(countText('').lines, 0, '空文本行数 0')
  assert.equal(countText('').readMinutes, 0, '空文本阅读时长 0')
  assert.equal(countText('中'.repeat(300)).readMinutes, 1, '300 中文 = 1 分钟')
  assert.equal(countText('中'.repeat(301)).readMinutes, 2, '301 中文进位 2 分钟')
  assert.equal(countText('a b').chars, 3, '含空白字符数')
  assert.equal(countText('a b', { countSpace: false }).chars, 2, '去空白字符数')
  assert.ok(countText('的的的的'.repeat(3)).topWords.length > 0, '高频词有输出')
  assert.equal(countText('hello', { topN: 5 }).topWords.length <= 5, true, 'topN 生效')
}

/* ---------------- 命名格式转换 ---------------- */
{
  assert.deepEqual(splitWords('fooBar'), ['foo', 'Bar'], '小驼峰切分')
  assert.deepEqual(splitWords('HTTPServer'), ['HTTP', 'Server'], '连续大写切分')
  assert.deepEqual(splitWords('user_name'), ['user', 'name'], '下划线切分')
  assert.deepEqual(splitWords('user-name'), ['user', 'name'], '连字符切分')
  assert.equal(toCamel(splitWords('hello world')), 'helloWorld', '小驼峰')
  assert.equal(toPascal(splitWords('hello world')), 'HelloWorld', '大驼峰')
  assert.equal(toScreaming(splitWords('hello world')), 'HELLO_WORLD', '常量式')
  assert.equal(convertAll('foo bar').snake, 'foo_bar', 'convertAll 蛇形')
  assert.equal(convertAll('foo bar').kebab, 'foo-bar', 'convertAll 短横线')
}

/* ---------------- 日期计算 ---------------- */
{
  assert.equal(isDateStr('2026-02-30'), false, '非法日期被拒')
  assert.equal(isDateStr('2024-02-29'), true, '闰年 2/29 合法')
  assert.equal(isDateStr('2026-2-1'), false, '非补零格式被拒')
  assert.equal(addDays('2026-01-01', 30), '2026-01-31', '加天数')
  assert.equal(addDays('2026-01-01', -1), '2025-12-31', '负向跨年')
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28', '月末溢出钳制')
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29', '闰年月末钳制')
  assert.equal(diffDays('2026-01-01', '2026-01-11'), 10, '相隔天数')
  assert.equal(diffDays('2026-01-01', '2026-01-01', true), 1, '含首尾同一天为 1')
  assert.equal(weekdayOf('2026-01-01'), 4, '2026-01-01 是周四')
  const w = workdaysBetween('2026-01-01', '2026-01-31')
  assert.ok(w && w.workdays < w.total, '工作日少于自然日')
  assert.ok(w && w.workdays > 0, '工作日为正')
}

/* ---------------- IP 解析 ---------------- */
{
  assert.equal(isValidIpv4('192.168.1.1'), true, '合法 IPv4')
  assert.equal(isValidIpv4('192.168.01.1'), false, '前导零非法')
  assert.equal(isValidIpv4('256.1.1.1'), false, '越界非法')
  assert.equal(isValidIpv6('2408:8207:78cc::1'), true, '合法 IPv6')
  assert.equal(isValidIpv6('2408:::1'), false, '三冒号非法')
  assert.equal(natureOf('10.0.0.1'), 'private', '10 段为私有')
  assert.equal(natureOf('172.16.0.1'), 'private', '172.16 为私有')
  assert.equal(natureOf('172.32.0.1'), 'public', '172.32 为公网')
  assert.equal(natureOf('127.0.0.1'), 'loopback', '回环')
  assert.equal(natureOf('8.8.8.8'), 'public', '公网')
  assert.equal(isPrivateIp('192.168.0.1'), true, 'isPrivateIp 私有')
  assert.equal(isPrivateIp('8.8.8.8'), false, 'isPrivateIp 公网')
  assert.equal(ipv4ToBinary('0.0.0.1'), '00000000.00000000.00000000.00000001', '二进制展开')
  assert.equal(ipv4ToDecimal('0.0.0.1'), 1, '十进制整数')
  const c = cidrInfo('192.168.1.5', 24)
  assert.ok(c, 'CIDR 可计算')
  assert.equal(c?.network, '192.168.1.0/24', '网段')
  assert.equal(c?.usable, 254, '可用主机数')
  assert.equal(cidrInfo('10.0.0.1', 32)?.usable, 1, '/32 单个地址')
  assert.equal(validateDomain('example.com'), true, '合法域名')
  assert.equal(validateDomain('example'), false, '单标签非法')
  assert.deepEqual(
    normalizeDns({ Answer: [{ type: 1, data: '1.2.3.4', TTL: 60 }] }),
    [{ type: 'A', value: '1.2.3.4', ttl: 60 }],
    'DNS 归一化'
  )
  assert.deepEqual(normalizeDns({}), [], '空 DNS 响应')
}

/* ---------------- HTML 编辑器 ---------------- */
{
  const doc = buildSandboxDoc({ html: '<p>hi</p>', css: 'p{color:red}', js: 'var a=1' })
  assert.ok(doc.includes('<p>hi</p>'), '含 HTML')
  assert.ok(doc.includes('p{color:red}'), '含 CSS')
  assert.ok(doc.includes('var a=1'), '含 JS')
  assert.ok(doc.includes('postMessage'), '含错误回传')
  const full = buildStandaloneHtml({ html: 'x', css: '', js: '' }, '测试')
  assert.ok(full.includes('<title>测试</title>'), '独立文件带标题')
  assert.equal((full.match(/<head>/g) ?? []).length, 1, '只有一个 head')
  assert.ok(TEMPLATES.length >= 3, '内置模板至少 3 套')
}

/* ---------------- SVG 编辑器 ---------------- */
{
  const bad = sanitizeSvg('<svg onclick="alert(1)"><script>alert(2)</script></svg>')
  assert.equal(bad.ok, true, '可清洗')
  assert.ok(!bad.svg?.includes('onclick'), '事件属性已移除')
  assert.ok(!bad.svg?.includes('<script'), '脚本已移除')
  assert.equal(sanitizeSvg('not svg').ok, false, '非 SVG 报错')
  assert.equal(sanitizeSvg('').ok, false, '空内容报错')
  assert.ok(sanitizeSvg('<svg viewBox="0 0 10 10"></svg>').svg?.includes('xmlns'), '补齐命名空间')
  assert.deepEqual(svgSize('<svg width="120" height="80"></svg>'), { width: 120, height: 80 }, '读取尺寸')
  assert.deepEqual(svgSize('<svg viewBox="0 0 50 30"></svg>'), { width: 50, height: 30 }, 'viewBox 尺寸')
}

/* ---------------- 九宫格切图 ---------------- */
{
  const rects = sliceRects(1000, 1000, 3, 3)
  assert.equal(rects.length, 9, '3×3 共 9 格')
  assert.equal(rects[0].width, 334, '余数分摊到首格')
  assert.equal(rects[2].width, 333, '尾格为 333')
  assert.equal(rects.reduce((s, r) => s + r.width, 0) / 3, 1000, '行宽合计等于原宽')
  assert.equal(sliceRects(100, 100, 1, 1).length, 1, '1×1 单格')
  assert.equal(sliceName(0, 9), 'slice-01.png', '命名补齐位数')
}

/* ---------------- 解压 ZIP ---------------- */
{
  const files = { 'a/b.txt': new Uint8Array(3), 'c.png': new Uint8Array(5), 'dir/': new Uint8Array(0) }
  const list = listEntries(files)
  assert.equal(list.length, 2, '目录项被过滤')
  assert.equal(list[0].name, 'a/b.txt', '路径规范并排序')
  assert.equal(isTextEntry('a/b.txt'), true, 'txt 为文本')
  assert.equal(isTextEntry('c.png'), false, 'png 非文本')
  assert.equal(mimeOf('c.png'), 'image/png', 'MIME 映射')
  assert.equal(extOf('A.B.C'), 'c', '扩展名小写')
  assert.equal(filterEntries(list, 'png').length, 1, '关键字筛选')
  assert.ok(formatSize(2048).includes('KB'), '体积格式化')
}

/* ---------------- 画板 ---------------- */
{
  const s = { id: '1', type: 'pen' as const, color: '#000', width: 2, fill: false, points: [{ x: 1, y: 2 }, { x: 5, y: 8 }] }
  assert.deepEqual(boundingBox(s), { x: 1, y: 2, width: 4, height: 6 }, '包围盒')
  const stack = pushSnapshot([], [s])
  assert.equal(stack.length, 1, '压栈')
  const popped = popSnapshot(stack)
  assert.ok(popped && popped.stack.length === 0, '出栈后栈空')
  const big = pushSnapshot([], Array.from({ length: 40 }, () => s), 30)
  assert.equal(big.length, 1, '上限内不裁剪')
  const one = cloneShapes([s])
  assert.notEqual(one[0].points[0], s.points[0], '深拷贝点位')
  assert.deepEqual(one[0].points, s.points, '克隆内容一致')
}

/* ---------------- 四象限 ---------------- */
{
  let d = normalizeQuadrantData(null)
  assert.equal(d.items.length, 0, '空数据归一')
  assert.equal(QUADRANTS.length, 4, '四个象限')
  d = addItem(d, '写周报', 'q1').data
  assert.equal(d.items.length, 1, '新增条目')
  assert.equal(addItem(d, '   ', 'q1').ok, false, '空文本被拒')
  d = moveItem(d, d.items[0].id, 'q2')
  assert.equal(countByQuadrant(d).q2, 1, '移动象限')
  assert.equal(countByQuadrant(d).q1, 0, '原象限清空')
  assert.equal(normalizeQuadrantData({ items: [{ id: 'x', text: 't', q: 'bad' }] }).items[0].q, 'q1', '非法象限回落')
}

/* ---------------- 待办 ---------------- */
{
  let d = normalizeTodoData(null)
  assert.equal(d.categories.length, 3, '默认三个分类')
  d = addTodo(d, '买菜', 'life').data
  d = addTodo(d, '写文档', 'work').data
  assert.equal(d.items.length, 2, '新增两条')
  assert.equal(addTodo(d, '', 'work').ok, false, '空文本被拒')
  const wid = d.items.find((i) => i.text === '写文档')?.id as string
  d = cycleStatus(d, wid)
  assert.equal(d.items.find((i) => i.id === wid)?.status, 'doing', '状态流转到进行中')
  d = cycleStatus(d, wid)
  d = cycleStatus(d, wid)
  assert.equal(d.items.find((i) => i.id === wid)?.status, 'pending', '三次循环回到待办')
  const before = d.items.map((i) => i.text)
  d = moveTodo(d, 'work', 0, 0)
  assert.deepEqual(d.items.map((i) => i.text), before, '同位置移动无变化')
  const added = addCategory(d, '健身').data
  assert.equal(added.categories.length, 4, '新增分类')
  assert.equal(addCategory(added, '健身').ok, false, '重名被拒')
  const fitId = added.categories[3].id
  d = addTodo(added, '跑步', fitId).data
  d = removeCategory(d, fitId)
  assert.equal(d.categories.length, 3, '删除自定义分类')
  assert.equal(d.items.every((i) => i.cat !== fitId), true, '分类删除后条目回落')
  assert.equal(removeCategory(d, 'work').categories.length, 3, '内置分类不可删')
  assert.deepEqual(statsOf(d.items), { pending: 3, doing: 0, done: 0 }, '统计')
  assert.equal(normalizeTodoData({ items: [{ id: '1', text: 't', status: 'x', cat: 'nope' }] }).items[0].cat, 'work', '非法分类回落')
}

/* ---------------- TOTP / Base32 ---------------- */
{
  const secret = 'JBSWY3DPEHPK3PXP'
  assert.equal(isValidBase32(secret), true, '合法 Base32')
  assert.equal(isValidBase32('jbswy3dpehpk3pxp'), true, '大小写不敏感')
  assert.equal(isValidBase32('JBSWY3DP!'), false, '非法字符被拒')
  assert.equal(normalizeBase32('jbsw y3dp'), 'JBSWY3DP', '规范化')
  assert.equal(base32Encode(base32Decode(secret)), secret, 'Base32 往返一致')
  const uri = 'otpauth://totp/GitHub:user?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30'
  const p = parseOtpauthUri(uri)
  assert.ok(p, '解析成功')
  assert.equal(p?.secret, secret, '密钥')
  assert.equal(p?.issuer, 'GitHub', '服务商')
  assert.equal(p?.account, 'user', '账号')
  assert.equal(parseOtpauthUri('https://x.com'), null, '非 otpauth 协议返回 null')
  assert.equal(parseOtpauthUri('otpauth://totp/a?secret=1'), null, '非法密钥返回 null')
  const left = remainingSeconds(30, 1000)
  assert.ok(left >= 1 && left <= 30, '剩余秒数在 1~30')
}

console.log('✓ toolbox P1 core 全部用例通过')

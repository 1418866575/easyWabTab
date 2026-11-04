#!/usr/bin/env node
/**
 * 样式令牌校验 —— 禁止新增「字面量字号」与「字面量文字色」，并检查悬空令牌引用。
 *
 * 为什么不用 ESLint：
 *   ESLint 默认不解析 SFC 的 <style> 块（当纯文本跳过），`no-restricted-syntax`
 *   对 CSS 无能为力；引 stylelint 又要拉一整套新依赖 + 与既有格式约定冲突。
 *   这里只需要三条窄规则，独立小脚本更可控。
 *
 * 三条规则
 *   1. fontSize —— `font-size` 必须走 `var(--fs-*)`，禁止 12px / 0.9em / 90% 之类的字面量。
 *      理由：全站 8 级字号阶梯（--fs-caption..--fs-h1）是唯一真源，字面量会绕开阶梯。
 *   2. color    —— 文字色必须走 `var(--*)`，禁止 #hex / rgb() / 颜色关键字。
 *      只认「文字」色：`color` 与 `-webkit-text-fill-color`。
 *      background / border / fill / stroke 不在此列（压色、图形色本就有合法字面量）。
 *   3. token    —— `var(--x)` 引用的令牌必须真的被定义过。
 *      理由：`--color-text-soft` 曾长期未定义，34 处靠兜底 hex 静默装死。
 *
 * 为什么只扫 CSS 上下文：
 *   ECharts / Canvas 配置里普遍存在 `color: '#60a5fa'`、`fontSize: 11` 这样的
 *   **JS 对象字面量**，它们不是 CSS、不受令牌体系管辖。若整文件正则扫描，
 *   会得到一大半假阳性（实测 572 处 color 里有近半是图表配色）。
 *   故只取：.css 全文 / .vue 的 <style> 块 / .vue 模板里的静态 style="" 属性。
 *   `:style` 与 `v-bind:style` 是 JS 绑定，跳过。
 *
 * 用法
 *   node scripts/check-style-tokens.mjs               校验（有新增违规则 exit 1）
 *   node scripts/check-style-tokens.mjs --verbose     列出每条违规
 *   node scripts/check-style-tokens.mjs --json        机器可读
 *   node scripts/check-style-tokens.mjs --update-baseline  把当前存量写进基线（治理用）
 *   node scripts/check-style-tokens.mjs --strict      忽略基线，全量报错（看总账用）
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const ROOT = process.cwd()
const SRC_DIR = 'src'
const BASELINE_PATH = 'scripts/style-token-baseline.json'

/**
 * 豁免清单：这些文件不属于 App 字号/文字色体系，不做令牌化要求。
 * 每加一条都必须写清理由——豁免是噪声的源头，不是逃生门。
 */
const EXEMPT = [
  {
    file: 'src/styles/blogTypoZhaotab.css',
    reason: '脚本生成（blogTypoCore.ts）的博客排版主题包，35 套独立字阶，随用户选择的排版主题走，与 App 字号阶梯无关'
  }
]

const args = new Set(process.argv.slice(2))
const OPT = {
  verbose: args.has('--verbose') || args.has('-v'),
  json: args.has('--json'),
  updateBaseline: args.has('--update-baseline'),
  strict: args.has('--strict')
}

// ---------------------------------------------------------------- 文件遍历

function walk(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(p))
    else if (/\.(vue|css|scss)$/.test(entry.name)) out.push(p.split(path.sep).join('/'))
  }
  return out
}

/** 令牌定义可以从任何上下文出现（含 <script> 里的 setProperty、:style 绑定），故单独全量扫 */
function walkAny(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walkAny(p))
    else if (/\.(vue|css|scss|ts|js)$/.test(entry.name)) out.push(p.split(path.sep).join('/'))
  }
  return out
}

// ---------------------------------------------------------------- CSS 上下文抽取

const stripCssComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))

/** 本地日期 YYYY-MM-DD（不用 toISOString：那是 UTC，跨时区会把日期写成前一天） */
function todayLocal() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * 从 .vue 中抽出「CSS 上下文」片段，并记录每段在原文里的起始偏移，
 * 便于把命中位置换算回真实行号。
 */
function extractCssChunks(raw) {
  const chunks = []

  const styleRe = /<style\b[^>]*>/gi
  let m
  while ((m = styleRe.exec(raw))) {
    const bodyStart = m.index + m[0].length
    const close = raw.indexOf('</style>', bodyStart)
    if (close === -1) break
    chunks.push({ kind: 'style', text: raw.slice(bodyStart, close), start: bodyStart })
    styleRe.lastIndex = close
  }

  // 模板里的静态 style=""（`:style` / `v-bind:style` 是 JS 绑定，跳过）
  const tplOpen = /<template\b[^>]*>/i.exec(raw)
  if (tplOpen) {
    const tplStart = tplOpen.index + tplOpen[0].length
    const tplClose = raw.lastIndexOf('</template>')
    const body = raw.slice(tplStart, tplClose > tplStart ? tplClose : raw.length)
    const attrRe = /(?<![:\w-])style\s*=\s*"([^"]*)"/g
    let a
    while ((a = attrRe.exec(body))) {
      chunks.push({ kind: 'attr', text: a[1], start: tplStart + a.index })
    }
  }

  return chunks
}

// ---------------------------------------------------------------- 规则

const RELATIVE_SIZE = /^(inherit|initial|unset|revert|revert-layer|medium|small|large|x-small|x-large|xx-small|xx-large|xxx-large|smaller|larger)$/i
const COLOR_KEYWORD = /^(inherit|initial|unset|revert|revert-layer|currentcolor|transparent|none)$/i

const PROP_RES = [
  { prop: 'fontSize', re: /(?:^|[;{\s])font-size\s*:\s*([^;{}]+)/g },
  { prop: 'color', re: /(?:^|[;{\s])color\s*:\s*([^;{}]+)/g },
  { prop: 'color', re: /(?:^|[;{\s])-webkit-text-fill-color\s*:\s*([^;{}]+)/g }
]

function cleanValue(v) {
  return v.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/!important/gi, ' ').trim()
}

function judge(prop, rawValue) {
  const value = cleanValue(rawValue)
  if (!value) return null
  // 只要出现了 var()，就认为已纳入令牌体系（calc(var(--fs-sm) + 1px) 这类视为合规）
  const usesVar = /var\(\s*--/.test(value)
  if (usesVar) return null

  if (prop === 'fontSize') {
    if (RELATIVE_SIZE.test(value)) return null
    return `字面量字号 ${value}`
  }
  if (COLOR_KEYWORD.test(value)) return null
  return `字面量文字色 ${value}`
}

// ---------------------------------------------------------------- 主流程

const files = walk(SRC_DIR).sort()
const exemptSet = new Map(EXEMPT.map((e) => [e.file, e.reason]))

const violations = [] // { file, line, prop, message }
const tokenRefs = [] // { file, line, token }
/**
 * 间距字面量提醒（**不参与退出码**，只提示）。
 * 2026-11 的界面美化把「全站 7 档间距」做成可调项，前提是间距走 `var(--space-*)`；
 * 新代码若又写 `gap: 16px`，该项就会渐渐失灵。这里只报「值恰好是 7 档之一」的情况
 * （6px / 14px 这类微间距本就不在阶梯内，刷屏无意义），且不做基线比对、不阻断提交。
 */
const spacingHints = []
const SPACING_RES = [
  { re: /(?:^|[;{\s])(?:gap|row-gap|column-gap|padding|margin|padding-(?:top|right|bottom|left)|margin-(?:top|right|bottom|left))\s*:\s*([^;{}]+)/g }
]
const LADDER_VALUES = new Set([4, 8, 12, 16, 20, 24, 32])

for (const rel of files) {
  if (exemptSet.has(rel)) continue
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8')

  const chunks = rel.endsWith('.css') || rel.endsWith('.scss')
    ? [{ kind: 'file', text: stripCssComments(raw), start: 0 }]
    : extractCssChunks(raw)

  for (const chunk of chunks) {
    const text = chunk.kind === 'file' ? chunk.text : stripCssComments(chunk.text)

    for (const { prop, re } of PROP_RES) {
      re.lastIndex = 0
      let m
      while ((m = re.exec(text))) {
        const message = judge(prop, m[1])
        if (!message) continue
        violations.push({
          file: rel,
          line: lineOf(raw, chunk.start + m.index),
          prop,
          message,
          where: chunk.kind
        })
      }
    }

    const varRe = /var\(\s*(--[A-Za-z0-9_-]+)/g
    let vm
    while ((vm = varRe.exec(text))) {
      tokenRefs.push({ file: rel, line: lineOf(raw, chunk.start + vm.index), token: vm[1] })
    }

    for (const { re } of SPACING_RES) {
      // 工具箱是独立 token 体系（界面美化不覆盖它），提示里不掺进来
      if (rel.startsWith('src/toolbox/')) break
      // 模板 inline style 不在收敛范围（一次性行内样式改用 token 反而更难读）
      if (chunk.kind === 'attr') break
      re.lastIndex = 0
      let sm
      while ((sm = re.exec(text))) {
        const value = cleanValue(sm[1])
        if (!value || /var\(\s*--|calc\(|auto|%|em\b|!important/.test(value)) continue
        // 只有「值整体都能落到 7 档」才提示：`16px 6px` 这种混合值转不了，报了也是噪声
        const parts = value.split(/\s+/).filter(Boolean)
        if (!parts.length || parts.length > 4) continue
        const convertible = parts.every((t) => t === '0' || /^(4|8|12|16|20|24|32)px$/.test(t))
        if (!convertible) continue
        // 全是 0（padding: 0）本来就不需要令牌
        if (parts.every((t) => t === '0')) continue
        spacingHints.push({ file: rel, line: lineOf(raw, chunk.start + sm.index), value })
      }
    }
  }
}

function lineOf(raw, offset) {
  let line = 1
  for (let i = 0; i < offset && i < raw.length; i++) if (raw.charCodeAt(i) === 10) line++
  return line
}

// ---- 规则 3：令牌是否定义过
const definedTokens = new Set()
for (const rel of walkAny(SRC_DIR)) {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8')
  // a) CSS 声明 `--x: v`
  const defRe = /(--[A-Za-z0-9_-]+)\s*:/g
  let dm
  while ((dm = defRe.exec(raw))) definedTokens.add(dm[1])

  // b) JS 侧定义：`{ '--c': v }` 对象键、`setProperty('--x', v)`、`['--t-font', ...]` 键名清单。
  //    要求令牌字符串后面跟 , : ] —— 这样 `var(--color-primary)` 里的用法不会被误判成定义。
  const jsDefRe = /(?<!var\()['"`](--[A-Za-z0-9_-]+)['"`]\s*[:,;\])]/g
  let jm
  while ((jm = jsDefRe.exec(raw))) definedTokens.add(jm[1])
}

const missingToken = tokenRefs.filter(({ token }) => {
  if (definedTokens.has(token)) return false
  // Element Plus 自带的 --el-* 由组件库在元素级定义，不在源码里
  if (token.startsWith('--el-')) return false
  return true
})

// ---------------------------------------------------------------- 基线比对

function loadBaseline() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, BASELINE_PATH), 'utf8'))
  } catch {
    return { counts: {} }
  }
}

const currentCounts = {}
for (const v of violations) {
  const key = `${v.file}::${v.prop}`
  currentCounts[key] = (currentCounts[key] || 0) + 1
}

const baseline = loadBaseline()
const baseCounts = baseline.counts || {}
const baseTokens = baseline.tokens || {}

const newViolations = []
if (!OPT.strict) {
  const seen = {}
  for (const v of violations) {
    const key = `${v.file}::${v.prop}`
    seen[key] = (seen[key] || 0) + 1
    if (seen[key] > (baseCounts[key] || 0)) newViolations.push(v)
  }
}

// 悬空令牌同样走基线：存量里有一批「猜错别名的 var(--color-danger, #ef4444)」，
// 它们都带兜底、视觉无损，但改名会在暗色主题下换色（兜底 hex 是写死的），
// 属独立的视觉变更，不能混进「加校验」这一次提交里。
const currentTokenCounts = {}
for (const t of missingToken) {
  const key = `${t.file}::${t.token}`
  currentTokenCounts[key] = (currentTokenCounts[key] || 0) + 1
}

const newMissingToken = []
if (!OPT.strict) {
  const seen = {}
  for (const t of missingToken) {
    const key = `${t.file}::${t.token}`
    seen[key] = (seen[key] || 0) + 1
    if (seen[key] > (baseTokens[key] || 0)) newMissingToken.push(t)
  }
}

const improved = []
if (!OPT.strict) {
  for (const [k, n] of Object.entries(baseCounts)) {
    if (n > (currentCounts[k] || 0)) improved.push({ key: k, was: n, now: currentCounts[k] || 0 })
  }
  for (const [k, n] of Object.entries(baseTokens)) {
    if (n > (currentTokenCounts[k] || 0)) improved.push({ key: `token ${k}`, was: n, now: currentTokenCounts[k] || 0 })
  }
}

// ---------------------------------------------------------------- 输出

if (OPT.updateBaseline) {
  fs.writeFileSync(
    path.join(ROOT, BASELINE_PATH),
    JSON.stringify(
      {
        _doc:
          '样式令牌存量基线。counts 的 key = "<文件>::<规则>"，tokens 的 key = "<文件>::<令牌>"，' +
          'value = 允许的个数。只允许变小：治理一处就 --update-baseline 收一次，让 ratchet 只往上走。' +
          '由 scripts/check-style-tokens.mjs --update-baseline 生成，勿手改。',
        _updatedAt: todayLocal(),
        counts: Object.fromEntries(Object.entries(currentCounts).sort()),
        tokens: Object.fromEntries(Object.entries(currentTokenCounts).sort())
      },
      null,
      2
    ) + '\n'
  )
  console.log(
    `基线已写入 ${BASELINE_PATH}：字面量 ${Object.keys(currentCounts).length} 条 / ${violations.length} 处，` +
      `悬空令牌 ${Object.keys(currentTokenCounts).length} 条 / ${missingToken.length} 处`
  )
  process.exit(0)
}

const fail = OPT.strict ? 0 : newViolations.length + newMissingToken.length

if (OPT.json) {
  console.log(
    JSON.stringify(
      {
        total: violations.length,
        newViolations,
        missingToken,
        newMissingToken,
        improved
      },
      null,
      2
    )
  )
  process.exit(fail ? 1 : 0)
}

const totalBase = Object.values(baseCounts).reduce((a, b) => a + b, 0)
const totalTokenBase = Object.values(baseTokens).reduce((a, b) => a + b, 0)

if (OPT.strict) {
  console.log(`\n【全量模式】字面量违规 ${violations.length} 处（基线内 ${totalBase} 处）\n`)
  const byFile = new Map()
  for (const v of violations) byFile.set(v.file, (byFile.get(v.file) || 0) + 1)
  for (const [f, n] of [...byFile.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${f}`)
  }
} else if (newViolations.length) {
  console.log(`\n✗ 新增字面量 ${newViolations.length} 处：\n`)
  for (const v of newViolations) {
    const hint = v.prop === 'fontSize' ? '改用 var(--fs-*)' : '改用 var(--ink-*)/var(--color-*)'
    console.log(`  ${v.file}:${v.line}  ${v.message}  → ${hint}`)
  }
} else {
  console.log(`✓ 无新增字面量（基线内 ${totalBase} 处存量，逐次 --update-baseline 收敛）`)
}

if (newMissingToken.length) {
  console.log(`\n✗ 新增悬空令牌引用 ${newMissingToken.length} 处（令牌不存在，该声明会被浏览器丢弃）：\n`)
  const seen = new Set()
  for (const t of newMissingToken) {
    const key = `${t.file}:${t.line}:${t.token}`
    if (seen.has(key)) continue
    seen.add(key)
    console.log(`  ${t.file}:${t.line}  ${t.token}`)
  }
} else {
  console.log(
    `✓ 无新增悬空令牌（${tokenRefs.length} 处引用 / ${definedTokens.size} 个已定义令牌；` +
      `基线内 ${totalTokenBase} 处历史别名）`
  )
}

if (improved.length && OPT.verbose) {
  console.log(`\n↓ 已比基线少 ${improved.length} 个条目，可 --update-baseline 收紧：`)
  for (const i of improved.slice(0, 20)) console.log(`  ${i.key}  ${i.was} → ${i.now}`)
}

// 间距字面量：只提示，不影响退出码（存量仍有微间距未收敛，报错会一路红到底）
if (spacingHints.length) {
  console.log(
    `\n⚠ 间距字面量 ${spacingHints.length} 处可用 var(--space-N)（不影响退出码）` +
      `：界面美化的「组件间距」只对 --space-* 生效，${OPT.verbose ? '' : '加 --verbose 看清单'}`
  )
  if (OPT.verbose) {
    for (const h of spacingHints.slice(0, 40)) console.log(`  ${h.file}:${h.line}  ${h.value}`)
    if (spacingHints.length > 40) console.log(`  ...其余 ${spacingHints.length - 40} 处`)
  }
}

if (OPT.verbose && (OPT.strict || newViolations.length)) {
  const byFile = new Map()
  for (const v of OPT.strict ? violations : newViolations) {
    if (!byFile.has(v.file)) byFile.set(v.file, [])
    byFile.get(v.file).push(v)
  }
  console.log('\n--- 明细 ---')
  for (const [f, list] of byFile) {
    console.log(`\n${f}`)
    for (const v of list) console.log(`  :${v.line}  ${v.message}${v.where === 'attr' ? '  (inline style)' : ''}`)
  }
}

process.exit(fail ? 1 : 0)

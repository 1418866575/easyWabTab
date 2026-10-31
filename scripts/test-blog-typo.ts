/**
 * 博客排版主题纯逻辑测试
 * 运行：npm run test:blog-typo
 */
import assert from 'node:assert/strict'
import {
  TYPO_THEMES,
  TYPO_TOKEN_KEYS,
  FOLLOW_THEME_ID,
  CLASSIC_THEME_ID,
  resolveTypo,
  typoVars,
  typoHrStyle,
  typoInlineStyle,
  hrMarkup
} from '../src/composables/blogTypoCore.ts'

let passed = 0
function test(name: string, fn: () => void): void {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

// ---------- T1 resolveTypo 解析与回落 ----------

test('T1 resolveTypo：合法 id / 非法 id / 缺省 / 空串 / 全局默认 的优先级', () => {
  assert.equal(resolveTypo({ themeId: 't_teal' }).id, 't_teal')
  // 非法 id 一律回落「跟随系统」，绝不抛错
  assert.equal(resolveTypo({ themeId: 't_nope' }).id, FOLLOW_THEME_ID)
  assert.equal(resolveTypo(undefined).id, FOLLOW_THEME_ID)
  assert.equal(resolveTypo({ themeId: '' }).id, FOLLOW_THEME_ID)
  // 单篇为空 → 用全局默认；单篇有值 → 单篇优先
  assert.equal(resolveTypo({ themeId: '' }, 't_pink').id, 't_pink')
  assert.equal(resolveTypo({ themeId: 't_teal' }, 't_pink').id, 't_teal')
  // 全局默认也非法 → 跟随系统
  assert.equal(resolveTypo({ themeId: '' }, 'nope').id, FOLLOW_THEME_ID)
})

// ---------- T2 typoVars 输出 ----------

test('T2 typoVars：跟随系统返回空对象（CSS fallback 接管，保证零回归）', () => {
  assert.deepEqual(typoVars({ themeId: FOLLOW_THEME_ID }), {})
  assert.deepEqual(typoVars(undefined), {})
  assert.deepEqual(typoVars({ themeId: '' }, FOLLOW_THEME_ID), {})
})

test('T3 typoVars：主题 token 全量输出，微调项覆盖主题值', () => {
  const vars = typoVars({ themeId: 't_teal' })
  assert.equal(vars['--t-accent'], '#0F6E56')
  assert.equal(vars['--t-quote-bg'], '#E1F5EE')
  assert.ok(!('--t-hr-style' in vars) || vars['--t-hr-style'] === 'line')
  // 微调覆盖
  const adj = typoVars({ themeId: 't_teal', fontSize: 18, lineHeight: 2, paragraphGap: 1.5 })
  assert.equal(adj['--t-font-size'], '18px')
  assert.equal(adj['--t-line-height'], '2')
  assert.equal(adj['--t-paragraph-gap'], '1.5em')
})

test('T4 typoVars：越界与 NaN 的微调一律丢弃（不产生半套值）', () => {
  const vars = typoVars({ themeId: 't_teal', fontSize: 99, lineHeight: NaN, paragraphGap: 0.1 })
  assert.ok(!('--t-font-size' in vars) || vars['--t-font-size'] === '15px')
  assert.equal('--t-line-height' in vars, false)
  assert.equal('--t-paragraph-gap' in vars, false)
})

test('T5 typoVars：dark 取主题暗色覆盖（背景仍由页面控制）', () => {
  const light = typoVars({ themeId: 't_teal' })
  const dark = typoVars({ themeId: 't_teal' }, undefined, true)
  assert.equal(dark['--t-accent'], light['--t-accent'])
  assert.notEqual(dark['--t-text'], light['--t-text'])
  // 跟随系统永远不注入
  assert.deepEqual(typoVars({ themeId: FOLLOW_THEME_ID }, undefined, true), {})
})

// ---------- T6 typoInlineStyle 与旧 styleFor 逐字节一致（回归锚点） ----------

const CLASSIC = TYPO_THEMES.find((t) => t.id === CLASSIC_THEME_ID)!.tokens

test('T6 typoInlineStyle(classic)：段落与标题与旧硬编码逐字节一致', () => {
  assert.equal(typoInlineStyle('p', {}, CLASSIC), 'margin:1.2em 0;padding:0;')
  assert.equal(
    typoInlineStyle('h1', {}, CLASSIC),
    'font-size:22px;font-weight:bold;margin:1.4em 0 0.8em;line-height:1.4;color:#1f1f1f;'
  )
  assert.equal(
    typoInlineStyle('h2', {}, CLASSIC),
    'font-size:20px;font-weight:bold;margin:1.4em 0 0.8em;line-height:1.4;color:#1f1f1f;'
  )
  assert.equal(
    typoInlineStyle('h3', {}, CLASSIC),
    'font-size:18px;font-weight:bold;margin:1.2em 0 0.6em;line-height:1.4;color:#1f1f1f;'
  )
  assert.equal(
    typoInlineStyle('h4', {}, CLASSIC),
    'font-size:16px;font-weight:bold;margin:1.1em 0 0.5em;color:#1f1f1f;'
  )
  assert.equal(typoInlineStyle('h6', {}, CLASSIC), typoInlineStyle('h4', {}, CLASSIC))
})

test('T7 typoInlineStyle(classic)：行内元素 / 代码 / 引用 / 列表 / 表格逐字节一致', () => {
  assert.equal(typoInlineStyle('img', {}, CLASSIC), 'max-width:100%;height:auto;display:block;margin:0.8em auto;border-radius:4px;')
  assert.equal(typoInlineStyle('a', {}, CLASSIC), 'color:#576b95;text-decoration:none;word-break:break-all;')
  assert.equal(typoInlineStyle('strong', {}, CLASSIC), 'font-weight:bold;')
  assert.equal(typoInlineStyle('em', {}, CLASSIC), 'font-style:italic;')
  assert.equal(
    typoInlineStyle('code', {}, CLASSIC),
    'background-color:#f6f8fa;color:#c7254e;padding:2px 6px;border-radius:3px;font-family:Consolas,Menlo,monospace;font-size:14px;word-break:break-all;'
  )
  assert.equal(
    typoInlineStyle('code', { isCodeInPre: true }, CLASSIC),
    'background:none;padding:0;color:#333;font-family:Consolas,Menlo,monospace;font-size:14px;'
  )
  assert.equal(
    typoInlineStyle('pre', {}, CLASSIC),
    'background-color:#f6f8fa;padding:12px 16px;border-radius:6px;margin:1em 0;font-size:13px;line-height:1.65;white-space:pre-wrap;word-wrap:break-word;word-break:break-all;tab-size:2;'
  )
  assert.equal(
    typoInlineStyle('blockquote', {}, CLASSIC),
    'margin:1em 0;padding:8px 12px;border-left:4px solid #d9d9d9;background-color:#f8f8f8;color:#888;'
  )
  assert.equal(typoInlineStyle('ul', {}, CLASSIC), 'padding-left:1.8em;margin:1em 0;')
  assert.equal(typoInlineStyle('li', {}, CLASSIC), 'margin:0.4em 0;')
  assert.equal(typoInlineStyle('hr', {}, CLASSIC), 'border:none;border-top:1px solid #eee;margin:1.5em 0;')
  assert.equal(typoInlineStyle('table', {}, CLASSIC), 'border-collapse:collapse;width:100%;margin:1em 0;font-size:14px;')
  assert.equal(typoInlineStyle('th', {}, CLASSIC), 'border:1px solid #e0e0e0;padding:6px 10px;text-align:left;background-color:#f6f8fa;font-weight:bold;')
  assert.equal(typoInlineStyle('td', {}, CLASSIC), 'border:1px solid #e0e0e0;padding:6px 10px;text-align:left;')
  assert.equal(typoInlineStyle('section', {}, CLASSIC), '')
})

test('T8 typoInlineStyle：主题换色只影响取色，标题字号随正文字号等比缩放', () => {
  const teal = TYPO_THEMES.find((t) => t.id === 't_teal')!.tokens
  assert.equal(typoInlineStyle('p', {}, teal), 'margin:1.2em 0;padding:0;')
  assert.match(typoInlineStyle('a', {}, teal), /color:#0F6E56;/)
  assert.match(typoInlineStyle('blockquote', {}, teal), /border-left:4px solid #0F6E56;/)
  // 极简大字 17px：h1 = round(22 * 17/16) = 23px
  const large = TYPO_THEMES.find((t) => t.id === 't_large')!.tokens
  assert.match(typoInlineStyle('h1', {}, large), /font-size:23px;/)
  assert.match(typoInlineStyle('p', {}, large), /^margin:1.4em 0;/)
  // 缺键回落基线（跟随系统在公众号端 = classic 观感）
  assert.equal(typoInlineStyle('p', {}, {}), 'margin:1.2em 0;padding:0;')
})

// ---------- T9 分割线 ----------

test('T9 typoHrStyle / hrMarkup：三种分割线结构', () => {
  assert.equal(typoHrStyle({ themeId: FOLLOW_THEME_ID }), '', '跟随系统不打 data-hr')
  assert.equal(typoHrStyle({ themeId: 't_teal' }), 'line')
  assert.equal(typoHrStyle({ themeId: 't_coral' }), 'dots')
  assert.equal(typoHrStyle({ themeId: 't_pink' }), 'dashed')
  assert.equal(hrMarkup({}), null, 'line 保持 <hr> 原样')
  assert.match(hrMarkup({ '--t-hr-style': 'dots' })!, /^<section style="text-align:center;[^"]*">●&nbsp;&nbsp;●&nbsp;&nbsp;●<\/section>$/)
  assert.equal(hrMarkup({ '--t-hr-style': 'dashed' }), '<section style="border-top:1px dashed #d9d9d9;margin:1.5em 0;"></section>')
})

// ---------- T10 主题表完整性 ----------

test('T10 主题表：id 唯一、必需 token 齐、色值合法、分组合法', () => {
  const ids = new Set(TYPO_THEMES.map((t) => t.id))
  assert.equal(ids.size, TYPO_THEMES.length)
  const hex = /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/
  for (const t of TYPO_THEMES) {
    assert.ok(['color', 'simple', 'wechat'].includes(t.group), `${t.id} 分组非法`)
    assert.ok(hex.test(t.swatch), `${t.id} swatch 非法`)
    if (t.id === FOLLOW_THEME_ID) {
      assert.equal(Object.keys(t.tokens).length, 0, '跟随系统不得注入任何变量')
      continue
    }
    // 排版尺寸类允许缺省（缺 = 回落基线 / CSS fallback），取色类必须齐
    const optional = new Set([
      '--t-font', '--t-font-size', '--t-line-height', '--t-paragraph-gap',
      '--t-heading-gap', '--t-heading-weight', '--t-hr-style'
    ])
    for (const key of TYPO_TOKEN_KEYS) {
      if (optional.has(key)) continue
      assert.ok(t.tokens[key], `${t.id} 缺 ${key}`)
    }
    for (const [k, v] of Object.entries(t.tokens)) {
      if (k === '--t-hr-style') {
        assert.ok(['line', 'dots', 'dashed'].includes(v), `${t.id} hr-style 非法`)
        continue
      }
      assert.ok(v.startsWith('#') || v.includes('var(') || v.includes('rgba') || v === 'transparent' || /^[0-9.]+(px|em)?$|^inherit$/.test(v) || v.includes(','), `${t.id} ${k} 值可疑：${v}`)
      if (v.startsWith('#')) assert.ok(hex.test(v), `${t.id} ${k} 色值非法：${v}`)
    }
  }
})

console.log(`\n${passed}/10 passed`)
if (passed !== 10) process.exit(1)

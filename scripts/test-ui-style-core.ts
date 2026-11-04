/**
 * 界面美化纯逻辑测试（npm run test:uistyle）。
 * 只覆盖 uiStyleCore：归一化、变量编译、覆盖导出。DOM 应用在 useUiStyle，靠浏览器目视验证。
 */
import assert from 'node:assert/strict'
import {
  applyPresetValues,
  changedKnobCount,
  compileUiStyleVars,
  defaultUiStyle,
  isDefaultUiStyle,
  matchesPreset,
  normalizeUiStyle,
  uiStyleCssText
} from '../src/composables/uiStyleCore.ts'
import { UI_STYLE_DEFAULTS, UI_STYLE_PRESETS } from '../src/config/uiStyle.ts'

const tests: { name: string; fn: () => void }[] = []
function test(name: string, fn: () => void) {
  tests.push({ name, fn })
}

test('S1 空输入得到默认状态且判定为默认', () => {
  for (const raw of [null, undefined, '', 0, [], { foo: 'bar' }]) {
    const state = normalizeUiStyle(raw)
    assert.equal(isDefaultUiStyle(state), true)
    assert.equal(state.ctrlH, '36px')
    assert.equal(state.fsScale, '1')
  }
})

test('S2 合法值保留，非法值与未知键回退', () => {
  const state = normalizeUiStyle({
    ctrlH: '40px',
    fsScale: '1.1',
    contentPad: '999px', // 不在选项内
    notAKnob: 'x',
    cardPad: 20 // 非字符串
  })
  assert.equal(state.ctrlH, '40px')
  assert.equal(state.fsScale, '1.1')
  assert.equal(state.contentPad, '16px')
  assert.equal(state.cardPad, '16px')
  assert.equal(changedKnobCount(state), 2)
})

test('S3 默认状态不编译出任何变量（保证零视觉变化）', () => {
  assert.deepEqual(compileUiStyleVars(defaultUiStyle()), {})
})

test('S4 单项编译成对应变量', () => {
  const state = normalizeUiStyle({ ctrlH: '44px', radiusCard: '16px' })
  assert.deepEqual(compileUiStyleVars(state), {
    '--ui-ctrl-h': '44px',
    '--ui-radius-card': '16px'
  })
})

test('S5 mutedTone 加深映射到两级墨色别名，且不产出 --ui-muted-tone', () => {
  const vars = compileUiStyleVars(normalizeUiStyle({ mutedTone: 'deep' }))
  assert.deepEqual(vars, {
    '--color-text-muted': 'var(--ink-2)',
    '--color-text-soft': 'var(--ink-3)'
  })
})

test('S6 多档缩放同时编译', () => {
  const vars = compileUiStyleVars(normalizeUiStyle({ fsScale: '0.9', spaceScale: '1.15', lineHeight: '1.75' }))
  assert.deepEqual(vars, {
    '--ui-fs-scale': '0.9',
    '--ui-space-scale': '1.15',
    '--ui-line-height': '1.75'
  })
})

test('S7 导出默认态为提示注释，非默认态为可粘贴的覆盖块', () => {
  assert.match(uiStyleCssText(defaultUiStyle()), /无需覆盖/)

  const css = uiStyleCssText(normalizeUiStyle({ contentPad: '20px' }))
  assert.match(css, /html:root\[data-ui-style\] \{/)
  assert.match(css, /--ui-content-pad: 20px;/)
  // 只导出被改动的项
  assert.doesNotMatch(css, /--ui-ctrl-h/)
})

test('S8 每个预设的取值都合法，且「标准」等于默认', () => {
  for (const preset of UI_STYLE_PRESETS) {
    const state = applyPresetValues(preset)
    // 非法值会被 normalize 退回默认，导致状态与配方不相等 —— 这条能兜住「配方里写了错档位」
    assert.equal(matchesPreset(state, preset), true, `${preset.key} 的取值不在选项内`)
    if (preset.key === 'standard') {
      assert.equal(isDefaultUiStyle(state), true)
    } else {
      assert.ok(changedKnobCount(state) > 0)
    }
  }
})

test('S9 套用预设以默认值为底，不残留上一份自定义', () => {
  const dirty = normalizeUiStyle({ ...UI_STYLE_DEFAULTS, radiusCtrl: '4px', ctrlH: '44px' })
  const compact = UI_STYLE_PRESETS.find((p) => p.key === 'compact')!
  // 配方没写的项必须回默认，而不是保留 4px
  assert.equal(applyPresetValues(compact).radiusCtrl, UI_STYLE_DEFAULTS.radiusCtrl)
  assert.equal(matchesPreset(dirty, compact), false)
})

let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log(`  ✓ ${t.name}`)
  } catch (e) {
    failed++
    console.error(`  ✗ ${t.name}\n    ${(e as Error).message}`)
  }
}
console.log(failed === 0 ? `\n${tests.length} 项全部通过` : `\n${failed} / ${tests.length} 项失败`)
process.exit(failed === 0 ? 0 : 1)

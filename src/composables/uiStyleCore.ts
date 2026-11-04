/**
 * 界面美化（UiStyle）纯逻辑：归一化 / 变量编译 / CSS 覆盖导出。
 *
 * 只做数据变换，不碰 DOM、不读存储 —— 可被 `node --experimental-strip-types` 直接测试
 * （见 scripts/test-ui-style-core.ts）。DOM 应用与持久化在 useUiStyle.ts。
 *
 * 编译原则：**只输出与默认值不同的项**。全部默认 → 空对象 → 调用方不写任何内联变量，
 * 保证「没调过」与「调回默认」视觉完全一致，不会因为 calc(16px * 1) 这类计算残留差异。
 */

import { UI_STYLE_DEFAULTS, UI_STYLE_GROUPS } from '../config/uiStyle.ts'
import type { UiStyleKnobKey, UiStylePreset } from '../config/uiStyle.ts'

export type UiStyleState = Record<UiStyleKnobKey, string>

/** 默认状态（每次返回新对象，避免调用方改动污染全局默认表） */
export function defaultUiStyle(): UiStyleState {
  return { ...UI_STYLE_DEFAULTS }
}

/** 调节项 → CSS 变量名。mutedTone 是离散枚举，单独在 compileUiStyleVars 里处理 */
const KNOB_VAR: Record<Exclude<UiStyleKnobKey, 'mutedTone'>, string> = {
  contentPad: '--ui-content-pad',
  cardPad: '--ui-card-pad',
  ctrlH: '--ui-ctrl-h',
  tableCellPy: '--ui-table-cell-py',
  fsScale: '--ui-fs-scale',
  lineHeight: '--ui-line-height',
  spaceScale: '--ui-space-scale',
  radiusCtrl: '--ui-radius-ctrl',
  radiusCard: '--ui-radius-card'
}

/** 由 UiStyleState 可能写出的全部 CSS 变量（含 mutedTone 的两个墨色别名），用于应用前清场 */
export const UI_STYLE_MANAGED_VARS: string[] = [
  ...Object.values(KNOB_VAR),
  '--color-text-muted',
  '--color-text-soft'
]

const OPTION_SET = new Map<UiStyleKnobKey, Set<string>>(
  UI_STYLE_GROUPS.flatMap((group) => group.knobs.map((knob) => [knob.key, new Set(knob.options.map((o) => o.value))] as const))
)

/**
 * 归一化外部输入（本地存储 / 备份导入 / 手工粘贴）。
 * 规则：非对象→空；未知键丢弃；值不在选项内→回退该项默认值（**不抛错**，
 * 因为旧版本存档里可能残留已下线的选项，宁可静默回默认也不能让整份配置失效）。
 */
export function normalizeUiStyle(raw: unknown): UiStyleState {
  const out = defaultUiStyle()
  if (!raw || typeof raw !== 'object') return out
  const src = raw as Record<string, unknown>
  for (const key of Object.keys(out) as UiStyleKnobKey[]) {
    const value = src[key]
    if (typeof value !== 'string') continue
    const allowed = OPTION_SET.get(key)
    if (allowed?.has(value)) out[key] = value
  }
  return out
}

/** 与默认值不同的项数（面板上显示「已调整 N 项」、按钮禁用态都靠它） */
export function changedKnobCount(state: UiStyleState): number {
  return (Object.keys(UI_STYLE_DEFAULTS) as UiStyleKnobKey[]).filter(
    (key) => state[key] !== UI_STYLE_DEFAULTS[key]
  ).length
}

export function isDefaultUiStyle(state: UiStyleState): boolean {
  return changedKnobCount(state) === 0
}

/**
 * 编译成待写入 `<html>` 的内联 CSS 变量。
 * mutedTone=deep 时把两级辅助文字各提一档墨色（`--ink-3 → --ink-2`、`--ink-4 → --ink-3`），
 * 仍引用 `--ink-*`，换 accent 主题时照旧跟随。
 */
export function compileUiStyleVars(state: UiStyleState): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const group of UI_STYLE_GROUPS) {
    for (const knob of group.knobs) {
      const value = state[knob.key]
      if (value === knob.default) continue
      if (knob.key === 'mutedTone') {
        vars['--color-text-muted'] = 'var(--ink-2)'
        vars['--color-text-soft'] = 'var(--ink-3)'
        continue
      }
      vars[KNOB_VAR[knob.key]] = value
    }
  }
  return vars
}

/**
 * 导出为可直接粘进样式表的覆盖块。
 * 用于「固化」：面板调好后复制、粘到 `src/styles/ui-style.css` 末尾，全设备同款外观。
 * 全部默认时返回提示注释，不产生空块。
 */
export function uiStyleCssText(state: UiStyleState): string {
  const vars = compileUiStyleVars(state)
  const entries = Object.entries(vars)
  if (!entries.length) {
    return '/* 界面美化：当前全部为项目默认值，无需覆盖 */'
  }
  const body = entries.map(([name, value]) => `  ${name}: ${value};`).join('\n')
  return [`/* 界面美化覆盖（由设置 → 界面美化 导出） */`, `html:root[data-ui-style] {`, body, `}`].join('\n')
}

/**
 * 套用预设配方：**以默认值为底**再叠加配方里的项。
 * 不基于当前状态叠加，否则「先调过几项再点紧凑」会留下配方没覆盖的旧值，结果既不是紧凑也不是自定义。
 */
export function applyPresetValues(preset: UiStylePreset): UiStyleState {
  return normalizeUiStyle({ ...UI_STYLE_DEFAULTS, ...preset.values })
}

/** 当前状态是否恰好等于某个配方（用于预设按钮的高亮；微调后自动熄灭） */
export function matchesPreset(state: UiStyleState, preset: UiStylePreset): boolean {
  return (Object.keys(UI_STYLE_DEFAULTS) as UiStyleKnobKey[]).every(
    (key) => state[key] === (preset.values[key] ?? UI_STYLE_DEFAULTS[key])
  )
}

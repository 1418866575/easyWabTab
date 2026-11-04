/**
 * 界面美化（UiStyle）默认配置 —— 同类元素视觉规则的唯一真源。
 *
 * 目的：项目里「同类元素的默认规则」原本分散在四处，改一次要翻四五个文件，且用户无法
 * 按自己的屏幕/视力调整：
 *   - `src/style.css`                → 颜色 / 间距 / 字号 / 圆角 token
 *   - `src/styles/element-theme.css` → EP 控件的尺寸桥接
 *   - `src/styles/teacher.css` / `workbench.css` → 工作台卡片原语（内边距）
 *   - 各 View 的 scoped             → 内容区内边距
 * 本文件只负责「有哪些调节项、默认是多少、能取哪些值」，**不放任何 CSS**：
 *   - 生效的 CSS 在 `src/styles/ui-style.css`（把 `--ui-*` 派生成既有 token）
 *   - 纯逻辑在 `src/composables/uiStyleCore.ts`
 *   - 运行时读写/持久化在 `src/composables/useUiStyle.ts`
 *   - 面板在 `src/components/common/UiStylePanel.vue`
 *
 * 铁律：**默认值必须与当前项目规范逐项相等**（见 docs/UI_STYLE_GUIDE.md §1 / §2）。
 * 不设任何一项 = 视觉零变化。新增一项的步骤见 docs/UI_STYLE_GUIDE.md §1.8。
 */

/** 可调节项标识（与 uiStyleCore 的变量映射一一对应） */
export type UiStyleKnobKey =
  | 'contentPad'
  | 'cardPad'
  | 'ctrlH'
  | 'tableCellPy'
  | 'fsScale'
  | 'lineHeight'
  | 'mutedTone'
  | 'spaceScale'
  | 'radiusCtrl'
  | 'radiusCard'

export interface UiStyleOption {
  /** 落盘值，直接作为 CSS 变量值或枚举标识 */
  value: string
  label: string
}

export interface UiStyleKnob {
  key: UiStyleKnobKey
  label: string
  /** 这一项实际影响哪些元素（面板上直接展示，避免用户盲调） */
  affects: string
  options: UiStyleOption[]
  default: string
}

export interface UiStyleGroup {
  key: 'layout' | 'size' | 'type' | 'space'
  label: string
  knobs: UiStyleKnob[]
}

/** 面板渲染顺序 = 数组顺序 */
export const UI_STYLE_GROUPS: UiStyleGroup[] = [
  {
    key: 'layout',
    label: '布局与留白',
    knobs: [
      {
        key: 'contentPad',
        label: '内容区边距',
        affects: '导航站 / 四个工作台的内容区四周留白',
        default: '16px',
        options: [
          { value: '12px', label: '紧凑' },
          { value: '16px', label: '标准' },
          { value: '20px', label: '宽松' },
          { value: '24px', label: '超宽' }
        ]
      },
      {
        key: 'cardPad',
        label: '卡片内边距',
        affects: '面板卡 / 统计卡内部，字段与标题的呼吸空间',
        default: '16px',
        options: [
          { value: '12px', label: '紧凑' },
          { value: '16px', label: '标准' },
          { value: '20px', label: '宽松' },
          { value: '24px', label: '超宽' }
        ]
      }
    ]
  },
  {
    key: 'size',
    label: '元素尺寸',
    knobs: [
      {
        key: 'ctrlH',
        label: '控件高度',
        affects: '按钮、输入框、下拉、分段控件，以及图标/关闭按钮的方块尺寸（三档同源：小号 = 本值 −4，大号 = 本值 +8）',
        default: '36px',
        options: [
          { value: '32px', label: '32' },
          { value: '36px', label: '36' },
          { value: '40px', label: '40' },
          { value: '44px', label: '44' }
        ]
      },
      {
        key: 'tableCellPy',
        label: '表格行距',
        affects: 'Element Plus 表格单元格上下内边距，决定表格密度',
        default: '8px',
        options: [
          { value: '6px', label: '紧凑' },
          { value: '8px', label: '标准' },
          { value: '12px', label: '宽松' }
        ]
      }
    ]
  },
  {
    key: 'type',
    label: '字号与字体颜色',
    knobs: [
      {
        key: 'fsScale',
        label: '字号缩放',
        affects: '全站 10 档字号（--fs-*）与旧阶梯（--font-size-*）同比缩放，含输入框内文字',
        default: '1',
        options: [
          { value: '0.9', label: '90%' },
          { value: '0.95', label: '95%' },
          { value: '1', label: '100%' },
          { value: '1.05', label: '105%' },
          { value: '1.1', label: '110%' }
        ]
      },
      {
        key: 'lineHeight',
        label: '正文行高',
        affects: '正文 / 表格 / 表单的行间距（标题行高不受影响）',
        default: '1.6',
        options: [
          { value: '1.5', label: '紧凑' },
          { value: '1.6', label: '标准' },
          { value: '1.75', label: '宽松' }
        ]
      },
      {
        key: 'mutedTone',
        label: '辅助文字',
        affects: '说明、时间戳、占位符、禁用态文字的深浅（仍跟随主题墨色，不写死颜色）',
        default: 'normal',
        options: [
          { value: 'normal', label: '标准' },
          { value: 'deep', label: '加深' }
        ]
      }
    ]
  },
  {
    key: 'space',
    label: '间距与圆角',
    knobs: [
      {
        key: 'spaceScale',
        label: '组件间距',
        affects: '全站 7 档间距（--space-*：4~32px）同比缩放，按钮组、表单项、区块间距一起变',
        default: '1',
        options: [
          { value: '0.85', label: '紧凑' },
          { value: '1', label: '标准' },
          { value: '1.15', label: '宽松' }
        ]
      },
      {
        key: 'radiusCtrl',
        label: '控件圆角',
        affects: '按钮、输入框、下拉、表格控件（--radius-md 与 EP 圆角基值）',
        default: '8px',
        options: [
          { value: '4px', label: '4' },
          { value: '8px', label: '8' },
          { value: '12px', label: '12' }
        ]
      },
      {
        key: 'radiusCard',
        label: '卡片圆角',
        affects: '卡片、弹框、面板（--radius-lg）。胶囊形态的按钮（弹框底部操作、标签）恒为全圆角，不受此处影响',
        default: '12px',
        options: [
          { value: '8px', label: '8' },
          { value: '12px', label: '12' },
          { value: '16px', label: '16' }
        ]
      }
    ]
  }
]

/** 默认值表：由上面的清单直接派生，保证「配置」与「默认」永不脱节 */
export const UI_STYLE_DEFAULTS: Record<UiStyleKnobKey, string> = UI_STYLE_GROUPS.reduce(
  (acc, group) => {
    for (const knob of group.knobs) acc[knob.key] = knob.default
    return acc
  },
  {} as Record<UiStyleKnobKey, string>
)

/** nav 偏好键（本机保存，不进云同步信封：密度与字号是设备相关偏好） */
export const UI_STYLE_PREF_KEY = 'ui-style'

/**
 * 预设配方：把 10 个独立开关收敛成 3 个「一看就懂」的组合。
 * 用户不需要理解每一项，先选一个方向，再按需微调；微调后预设不再高亮（状态与配方不再相等）。
 * 值必须来自上面各 knob 的 options，否则 normalizeUiStyle 会把它退回默认。
 */
export interface UiStylePreset {
  key: 'standard' | 'compact' | 'comfortable'
  label: string
  desc: string
  values: Partial<Record<UiStyleKnobKey, string>>
}

export const UI_STYLE_PRESETS: UiStylePreset[] = [
  {
    key: 'standard',
    label: '标准',
    desc: '项目规范默认值',
    values: {}
  },
  {
    key: 'compact',
    label: '紧凑',
    desc: '一屏装更多，适合小屏 / 多窗口',
    values: {
      contentPad: '12px',
      cardPad: '12px',
      ctrlH: '32px',
      tableCellPy: '6px',
      fsScale: '0.95',
      lineHeight: '1.5',
      spaceScale: '0.85'
    }
  },
  {
    key: 'comfortable',
    label: '大字护眼',
    desc: '字大行松，适合久看与高分屏',
    values: {
      contentPad: '20px',
      cardPad: '20px',
      ctrlH: '40px',
      tableCellPy: '12px',
      fsScale: '1.1',
      lineHeight: '1.75',
      mutedTone: 'deep',
      spaceScale: '1.15'
    }
  }
]

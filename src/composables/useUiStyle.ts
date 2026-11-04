/**
 * 界面美化（UiStyle）运行时：把 `src/config/uiStyle.ts` 的调节项写成 `<html>` 上的
 * 内联 CSS 变量，并持久化到 nav 偏好（本机）。
 *
 * 为什么写内联变量而不是生成 <style> 标签：
 *   内联优先级最高，能稳定压过 `:root`（`style.css`）与 `html[data-accent]`（`themes.css`）
 *   以及各组件 scoped 里对同一 token 的引用，无需靠加载顺序或 `!important`。
 *
 * 为什么不进云同步：密度 / 字号 / 内容边距是**设备相关**偏好（手机与桌面想要的档位不同，
 * 大屏笔记本与小屏显示器也不同）。同步过去只会让另一端突然变挤，与 books-prefs 同理，
 * 故本键刻意不加入 NAV_SYNC_KEYS / WORKBENCH_PREFS_KEYS。
 */
import { computed, ref } from 'vue'
import { getPref, setPrefNow } from './useNavPrefs'
import { UI_STYLE_PREF_KEY } from '@/config/uiStyle'
import type { UiStyleKnobKey, UiStylePreset } from '@/config/uiStyle'
import {
  UI_STYLE_MANAGED_VARS,
  applyPresetValues,
  changedKnobCount,
  compileUiStyleVars,
  defaultUiStyle,
  normalizeUiStyle,
  uiStyleCssText
} from './uiStyleCore'
import type { UiStyleState } from './uiStyleCore'

const styleState = ref<UiStyleState>(defaultUiStyle())
const styleVars = ref<Record<string, string>>({})

/** 已写入 documentElement 的变量名（重置时逐项 remove，避免残留上一次的覆盖） */
let applied: string[] = []

function readStored(): UiStyleState {
  try {
    const raw = getPref(UI_STYLE_PREF_KEY)
    return raw ? normalizeUiStyle(JSON.parse(raw)) : defaultUiStyle()
  } catch {
    // 存档损坏不该让页面打不开：回默认，下次保存时覆盖掉坏值
    return defaultUiStyle()
  }
}

/** 应用当前状态到 DOM（幂等） */
export function applyUiStyle(): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const vars = compileUiStyleVars(styleState.value)
  styleVars.value = vars

  // 先清掉上一次写入的全部托管变量：删掉某项后不能留下旧值
  for (const name of [...applied, ...UI_STYLE_MANAGED_VARS]) root.style.removeProperty(name)
  applied = []

  // 属性只在「有非默认项」时挂上：全默认时 ui-style.css 的派生块完全不参与计算，
  // 视觉 100% 由 style.css 的原 token 决定（少一层常开覆盖，长期风险最小）。
  if (Object.keys(vars).length) root.setAttribute('data-ui-style', 'on')
  else root.removeAttribute('data-ui-style')

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
    applied.push(name)
  }
}

/** 启动时调用：读存档 + 应用（必须在 navPrefs.ensureLoaded() 之后） */
export function initUiStyle(): void {
  styleState.value = readStored()
  applyUiStyle()
}

function persist(): void {
  // 用立即落盘而不是防抖的 setPref：一次调节就是一次点击，写入量极小（单个键、几百字节），
  // 但用户很容易「调完就关页面/刷新」，防抖队列里那一笔会在 pagehide 时赶不上 IDB 事务提交。
  void setPrefNow(UI_STYLE_PREF_KEY, JSON.stringify(styleState.value))
}

/** 单次设置一个调节项（面板点选即调用） */
export function setUiStyleKnob(key: UiStyleKnobKey, value: string): void {
  if (styleState.value[key] === value) return
  styleState.value = normalizeUiStyle({ ...styleState.value, [key]: value })
  applyUiStyle()
  persist()
}

/** 恢复全部默认（不移除偏好键，写入的是默认值，便于后续对比） */
export function resetUiStyle(): void {
  styleState.value = defaultUiStyle()
  applyUiStyle()
  persist()
}

/** 套用预设配方（紧凑 / 标准 / 大字护眼） */
export function applyUiStylePreset(preset: UiStylePreset): void {
  styleState.value = applyPresetValues(preset)
  applyUiStyle()
  persist()
}

/** 整份替换状态：供「导入配置」使用（外部 JSON 已经过 normalizeUiStyle 归一化） */
export function importUiStyleState(raw: unknown): void {
  styleState.value = normalizeUiStyle(raw)
  applyUiStyle()
  persist()
}

/** 面板与导出共用；模块级单例，与 useToast 同风格 */
export function useUiStyle() {
  return {
    state: styleState,
    vars: styleVars,
    changedCount: computed(() => changedKnobCount(styleState.value)),
    isDefault: computed(() => changedKnobCount(styleState.value) === 0),
    cssText: computed(() => uiStyleCssText(styleState.value)),
    setKnob: setUiStyleKnob,
    reset: resetUiStyle,
    applyPreset: applyUiStylePreset,
    importState: importUiStyleState
  }
}

import { shallowRef, readonly } from 'vue'

// 模块级单例：设置弹窗「去设置」入口状态（仿 useToast/useHelpModal 模式，非 Pinia）。
// 供 WeatherCard 等入口调用 openAppSettings() 打开 AppSettingsDialog 并定位到对应设置区块。

/** 定位到目标区块后需要额外自动触发的动作（省掉用户一次点击） */
export type SettingsAction = 'product-cats' | 'expense-cats' | 'low-stock-threshold'

/** 打开设置时要定位的目标区块（主 tab + 可选子 tab）；null = 默认行为（工作台设置 tab） */
export interface SettingsTarget {
  tab: 'nav' | 'wb' | 'remind' | 'business' | 'student' | 'sync'
  sub?: string
  action?: SettingsAction
}

const showAppSettings = shallowRef(false)
const settingsTarget = shallowRef<SettingsTarget | null>(null)

export function useAppSettingsDialog() {
  /**
   * 打开设置弹窗。
   * @param target 可选：指定要定位的主 tab / 子 tab（销售记账等页面的「去设置」入口用），
   *               不传时沿用默认行为（定位到「工作台设置」tab，兼容 WeatherCard 老入口）。
   */
  const openAppSettings = (target?: SettingsTarget) => {
    settingsTarget.value = target ?? null
    showAppSettings.value = true
  }
  const closeAppSettings = () => {
    showAppSettings.value = false
  }
  /** 消费并清空定位目标（设置弹窗打开后调用一次即可，避免下次打开沿用旧目标） */
  const consumeSettingsTarget = (): SettingsTarget | null => {
    const t = settingsTarget.value
    settingsTarget.value = null
    return t
  }

  return {
    showAppSettings: readonly(showAppSettings),
    settingsTarget: readonly(settingsTarget),
    openAppSettings,
    closeAppSettings,
    consumeSettingsTarget
  }
}

import { ref, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useAppSettingsStore } from '@/stores/settings'
import type { PanelViewMode, PanelViewModeKey } from './viewModeCore'

// 统一「列表 / 卡片」视图模式：
// - 移动端（≤768px）强制卡片视图；唯一依据 = CSS 视口宽度，不做 UA 检测
// - PC 端默认列表，可通过切换按钮在两者间切换
// - 传入 persistenceKey（个人工作台 4 个表格面板）时：偏好落到 settings store，
//   随 settings 进 workbench.json（WebDAV）/ 飞书 settings 表，刷新与跨设备保留。
//   不传 key 时仍是组件实例局部状态（销售 / 学生 / 教师 / 博客等既有行为不变）。
// - 移动端只改「显示态」、不写偏好：手机不会把 PC 上选的模式覆盖成卡片再同步回去。

const MOBILE_QUERY = '(max-width: 768px)'

export function useViewMode(persistenceKey?: PanelViewModeKey) {
  const isMobile = ref(false)
  const preferred = ref<PanelViewMode>('list')
  const mode = ref<PanelViewMode>('list')
  // 只在需要持久化的面板上取 store，避免给其余调用方引入额外依赖
  const settings = persistenceKey ? useAppSettingsStore() : null
  let mql: MediaQueryList | null = null
  let handler: ((e: MediaQueryListEvent) => void) | null = null

  const apply = (matches: boolean) => {
    isMobile.value = matches
    mode.value = matches ? 'card' : preferred.value
  }

  onMounted(() => {
    if (settings && persistenceKey) {
      preferred.value = settings.getPanelViewMode(persistenceKey)
    }
    if (typeof window === 'undefined' || !window.matchMedia) {
      apply(false)
      return
    }
    mql = window.matchMedia(MOBILE_QUERY)
    apply(mql.matches)
    handler = (e: MediaQueryListEvent) => apply(e.matches)
    mql.addEventListener('change', handler)
  })

  // 云同步拉回 settings 后 initSettings() 会重跑；已挂载（含 KeepAlive 缓存）的面板
  // 也要跟着切到云端值。本地 toggle 会先写 preferred，watch 命中同值早退，不产生回环。
  if (settings && persistenceKey) {
    const store = settings
    const key = persistenceKey
    watch(
      () => store.workbenchPanelViewModes,
      () => {
        const next = store.getPanelViewMode(key)
        if (next === preferred.value) return
        preferred.value = next
        if (!isMobile.value) mode.value = next
      },
      { deep: true }
    )
  }

  onUnmounted(() => {
    if (mql && handler) mql.removeEventListener('change', handler)
  })

  const toggle = () => {
    if (isMobile.value) return
    const next = mode.value === 'list' ? 'card' : 'list'
    preferred.value = next
    mode.value = next
    if (settings && persistenceKey) settings.setPanelViewMode(persistenceKey, next)
  }

  // 返回 reactive 对象：模板中通过 vm.mode 访问时会自动解包嵌套的 Ref，
  // 否则 vm.mode 仍是 Ref 类型，会触发类型错误（TS2322 / TS2367）。
  return reactive({ mode, isMobile, toggle })
}

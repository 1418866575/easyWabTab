import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// 按需引入：unplugin-auto-import + unplugin-vue-components 会在编译期
// 自动注入用到的 El* 组件及其样式（见 vite.config.js 的 ElementPlusResolver），
// 不再全量引入 element-plus / dist/index.css，显著减小入口包体。
// 暗色主题为 css 变量方案，必须保留（轻量，仅变量定义）。
import 'element-plus/theme-chalk/dark/css-vars.css'
import './styles/element-theme.css'
import './style.css'
import './styles/background.css'
import './styles/mobile.css'
import './styles/records.css'
import './styles/pager.css'
import './styles/scrollbar.css'
// 全局 Markdown 正文排版（renderMarkdown + v-html 预览区统一试用 .md-body，取代各组件 :deep() 重复块）
import './styles/markdown.css'
// 教师工作台共享样式（tw-* 组件类 + 其 @media print 打印规则）。
// 必须全局引入：此前仅在 TeacherView / AppSettingsDialog 两个组件内 import，
// 生产构建时 Vite 会把它只打进其中一个异步 chunk，导致未打开设置弹框时
// teacher.css 根本没加载——页面虽靠 scoped 样式勉强能看，但打印规则全部失效
// （打印只剩浏览器页眉页脚、正文整块缺失）。
import './styles/teacher.css'
// 个人工作台共享视觉层（wb-* 面板原语，全部限定 .wb-content 作用域）。
// 与 teacher.css 同源于「同一套面板视觉」：卡片/标题条/统计数字/按钮/表格。
// 必须全局引入，且放在 teacher.css 之后（同源取值的收口处，后置便于对照阅读）。
import './styles/workbench.css'
// 销售记账弹框通用骨架（商品/进货/库存/销售 四个弹框共用）
import './styles/biz-dialog.css'
import { useThemeStore } from './stores/theme'
import { useAppSettingsStore } from './stores/settings'
import { flushSmartUsageIfCreated } from './stores/smart'
import { useNavPrefs } from './composables/useNavPrefs'
import { configureNavMetaStorage, persistNavMeta } from './composables/navMeta'
import { idbGet, idbPut } from './composables/useIdb'
import type { NavMetaRecord } from './composables/navMeta'
import { ensureIconCacheLoaded } from './composables/useIconCache'
// 弹框打开时锁定背景滚动：手写弹框没有 Element Plus 的 lock-scroll，需全局兜底
import { initScrollLock } from './utils/scrollLock'
// 模块级异步云同步：切换模块（左上角切换器 / Alt+N / 前进后退）时按模块作用域后台推拉
import { initModuleSync } from './composables/useModuleSync'

const app = createApp(App)
const pinia = createPinia()

// 装配导航守卫依据的存储后端（IndexedDB `navmeta`）。
// 必须在 ensureLoaded() 之前：那里会 loadNavMeta 读取基线/高水位。
// 与 nav 主数据同介质，避免旧版「基线存 localStorage 被单独回收 → 守卫整体失效」
configureNavMetaStorage(
  () => idbGet<NavMetaRecord>('navmeta'),
  (record) => idbPut('navmeta', record)
)

app.use(pinia)
app.use(router)
// Element Plus 中文语言包改为在 App.vue 顶层用 <el-config-provider :locale="zhCn"> 承接
// （按需引入后不再 app.use(ElementPlus, { locale })）

// 启动门控：必须先把导航偏好从 localStorage 迁移并载入 nav store（IndexedDB），
// 否则主题/背景/站点外观等 store 初始化时 getPref 会读到空值
const navPrefs = useNavPrefs()

async function bootstrap() {
  try {
    await navPrefs.ensureLoaded()
  } catch (e) {
    console.error('[nav-prefs] 载入失败，导航数据回退空值', e)
  }

  // 图标缓存（v21 起独立 store）后台装载：内含从 nav 的迁移。
  // 不 await —— MB 级读取不该阻塞首屏；未装载完时 getIconUrl 会走网络回退。
  void ensureIconCacheLoaded()

  const themeStore = useThemeStore()
  themeStore.initTheme()
  themeStore.initBackground()
  useAppSettingsStore().initSettings()
  initScrollLock()
  // 必须在 app.mount 之前注册：这样首屏进入的模块也会被计入（首次进入即拉取该模块）
  initModuleSync(router)

  // 页面隐藏/卸载时立即落盘导航偏好，避免防抖导致的数据丢失。
  // 守卫依据（基线/高水位）也要一并 flush：它防抖 500ms，
  // 漏掉的话本次会话确立的基线会丢，下次进入就少了空态拦截能力。
  const flushNav = () => {
    void navPrefs.flushNow()
    void persistNavMeta()
    // 智能工作台的使用计数是本地防抖落盘（不触发云推送），页面隐藏时补一次
    flushSmartUsageIfCreated()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushNav)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNav()
    })
  }

  app.mount('#app')
}

bootstrap()

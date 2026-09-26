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
import { useThemeStore } from './stores/theme'
import { useAppSettingsStore } from './stores/settings'
import { useNavPrefs } from './composables/useNavPrefs'
// 弹框打开时锁定背景滚动：手写弹框没有 Element Plus 的 lock-scroll，需全局兜底
import { initScrollLock } from './utils/scrollLock'

const app = createApp(App)
const pinia = createPinia()

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

  const themeStore = useThemeStore()
  themeStore.initTheme()
  themeStore.initBackground()
  useAppSettingsStore().initSettings()
  initScrollLock()

  // 页面隐藏/卸载时立即落盘导航偏好，避免防抖导致的数据丢失
  const flushNav = () => { void navPrefs.flushNow() }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flushNav)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushNav()
    })
  }

  app.mount('#app')
}

bootstrap()

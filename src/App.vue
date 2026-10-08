<script setup lang="ts">
import { onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useThemeStore } from './stores/theme'
import Toast from './components/Toast.vue'
import ConfirmHost from './components/common/ConfirmHost.vue'
import CountdownReminder from './components/CountdownReminder.vue'
import CloudSyncConflictModal from './components/CloudSyncConflictModal.vue'
import BeianFooter from './components/BeianFooter.vue'
import AppWatermark from './components/AppWatermark.vue'
import { useToast } from './composables/useToast'
import { useCountdownReminder } from './composables/useCountdownReminder'
import { useCloudSync } from './composables/useCloudSync'
// Element Plus 中文语言包（按需引入后，改由顶层 el-config-provider 注入，
// 替代原先 main.ts 里 app.use(ElementPlus, { locale: zhCn })）
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const themeStore = useThemeStore()
const { toasts, removeToast } = useToast()
const cloudSync = useCloudSync()
const route = useRoute()

/**
 * 水印只在**工作台**页面显示，导航站（含首页与工具箱）不显示（需求约定）。
 * 以「白名单」而非「黑名单」判定：新增工作台路由时不会被意外漏掉水印。
 */
const WATERMARK_EXCLUDED_ROUTES = new Set(['home', 'toolbox'])
const watermarkVisible = computed(() => !WATERMARK_EXCLUDED_ROUTES.has(String(route.name ?? '')))

onMounted(() => {
  themeStore.initTheme()
  useCountdownReminder().init()
  cloudSync.init()
  ensurePersistentStorage()
})

// 申请持久化存储：防止移动端浏览器（如华为浏览器）把 IndexedDB 当作 best-effort 源，
// 在存储压力/退出时主动清除，导致云配置与全部数据丢失。persist 成功后浏览器承诺不主动清除，
// 须经用户显式操作才会删除。带 persisted() 检查与异常兜底，失败不影响正常功能。
async function ensurePersistentStorage() {
  try {
    const storage = navigator.storage
    if (!storage || typeof storage.persist !== 'function') return
    if (await storage.persisted()) return
    const granted = await storage.persist()
    console.info('[storage] persistent storage granted:', granted)
  } catch (e) {
    console.warn('[storage] request persist failed:', e)
  }
}
</script>

<template>
  <!--
    顶层 el-config-provider 注入 Element Plus 中文语言包（按需引入后替代 app.use(ElementPlus,{locale})）。
    el-config-provider 由 unplugin-vue-components 自动注册，无需显式 import。
  -->
  <el-config-provider :locale="zhCn">
    <!--
      Route transition: <Transition mode="out-in"> fails when the OLD component
      is a Vue fragment (multiple root elements, e.g. HomeView) because Vue
      cannot apply CSS transition classes to a fragment. The leave phase "completes"
      instantly but the enter phase never starts, leaving a blank page.

      Fix: CSS @keyframes fade-in + :key="$route.path" forces component
      recreation on navigation. Works with both single-root and fragment components.
      The route-transition CSS class is defined in animations.css.
    -->
    <router-view v-slot="{ Component }">
      <component :is="Component" :key="$route.path" class="route-transition" />
    </router-view>
    <!-- 工作台水印：全局单例。position:fixed + pointer-events:none，不占位不拦交互；
         visible=false（导航站）或开关关闭/内容为空时组件不渲染任何节点 → 页面无水印残留。 -->
    <AppWatermark :visible="watermarkVisible" />
    <Toast :toasts="toasts as any" @remove="removeToast" />
    <!-- 统一确认弹框宿主（showConfirm 的底层 UI；全局单例，需挂载一次） -->
    <ConfirmHost />
    <CountdownReminder />
    <CloudSyncConflictModal v-if="cloudSync.conflictData.value" />
    <BeianFooter />
  </el-config-provider>
</template>

<style>
/* 动画 tokens + 过渡 classes */
@import './styles/animations.css';
/* 暗色模式样式 */
@import './styles/dark.css';
/* 多主题强调色覆盖（须在 dark.css 之后，覆盖其 primary 变量） */
@import './styles/themes.css';
</style>

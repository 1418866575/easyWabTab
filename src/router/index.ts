import { createRouter, createWebHistory } from 'vue-router'

// 路由级懒加载：原先 4 个 View 全部静态导入，打开首页就要把工作台/销售/学生
// 全部代码（含 ECharts 图表库）一起下载，移动端首屏白屏时间长。
// 改为访问到哪个模块才加载哪个模块，首屏只需下载导航站所需代码。
const HomeView = () => import('../views/HomeView.vue')
const WorkbenchView = () => import('../views/WorkbenchView.vue')
const BusinessView = () => import('../views/BusinessView.vue')
const StudentView = () => import('../views/StudentView.vue')

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  // 浏览器前进/后退时恢复原滚动位置（此前未定义，返回列表总是跳回顶部）
  scrollBehavior(_to, _from, savedPosition) {
    if (savedPosition) return savedPosition
    return { top: 0 }
  },
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
    {
      path: '/workbench',
      name: 'workbench',
      component: WorkbenchView
    },
    {
      path: '/business',
      name: 'business',
      component: BusinessView
    },
    {
      path: '/student',
      name: 'student',
      component: StudentView
    }
  ]
})

export default router

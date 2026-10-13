import { createRouter, createWebHistory } from 'vue-router'

// 路由级懒加载：原先 4 个 View 全部静态导入，打开首页就要把工作台/销售/学生
// 全部代码（含 ECharts 图表库）一起下载，移动端首屏白屏时间长。
// 改为访问到哪个模块才加载哪个模块，首屏只需下载导航站所需代码。
const HomeView = () => import('../views/HomeView.vue')
const WorkbenchView = () => import('../views/WorkbenchView.vue')
const BusinessView = () => import('../views/BusinessView.vue')
const StudentView = () => import('../views/StudentView.vue')
// TeacherView 同样懒加载：与上面保持一致的按需策略，不拖累导航站首屏
const TeacherView = () => import('../views/TeacherView.vue')
// 工具箱：新增模块，同样懒加载（站内自建工具的实现组件各自再按需加载）
const ToolboxView = () => import('../toolbox/views/ToolboxView.vue')
// 智能工作台（技能库 + 提示词库）：同样懒加载，不拖累导航站首屏
const SmartView = () => import('../views/SmartView.vue')
// 博客管理后台：同样懒加载。数据走独立的 blog.json 云同步信封
const BlogAdminView = () => import('../views/BlogAdminView.vue')
// 博客前台（阅读器）：独立路由，数据同样来自 IndexedDB（blog store）；
// /blog 为列表首页，/blog/article/:slug 为文章详情。两者懒加载，不拖累导航站首屏。
const BlogHomeView = () => import('../views/BlogHomeView.vue')
const BlogPostView = () => import('../views/BlogPostView.vue')
// 个人图书馆：/books 书架首页 + /books/read 站内阅读页（iframe 承载原书 HTML）。
// 书籍数据来自 public/books/manifest.json（构建期扫描生成）与本机 IndexedDB 上传项，两者合并展示。
const BooksView = () => import('../views/BooksView.vue')
const BookReaderView = () => import('../views/BookReaderView.vue')

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
    },
    {
      path: '/teacher',
      name: 'teacher',
      component: TeacherView
    },
    {
      path: '/toolbox',
      name: 'toolbox',
      component: ToolboxView
    },
    {
      path: '/smart',
      name: 'smart',
      component: SmartView
    },
    {
      path: '/blog/admin',
      name: 'blog-admin',
      component: BlogAdminView
    },
    {
      path: '/blog/article/:slug',
      name: 'blog-post',
      component: BlogPostView
    },
    {
      path: '/blog',
      name: 'blog',
      component: BlogHomeView
    },
    {
      // 阅读页用 query 传 id 而非 path 参数：id 可能含中文（上传的文件名），
      // 放进 path 需要额外 encode/decode 往返，中文路径段在部分国产浏览器上还易出问题。
      path: '/books/read',
      name: 'book-reader',
      component: BookReaderView
    },
    {
      path: '/books',
      name: 'books',
      component: BooksView
    }
  ]
})

export default router

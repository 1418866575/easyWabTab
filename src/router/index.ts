import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import WorkbenchView from '../views/WorkbenchView.vue'
import BusinessView from '../views/BusinessView.vue'
import StudentView from '../views/StudentView.vue'
import TeacherView from '../views/TeacherView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
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
    }
  ]
})

export default router

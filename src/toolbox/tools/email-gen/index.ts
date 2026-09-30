import type { ToolboxToolEntry } from '../../types'

/** 邮箱生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'email-gen',
    name: '邮箱生成器',
    icon: '📧',
    description: '按常见邮箱域名批量生成测试邮箱地址，并支持格式校验',
    category: 'gen',
    tags: ['邮箱', 'Email', '邮箱地址', '生成', '校验', '测试数据'],
    status: 'active',
    kind: 'internal',
    order: 90,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./EmailGenTool.vue')
}

export default entry

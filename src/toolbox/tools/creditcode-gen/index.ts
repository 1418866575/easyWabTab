import type { ToolboxToolEntry } from '../../types'

/** 统一社会信用代码生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'creditcode-gen',
    name: '统一社会信用代码生成器',
    icon: '🏢',
    description: '批量生成 GB 32100-2015 统一社会信用代码（18 位）并支持反向校验',
    category: 'gen',
    tags: ['统一社会信用代码', 'GB 32100', '营业执照', '生成', '校验', '测试数据'],
    status: 'active',
    kind: 'internal',
    order: 87,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./CreditcodeGenTool.vue')
}

export default entry

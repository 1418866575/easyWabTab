import type { ToolboxToolEntry } from '../../types'

/** 组织机构代码生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'orgcode-gen',
    name: '组织机构代码生成器',
    icon: '🏷️',
    description: '批量生成 GB/T 11714 组织机构代码（9 位，可选连字符）并支持反向校验',
    category: 'gen',
    tags: ['组织机构代码', 'GB/T 11714', '号码', '生成', '校验', '测试数据'],
    status: 'active',
    kind: 'internal',
    order: 86,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./OrgcodeGenTool.vue')
}

export default entry

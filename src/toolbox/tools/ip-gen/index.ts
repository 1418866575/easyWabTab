import type { ToolboxToolEntry } from '../../types'

/** IP 地址生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'ip-gen',
    name: 'IP 地址生成器',
    icon: '🌐',
    description: '批量生成 IPv4 地址（默认随机私网，可指定网段前缀）并支持格式校验',
    category: 'gen',
    tags: ['IP', 'IPv4', '私网地址', '网段', '生成', '校验', '测试数据'],
    status: 'active',
    kind: 'internal',
    order: 91,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./IpGenTool.vue')
}

export default entry

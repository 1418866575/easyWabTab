import type { ToolboxToolEntry } from '../../types'

/** IP 查询（站内自建：本机公网 IP 回显 + 地址解析 + DoH 域名解析） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'ip-query',
    name: 'IP 查询',
    icon: '🌐',
    description: '获取公网 IP、解析 IP 性质/网段、域名 DoH 解析（需联网）',
    category: 'dev',
    tags: ["IP", "公网IP", "DNS", "域名", "网段", "CIDR"],
    status: 'active',
    kind: 'internal',
    order: 103,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./IpQueryTool.vue')
}

export default entry

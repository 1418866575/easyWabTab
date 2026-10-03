import type { ToolboxToolEntry } from '../../types'

/** 连通性检测（纯前端 HTTP 探测，零上传） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'ping-check',
    name: '连通性检测',
    icon: '📡',
    description: '批量检测网址/IP 是否连通，表格展示通过与拒绝（绿勾/红叉），纯前端零上传',
    category: 'dev',
    tags: ['ping', '连通', '检测', '网络', 'ip', '可用性'],
    status: 'active',
    kind: 'internal',
    order: 87,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-03'
  },
  component: () => import('./PingCheckTool.vue')
}

export default entry

import type { ToolboxToolEntry } from '../../types'

/** 网络测速（站内自建，同源资源测下行，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'speed-test',
    name: '网络测速',
    icon: '📶',
    description: '下载本站静态资源测下行带宽与延迟抖动，纯本地计算，不含上行测速',
    category: 'effi',
    tags: ["测速", "带宽", "延迟", "抖动", "网络"],
    status: 'active',
    kind: 'internal',
    order: 112,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./SpeedTestTool.vue')
}

export default entry

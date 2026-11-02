import type { ToolboxToolEntry } from '../../types'

/** 浏览器环境检测（站内自建，本地采集，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'browser-env',
    name: '浏览器环境检测',
    icon: '🧭',
    description: '一键检测浏览器、系统、屏幕、网络、存储与能力矩阵，可导出排查报告',
    category: 'dev',
    tags: ["浏览器", "环境", "UA", "检测", "报告"],
    status: 'active',
    kind: 'internal',
    order: 119,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./BrowserEnvTool.vue')
}

export default entry

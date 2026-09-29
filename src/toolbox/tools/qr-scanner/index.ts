import type { ToolboxToolEntry } from '../../types'

/** 二维码扫描器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'qr-scanner',
    name: '二维码扫描器',
    icon: '📸',
    description: '识别图片中的二维码并解析 URL/WiFi/名片等内容，本地识别',
    category: 'image',
    tags: ["二维码","扫码","识别"],
    status: 'active',
    kind: 'internal',
    order: 48,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-09-30'
  },
  component: () => import('./QrScannerTool.vue')
}

export default entry

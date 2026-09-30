import type { ToolboxToolEntry } from '../../types'

/** 二维码生成器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'qrcode-gen',
    name: '二维码生成器',
    icon: '📱',
    description: '生成自定义颜色与尺寸的二维码，支持纠错等级与 Logo，导出 PNG/SVG',
    category: 'gen',
    tags: ["二维码","qrcode","生成"],
    status: 'active',
    kind: 'internal',
    order: 83,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-09-30'
  },
  component: () => import('./QrcodeGenTool.vue')
}

export default entry

import type { ToolboxToolEntry } from '../../types'

/** 印章生成器（站内自建，SVG 本地绘制，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'seal-maker',
    name: '印章生成器',
    icon: '🪧',
    description: '在线制作圆章、方章、椭圆章，字体与做旧可调，导出透明 PNG 或盖到图片上',
    category: 'image',
    tags: ["印章", "盖章", "生成", "做旧", "图片"],
    status: 'active',
    kind: 'internal',
    order: 122,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./SealMakerTool.vue')
}

export default entry

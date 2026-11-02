import type { ToolboxToolEntry } from '../../types'

/** 在线画板（站内自建，canvas 本地绘制，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'whiteboard',
    name: '在线画板',
    icon: '🎨',
    description: '画笔、直线、箭头、矩形、椭圆、文字与橡皮，支持撤销重做并导出 PNG',
    category: 'image',
    tags: ["画板", "白板", "绘图", "标注", "草图", "canvas"],
    status: 'active',
    kind: 'internal',
    order: 108,
    modalSize: 'XL',
    layout: 'T5',
    addedAt: '2026-11-02'
  },
  component: () => import('./WhiteboardTool.vue')
}

export default entry

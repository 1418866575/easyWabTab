import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'screenshot-annotate',
    name: '截图标注工具',
    icon: '🖍️',
    description: '上传图片后画笔、矩形、箭头、文字标注，撤销重做并导出 PNG，本地处理',
    category: 'image',
    tags: ['截图', '标注', 'annotate', '图片'],
    status: 'active',
    kind: 'internal',
    order: 20,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-10-02'
  },
  component: () => import('./ScreenshotAnnotateTool.vue')
}

export default entry

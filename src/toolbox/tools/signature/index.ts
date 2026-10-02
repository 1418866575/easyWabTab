import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'signature',
    name: '电子签名生成器',
    icon: '✍️',
    description: '手写签名并导出透明 PNG，纯本地绘制不上传',
    category: 'device',
    tags: ['签名', 'signature', '手写'],
    status: 'active',
    kind: 'internal',
    order: 20,
    modalSize: 'M',
    layout: 'T5',
    addedAt: '2026-10-02'
  },
  component: () => import('./SignatureTool.vue')
}

export default entry

import type { ToolboxToolEntry } from '../../types'

/** 九宫格切图（站内自建，canvas 本地切分，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'nine-grid',
    name: '九宫格切图',
    icon: '🔲',
    description: '一张图按行列切成九宫格或自定义网格，单格下载或打包 ZIP，纯本地处理',
    category: 'image',
    tags: ["切图", "九宫格", "网格", "朋友圈", "分割"],
    status: 'active',
    kind: 'internal',
    order: 106,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-11-02'
  },
  component: () => import('./NineGridTool.vue')
}

export default entry

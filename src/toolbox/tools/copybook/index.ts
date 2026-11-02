import type { ToolboxToolEntry } from '../../types'

/** 字帖生成器（站内自建，A4 打印排版，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'copybook',
    name: '字帖生成器',
    icon: '🖌️',
    description: '输入汉字生成 A4 字帖，田字格 / 米字格 / 方格 / 四线格与描红浓度可选，直接打印',
    category: 'doc',
    tags: ["字帖", "田字格", "描红", "打印", "练字"],
    status: 'active',
    kind: 'internal',
    order: 125,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./CopybookTool.vue')
}

export default entry

import type { ToolboxToolEntry } from '../../types'

/** 随机头像生成（站内自建，SVG 本地生成，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'avatar-generator',
    name: '随机头像生成',
    icon: '🧑',
    description: '像素 / 字母 / 卡通几何三种风格头像，种子可复现，导出 SVG 与 PNG',
    category: 'image',
    tags: ["头像", "生成", "像素", "字母", "卡通"],
    status: 'active',
    kind: 'internal',
    order: 121,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-11-02'
  },
  component: () => import('./AvatarGeneratorTool.vue')
}

export default entry

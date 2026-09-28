import type { ToolboxToolEntry } from '../../types'

/** 文本对比（站内自建） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'text-diff',
    name: '文本对比',
    icon: '↔️',
    description: '两段文本差异对比，高亮增删行',
    category: 'dev',
    tags: ['diff', '对比'],
    status: 'active',
    kind: 'internal',
    order: 4
  },
  component: () => import('./TextDiffTool.vue')
}

export default entry

import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'contrast-check',
    name: '色彩对比度检查器',
    icon: '🌓',
    description: '按 WCAG 2.1 计算两色对比度，判断 AA/AAA 通过情况，辅助无障碍配色',
    category: 'color',
    tags: ['对比度', 'wcag', '配色', '无障碍'],
    status: 'active',
    kind: 'internal',
    order: 20,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-10-02'
  },
  component: () => import('./ContrastCheckTool.vue')
}

export default entry

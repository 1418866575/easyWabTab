import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'protractor',
    name: '量角器',
    icon: '📐',
    description: '画布上拖动三个点测量两条射线之间的夹角',
    category: 'device',
    tags: ['量角器', '角度', '测量', 'protractor'],
    status: 'active',
    kind: 'internal',
    order: 12,
    modalSize: 'L',
    layout: 'T5',
    addedAt: '2026-10-02'
  },
  component: () => import('./ProtractorTool.vue')
}

export default entry

import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'screen-ruler',
    name: '屏幕标尺',
    icon: '📏',
    description: '按 CSS 像素测量屏幕长度，并换算近似毫米',
    category: 'device',
    tags: ['标尺', '测量', '像素', 'ruler'],
    status: 'active',
    kind: 'internal',
    order: 13,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-10-02'
  },
  component: () => import('./ScreenRulerTool.vue')
}

export default entry

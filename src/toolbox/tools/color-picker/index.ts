import type { ToolboxToolEntry } from '../../types'

/** 取色与色值转换（站内自建） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'color-picker',
    name: '取色与色值转换',
    icon: '💧',
    description: '拾取颜色并输出 HEX / RGB / HSL 色值',
    category: 'media',
    tags: ['取色', '颜色'],
    status: 'active',
    kind: 'internal',
    order: 9
  },
  component: () => import('./ColorPickerTool.vue')
}

export default entry

import type { ToolboxToolEntry } from '../../types'

/** 颜色转换与取色器（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'color-picker',
    name: '颜色转换与取色器',
    icon: '💧',
    description: 'HEX/RGB/HSL/HSV/CMYK 互转、可视化取色与 WCAG 对比度检查',
    category: 'color',
    tags: ["取色","颜色","对比度"],
    status: 'active',
    kind: 'internal',
    order: 51,
    modalSize: 'M',
    layout: 'T4',
    addedAt: '2026-09-30'
  },
  component: () => import('./ColorPickerTool.vue')
}

export default entry

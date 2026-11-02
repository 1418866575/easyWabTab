import type { ToolboxToolEntry } from '../../types'

/** 字数统计（站内自建，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'word-count',
    name: '字数统计',
    icon: '🔢',
    description: '实时统计字符、中文字、英文词、标点、行数与阅读时长，并列出高频字词',
    category: 'text',
    tags: ["字数", "统计", "词频", "阅读时长"],
    status: 'active',
    kind: 'internal',
    order: 100,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./WordCountTool.vue')
}

export default entry

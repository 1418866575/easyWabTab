import type { ToolboxToolEntry } from '../../types'

/** 中英互译 + 词汇本（站内自建，离线小词库，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'translator',
    name: '中英互译',
    icon: '🔤',
    description: '离线高频词查询与中英互查，查过的词收进词汇本按熟悉度复习',
    category: 'text',
    tags: ["翻译", "词典", "英语", "词汇", "背单词"],
    status: 'active',
    kind: 'internal',
    order: 115,
    modalSize: 'M',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./TranslatorTool.vue')
}

export default entry

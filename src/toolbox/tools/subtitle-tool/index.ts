import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'subtitle-tool',
    name: '字幕编辑转换',
    icon: '💬',
    description: '解析 SRT / VTT 字幕，预览条目并转换为其它格式或纯文本',
    category: 'text',
    tags: ['字幕', 'srt', 'vtt', '转换', '字幕'],
    status: 'active',
    kind: 'internal',
    order: 40,
    modalSize: 'L',
    layout: 'T2',
    addedAt: '2026-10-02'
  },
  component: () => import('./SubtitleTool.vue')
}

export default entry

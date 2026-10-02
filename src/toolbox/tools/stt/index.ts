import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'stt',
    name: '语音转文字',
    icon: '🎤',
    description: '使用浏览器语音识别将麦克风语音实时转为文字（需授权麦克风）',
    category: 'device',
    tags: ['stt', '语音', '识别'],
    status: 'active',
    kind: 'internal',
    order: 31,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-02'
  },
  component: () => import('./SttTool.vue')
}

export default entry

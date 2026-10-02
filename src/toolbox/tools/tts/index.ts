import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'tts',
    name: '文字转语音',
    icon: '🔊',
    description: '使用浏览器内置语音合成朗读文本，支持中文音色与语速/音调调节',
    category: 'device',
    tags: ['tts', '语音', '朗读'],
    status: 'active',
    kind: 'internal',
    order: 30,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-02'
  },
  component: () => import('./TtsTool.vue')
}

export default entry

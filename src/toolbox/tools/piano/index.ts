import type { ToolboxToolEntry } from '../../types'

/** 在线钢琴（站内自建，WebAudio 合成，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'piano',
    name: '在线钢琴',
    icon: '🎹',
    description: '两个八度键盘，鼠标 / 触屏 / 电脑键盘弹奏，三种音色与延音踏板，内置曲目演示',
    category: 'media',
    tags: ["钢琴", "音乐", "键盘", "合成器", "演奏"],
    status: 'active',
    kind: 'internal',
    order: 123,
    modalSize: 'L',
    layout: 'T1',
    addedAt: '2026-11-02'
  },
  component: () => import('./PianoTool.vue')
}

export default entry

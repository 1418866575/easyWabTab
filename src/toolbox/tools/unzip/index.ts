import type { ToolboxToolEntry } from '../../types'

/** 在线解压 ZIP（站内自建，fflate 本地解析，纯前端实现） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'unzip',
    name: '在线解压 ZIP',
    icon: '🗜️',
    description: '浏览器本地解压 ZIP，列出文件、预览文本、单文件下载或重新打包，不上传服务器',
    category: 'effi',
    tags: ["解压", "ZIP", "压缩包", "预览", "本地"],
    status: 'active',
    kind: 'internal',
    order: 107,
    modalSize: 'L',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./UnzipTool.vue')
}

export default entry

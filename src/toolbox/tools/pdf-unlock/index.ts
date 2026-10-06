import type { ToolboxToolEntry } from '../../types'

const entry: ToolboxToolEntry = {
  meta: {
    id: 'pdf-unlock',
    name: 'PDF 去保护',
    icon: '🔓',
    // 能力边界：pdf-lib 不支持解密，加密文件无法处理；本工具只清除权限限制标记
    description: '清除 PDF 的编辑/复制等权限限制标记另存，纯前端零上传（不处理加密文件）',
    category: 'pdf',
    tags: ['pdf', '去保护', '权限', '限制', '解除限制', 'unlock'],
    status: 'active',
    kind: 'internal',
    order: 18,
    modalSize: 'M',
    layout: 'T1',
    addedAt: '2026-10-03'
  },
  component: () => import('./PdfUnlockTool.vue')
}

export default entry

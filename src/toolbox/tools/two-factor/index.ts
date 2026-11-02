import type { ToolboxToolEntry } from '../../types'

/** 身份验证器 TOTP（站内自建，WebCrypto 本地计算，密钥加密存本机） */
const entry: ToolboxToolEntry = {
  meta: {
    id: 'two-factor',
    name: '身份验证器',
    icon: '🔐',
    description: '网页版两步验证器，解析 otpauth 链接或手动录入密钥，实时生成 6 位动态验证码',
    category: 'cert',
    tags: ["TOTP", "2FA", "动态验证码", "otpauth", "Google Authenticator"],
    status: 'active',
    kind: 'internal',
    order: 109,
    modalSize: 'M',
    layout: 'T6',
    addedAt: '2026-11-02'
  },
  component: () => import('./TwoFactorTool.vue')
}

export default entry

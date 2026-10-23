// 微信公众号凭证配置（仅前端 ↔ 后端代理 /api/wechat/config）
//
// 安全边界：
//   - 前端只拿到「是否已配置」「掩码 AppID」「是否配置过 Secret」三个非敏感状态，
//     绝不接收 AppSecret 明文，也不写入任何前端 store / 云同步。
//   - AppSecret 由后端落盘 config/wechat.env（gitignore，mode 0600），仅后端可读。
//   - 提交时留空 AppSecret = 不修改（沿用后端已存值），避免每次都要重填整段密钥。

import { ref } from 'vue'

const API_BASE = '/api/wechat'

export interface WechatConfigView {
  ok: boolean
  configured: boolean
  appIdMasked: string
  appSecretConfigured: boolean
  message?: string
  error?: string
  wx?: { code: string; message: string }
}

// 与后端 wechat-proxy.cjs 校验保持一致：AppID 16-32 位字母数字，AppSecret 32-64 位
export function isValidAppId(value: string): boolean {
  return /^[a-zA-Z0-9]{16,32}$/.test(value)
}
export function isValidAppSecret(value: string): boolean {
  return /^[a-zA-Z0-9]{32,64}$/.test(value)
}

export function useWechatConfig() {
  // 表单字段（仅本地，不持久化到 store）
  const appId = ref('')
  const appSecret = ref('')

  // 状态展示
  const loading = ref(false)
  const saving = ref(false)
  const error = ref('')
  const successMsg = ref('')
  const configured = ref(false)
  const appIdMasked = ref('')
  const appSecretConfigured = ref(false)

  async function loadConfig(): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      })
      const data = (await res.json()) as WechatConfigView
      configured.value = !!data.configured
      appIdMasked.value = data.appIdMasked || ''
      appSecretConfigured.value = !!data.appSecretConfigured
    } catch (e) {
      error.value = '读取微信凭证配置失败：' + (e instanceof Error ? e.message : String(e))
    } finally {
      loading.value = false
    }
  }

  async function saveConfig(): Promise<boolean> {
    error.value = ''
    successMsg.value = ''

    const id = appId.value.trim()
    const secret = appSecret.value.trim()

    // 客户端格式校验（后端会再校验一次）
    if (!id) {
      error.value = '请填写 AppID'
      return false
    }
    if (!isValidAppId(id)) {
      error.value = 'AppID 格式不正确（应为 16-32 位字母数字）'
      return false
    }
    // AppSecret 留空 = 不修改（沿用后端已存值）；填写则必须格式正确
    if (secret && !isValidAppSecret(secret)) {
      error.value = 'AppSecret 格式不正确（应为 32-64 位字母数字）'
      return false
    }

    saving.value = true
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ appId: id, appSecret: secret })
      })
      const data = (await res.json()) as WechatConfigView

      if (data.ok) {
        configured.value = !!data.configured
        appIdMasked.value = data.appIdMasked || ''
        appSecretConfigured.value = !!data.appSecretConfigured
        successMsg.value = data.message || '凭证已保存'
        // 保存成功后清空本地 secret 输入框，避免明文残留在内存里
        appSecret.value = ''
        return true
      }

      // 后端返回 ok:false：可能是格式问题，或凭证已保存但微信校验未通过（IP 白名单/AppSecret 错）
      error.value = data.error || '凭证保存失败'
      if (data.wx && data.wx.code) {
        error.value += `（微信：${data.wx.code} ${data.wx.message || ''}）`.trim()
      }
      return false
    } catch (e) {
      error.value = '凭证保存请求失败：' + (e instanceof Error ? e.message : String(e))
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    appId,
    appSecret,
    loading,
    saving,
    error,
    successMsg,
    configured,
    appIdMasked,
    appSecretConfigured,
    loadConfig,
    saveConfig
  }
}

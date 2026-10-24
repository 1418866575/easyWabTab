// 微信公众号凭证配置（客户端自管理）
//
// 安全边界（修订后）：
//   - 凭证（AppID / AppSecret）只存在于**浏览器本地 + 随 blog.json 云同步信封**，
//     再也不落任何服务端文件（config/wechat.env 已彻底移除）。多租户隔离由前端按 AppID 调用保证。
//   - 前端拿到的是明文 appSecret（本机/本账号使用所需），但只用于随请求发给无状态代理，
//     代理不落盘、仅按 AppID 缓存 token。
//   - 服务端 /api/wechat/config 现在只做「格式 + liveness 校验」，不存储；本项目把它当作
//     一次"连接测试"，失败不影响本地保存（本地才是凭证的唯一权威来源）。

import { computed, ref } from 'vue'
import { useBlogStore } from '@/stores/blog'

const API_BASE = '/api/wechat'

export interface WechatConfigView {
  ok: boolean
  clientManaged?: boolean
  configured?: boolean
  appIdMasked?: string
  appSecretConfigured?: boolean
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

function maskAppId(appId: string): string {
  if (!appId) return ''
  if (appId.length <= 8) return appId[0] + '****'
  return appId.slice(0, 4) + '****' + appId.slice(-4)
}

export function useWechatConfig() {
  const store = useBlogStore()

  // 表单字段
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
  /** liveness 校验（连微信取 token）是否成功；null = 未校验（代理不可达或尚未保存） */
  const verified = ref<boolean | null>(null)

  // 本地是否已配置（直接读 store，无需网络）
  const locallyConfigured = computed(() => store.wechatConfigured)

  /** 从本地 store 读取凭证状态（同步，无需网络）；并预填 AppID 供编辑 */
  function loadConfig(): void {
    const w = store.wechat
    configured.value = !!w?.appId && !!w?.appSecret
    appIdMasked.value = maskAppId(w?.appId || '')
    appSecretConfigured.value = !!w?.appSecret
    appId.value = w?.appId || ''
    // AppSecret 不预填（避免明文残留在输入框；留空 = 沿用已保存值）
    appSecret.value = ''
    verified.value = null
  }

  /** 仅做格式校验 + 把凭证写入本地 store（随云同步）；再 best-effort 连微信做 liveness */
  async function saveConfig(): Promise<boolean> {
    error.value = ''
    successMsg.value = ''
    verified.value = null

    const id = appId.value.trim()
    const secretInput = appSecret.value.trim()

    if (!id) {
      error.value = '请填写 AppID'
      return false
    }
    if (!isValidAppId(id)) {
      error.value = 'AppID 格式不正确（应为 16-32 位字母数字）'
      return false
    }

    // AppSecret：填写则校验；留空则沿用已保存值（避免每次重填整段密钥）
    const existingSecret = store.wechat?.appSecret || ''
    let finalSecret = secretInput || existingSecret
    if (secretInput && !isValidAppSecret(secretInput)) {
      error.value = 'AppSecret 格式不正确（应为 32-64 位字母数字）'
      return false
    }
    if (!finalSecret) {
      error.value = '请填写 AppSecret（首次配置必填）'
      return false
    }

    // 1) 本地落库（云同步的权威来源）
    await store.saveWechat(id, finalSecret)
    configured.value = true
    appIdMasked.value = maskAppId(id)
    appSecretConfigured.value = true
    successMsg.value = '凭证已保存到本地，并随云同步同步到其它设备'

    // 2) best-effort liveness：连微信取 token 校验（代理不可达也不影响本地保存）
    saving.value = true
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ appId: id, appSecret: finalSecret })
      })
      const data = (await res.json()) as WechatConfigView
      if (data.ok) {
        verified.value = true
        successMsg.value = '凭证有效（已通过微信校验），并保存到本地'
      } else {
        verified.value = false
        error.value = data.error || '微信校验未通过'
        if (data.wx && data.wx.code) {
          error.value += `（微信：${data.wx.code} ${data.wx.message || ''}）`.trim()
        }
      }
    } catch {
      // 代理不可达：本地已保存，仅提示稍后可在部署了代理的环境验证
      verified.value = null
      successMsg.value = '凭证已保存到本地（代理暂不可达，未做微信校验；部署代理后可验证）'
    } finally {
      saving.value = false
      // 保存成功后清空本地 secret 输入框，避免明文残留在内存里
      appSecret.value = ''
    }
    return true
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
    verified,
    locallyConfigured,
    loadConfig,
    saveConfig
  }
}

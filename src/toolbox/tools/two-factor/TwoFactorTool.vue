<script setup lang="ts">
/**
 * 身份验证器（TOTP）：添加密钥后实时生成 6 位动态验证码
 *
 * 存储约定：密钥用 crypto-js AES 加密后写入 IndexedDB，密钥材料是本机随机串。
 * 这只是「避免明文散落」级别的防护，不能防御本机恶意程序 —— UI 已如实说明。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CryptoJS from 'crypto-js'
import {
  base32Encode,
  groupCode,
  isWebCryptoAvailable,
  isValidBase32,
  normalizeBase32,
  parseOtpauthUri,
  remainingSeconds,
  totp,
  type OtpAccount
} from './totpCore'
import { loadToolData, saveToolData } from '../../core/toolStore'
import { useToast } from '@/composables/useToast'

const TOOL_ID = 'two-factor'
const LS_KEY_ID = 'toolbox:two-factor:keymat'

const toast = useToast()

const accounts = ref<OtpAccount[]>([])
const codes = ref<Record<string, string>>({})
const now = ref(Date.now())
const adding = ref(false)
const formSecret = ref('')
const formIssuer = ref('')
const formAccount = ref('')
const formDigits = ref(6)
const formPeriod = ref(30)
const revealed = ref<Record<string, boolean>>({})
const cryptoOk = isWebCryptoAvailable()
const loaded = ref(false)

let ticker: ReturnType<typeof setInterval> | null = null

/** 本机密钥材料：首次使用时随机生成并留在 localStorage，仅用于避免明文存储 */
function keyMat(): string {
  let v = localStorage.getItem(LS_KEY_ID)
  if (!v) {
    v = CryptoJS.lib.WordArray.random(32).toString()
    localStorage.setItem(LS_KEY_ID, v)
  }
  return v
}

function enc(plain: string): string {
  return CryptoJS.AES.encrypt(plain, keyMat()).toString()
}

function dec(cipher: string): string {
  try {
    return CryptoJS.AES.decrypt(cipher, keyMat()).toString(CryptoJS.enc.Utf8)
  } catch {
    return ''
  }
}

interface StoredAccount extends Omit<OtpAccount, 'secret'> {
  secret: string
}

function normalize(list: unknown): OtpAccount[] {
  if (!Array.isArray(list)) return []
  return list
    .map((raw) => raw as Partial<StoredAccount>)
    .filter((a) => a && typeof a.id === 'string' && typeof a.secret === 'string')
    .map((a) => ({
      id: a.id as string,
      issuer: typeof a.issuer === 'string' ? a.issuer : '',
      account: typeof a.account === 'string' ? a.account : '',
      secret: a.secret as string,
      digits: a.digits === 8 ? 8 : 6,
      period: Number(a.period) === 60 ? 60 : 30,
      algorithm: a.algorithm === 'SHA256' || a.algorithm === 'SHA512' ? a.algorithm : 'SHA1'
    }))
}

async function persist() {
  await saveToolData(TOOL_ID, accounts.value)
}

async function refreshCodes() {
  if (!cryptoOk) return
  const out: Record<string, string> = {}
  for (const a of accounts.value) {
    try {
      const secret = dec(a.secret)
      out[a.id] = secret ? await totp(secret, a.digits, a.period, a.algorithm, now.value) : '••••••'
    } catch {
      out[a.id] = '错误'
    }
  }
  codes.value = out
}

function addAccount() {
  const raw = formSecret.value.trim()
  const parsed = parseOtpauthUri(raw)
  let secret = ''
  let issuer = formIssuer.value.trim()
  let account = formAccount.value.trim()
  let digits = formDigits.value
  let period = formPeriod.value
  if (parsed) {
    secret = parsed.secret
    issuer = issuer || parsed.issuer || ''
    account = account || parsed.account || ''
    digits = parsed.digits
    period = parsed.period
  } else {
    secret = normalizeBase32(raw)
    if (!isValidBase32(secret)) {
      toast.error('密钥不是合法的 Base32，也不是有效的 otpauth:// 链接')
      return
    }
  }
  accounts.value = accounts.value.concat([
    { id: `a${Date.now()}${Math.random().toString(36).slice(2, 6)}`, issuer, account, secret: enc(secret), digits, period, algorithm: 'SHA1' }
  ])
  formSecret.value = ''
  formIssuer.value = ''
  formAccount.value = ''
  adding.value = false
  void persist().then(refreshCodes)
}

function removeAccount(id: string) {
  accounts.value = accounts.value.filter((a) => a.id !== id)
  void persist().then(refreshCodes)
}

function toggleReveal(id: string) {
  revealed.value = { ...revealed.value, [id]: !revealed.value[id] }
}

function secretOf(a: OtpAccount): string {
  return revealed.value[a.id] ? dec(a.secret) : '•'.repeat(24)
}

function labelOf(a: OtpAccount): string {
  return [a.issuer, a.account].filter(Boolean).join(' · ') || '未命名账号'
}

async function copyCode(a: OtpAccount) {
  const code = codes.value[a.id]
  if (!code || !/^\d+$/.test(code)) {
    toast.warning('当前没有可复制的验证码')
    return
  }
  try {
    await navigator.clipboard.writeText(code)
    toast.success('验证码已复制')
  } catch {
    toast.error('复制失败')
  }
}

const periodProgress = computed(() => {
  const p = accounts.value[0]?.period ?? 30
  const left = remainingSeconds(p, now.value)
  return { left, percent: Math.round((left / p) * 100) }
})

function generateRandomSecret() {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  formSecret.value = base32Encode(bytes)
}

onMounted(async () => {
  const raw = await loadToolData<unknown[]>(TOOL_ID, [])
  accounts.value = normalize(raw)
  loaded.value = true
  await refreshCodes()
  ticker = setInterval(async () => {
    now.value = Date.now()
    await refreshCodes()
  }, 1000)
})

onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})
</script>

<template>
  <div class="tu-t1">
    <p v-if="!cryptoOk" class="tu-alert">
      当前环境不是安全上下文（需 HTTPS 或 localhost），浏览器不提供 WebCrypto，无法计算动态验证码。
    </p>
    <p v-else class="tu-alert info">
      密钥以 AES 加密存于本机 IndexedDB，仅能避免明文散落，不能防御本机恶意程序；请勿在不信任的设备上录入生产账号。
    </p>

    <div class="tu-toolbar">
      <span class="tu-hint tf-inline">已添加 {{ accounts.length }} 个账号</span>
      <span class="tu-spacer"></span>
      <button type="button" class="tu-btn" :disabled="!cryptoOk" @click="adding = !adding">
        {{ adding ? '收起' : '添加账号' }}
      </button>
    </div>

    <div v-if="adding" class="tu-card">
      <label class="tu-label">密钥或 otpauth:// 链接</label>
      <input
        v-model="formSecret"
        type="text"
        class="tu-input"
        placeholder="粘贴 JBSWY3DPEHPK3PXP 或 otpauth://totp/…"
        data-testid="tb-2fa-secret"
      />
      <div class="tu-row">
        <button type="button" class="tu-btn ghost tf-btn" @click="generateRandomSecret">生成随机密钥</button>
      </div>
      <div class="tu-row">
        <label class="tu-label tf-inline">服务商</label>
        <input v-model="formIssuer" type="text" class="tu-input tf-narrow" placeholder="如 GitHub" />
        <label class="tu-label tf-inline">账号</label>
        <input v-model="formAccount" type="text" class="tu-input tf-narrow" placeholder="如 user@example.com" />
      </div>
      <div class="tu-row">
        <label class="tu-label tf-inline">位数</label>
        <select v-model.number="formDigits" class="tu-select">
          <option :value="6">6 位</option>
          <option :value="8">8 位</option>
        </select>
        <label class="tu-label tf-inline">周期</label>
        <select v-model.number="formPeriod" class="tu-select">
          <option :value="30">30 秒</option>
          <option :value="60">60 秒</option>
        </select>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn" @click="addAccount">保存</button>
      </div>
      <p class="tu-hint">粘贴 otpauth:// 链接时，位数与周期以链接为准；手动输入密钥时以上方选择为准。</p>
    </div>

    <div v-if="!accounts.length" class="tu-card">
      <p v-if="loaded" class="tu-hint tf-empty">还没有账号，点击「添加账号」开始。</p>
    </div>

    <div v-for="a in accounts" :key="a.id" class="tu-card tf-item">
      <div class="tf-head">
        <div class="tf-name">{{ labelOf(a) }}</div>
        <div class="tf-code" @click="copyCode(a)">{{ codes[a.id] ? groupCode(codes[a.id]) : '••• •••' }}</div>
      </div>
      <div class="tf-foot">
        <span class="tf-meta">{{ a.digits }} 位 / {{ a.period }} 秒 / {{ a.algorithm }}</span>
        <span class="tf-secret" @click="toggleReveal(a.id)">{{ secretOf(a) }}</span>
        <span class="tu-spacer"></span>
        <button type="button" class="tu-btn ghost tf-btn" @click="copyCode(a)">复制</button>
        <button type="button" class="tu-btn ghost tf-btn" @click="removeAccount(a.id)">删除</button>
      </div>
    </div>

    <div v-if="accounts.length" class="tf-timer">
      <div class="tf-bar"><div class="tf-bar-fill" :style="{ width: periodProgress.percent + '%' }"></div></div>
      <span class="tu-hint">{{ periodProgress.left }} 秒后刷新</span>
    </div>
  </div>
</template>

<style scoped>
.tf-inline { margin-bottom: 0; }
.tf-narrow { width: auto; min-width: 150px; }
.tf-btn { min-height: 28px; padding: 3px 10px; font-size: 12px; }
.tf-item { margin-bottom: 8px; }
.tf-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.tf-name { font-size: 13px; font-weight: 600; color: var(--color-text); }
.tf-code {
  margin-left: auto;
  font-family: var(--font-family-mono);
  font-size: 22px;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
}
.tf-foot { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
.tf-meta { font-size: 11.5px; color: var(--color-text-muted); }
.tf-secret {
  font-family: var(--font-family-mono);
  font-size: 11.5px;
  color: var(--color-text-muted);
  cursor: pointer;
  word-break: break-all;
}
.tf-empty { margin: 0; }
.tf-timer { display: flex; align-items: center; gap: 10px; }
.tf-bar { flex: 1; height: 6px; background: var(--color-bg-input); border-radius: var(--radius-full); overflow: hidden; }
.tf-bar-fill { height: 100%; background: var(--color-primary); transition: width 1s linear; }
</style>

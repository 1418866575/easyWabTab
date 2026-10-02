<script setup lang="ts">
import { computed, ref } from 'vue'
import { signJwt } from '../../core/jwt'
import { copyText } from '../../core/download'

const alg = ref<'HS256' | 'HS384' | 'HS512'>('HS256')
const secret = ref('my-secret')
const payloadText = ref('{\n  "sub": "1234567890",\n  "name": "张三",\n  "admin": true,\n  "iat": ' + Math.floor(Date.now() / 1000) + '\n}')
const headerText = ref('{\n  "alg": "HS256",\n  "typ": "JWT"\n}')
const token = ref('')
const error = ref('')

const result = computed(() => {
  error.value = ''
  if (!payloadText.value.trim()) return null
  let payload: Record<string, unknown>
  try { payload = JSON.parse(payloadText.value) } catch (e) { error.value = 'payload 非合法 JSON：' + (e as Error).message; return null }
  const r = signJwt({ payload, secret: secret.value, alg: alg.value })
  if (r.error) { error.value = r.error; return null }
  return r.token
})

function generate() {
  const r = result.value
  token.value = r || ''
  if (r) copyText(r)
}
</script>

<template>
  <div class="tu-t4">
    <div class="tu-t1">
      <div class="tu-row">
        <label class="tu-label">算法</label>
        <select v-model="alg" class="tu-select">
          <option value="HS256">HS256</option>
          <option value="HS384">HS384</option>
          <option value="HS512">HS512</option>
        </select>
      </div>
      <div class="tu-field"><label class="tu-label">签名密钥 secret</label><input v-model="secret" class="tu-input" /></div>
      <div class="tu-field"><label class="tu-label">Payload (JSON)</label><textarea v-model="payloadText" class="tu-textarea" /></div>
      <div class="tu-field"><label class="tu-label">Header (JSON，可选覆盖)</label><textarea v-model="headerText" class="tu-textarea" style="min-height:70px" /></div>
      <button class="tu-btn" @click="generate">生成并复制 JWT</button>
      <p class="tu-hint">仅支持对称 HS* 算法（HMAC）。非对称 RS/ES 生成请使用专用工具。生成后自动复制。</p>
    </div>
    <div class="tu-t1">
      <div v-if="error" class="tu-alert"><span>⚠</span><span>{{ error }}</span></div>
      <div class="tu-field"><label class="tu-label">生成的 Token</label><textarea v-model="token" class="tu-textarea" readonly /></div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * PEM ↔ JWK 互转（Web Crypto，本地）
 * 仅支持 RSA 密钥。PEM→JWK 解析为 JWK（可组合成 JWKS）；JWK→PEM 导出 SPKI/PKCS8。
 */
import { ref } from 'vue'
import { copyText } from '../../core/download'

const pem = ref('')
const jwkText = ref('')
const errorMsg = ref('')
const info = ref('')

function pemToDer(p: string): Uint8Array {
  const b64 = p.replace(/-----BEGIN[^-]+-----/g, '').replace(/-----END[^-]+-----/g, '').replace(/\s+/g, '')
  const bin = atob(b64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return u
}
function derToPem(der: Uint8Array, type: string): string {
  let b64 = ''
  for (let i = 0; i < der.length; i++) b64 += String.fromCharCode(der[i])
  b64 = btoa(b64).match(/.{1,64}/g)!.join('\n')
  return `-----BEGIN ${type}-----\n${b64}\n-----END ${type}-----\n`
}

async function pemToJwk() {
  errorMsg.value = ''
  info.value = ''
  const t = pem.value.trim()
  if (!t) { errorMsg.value = '请粘贴 PEM'; return }
  try {
    const isPrivate = /PRIVATE KEY/.test(t)
    const der = pemToDer(t)
    const key = await crypto.subtle.importKey(isPrivate ? 'pkcs8' : 'spki', der as BufferSource, { name: 'RSASSA-PKCS1-v1_5' }, true, isPrivate ? ['sign'] : ['verify'])
    const jwk = await crypto.subtle.exportKey('jwk', key)
    jwkText.value = JSON.stringify(jwk, null, 2)
    info.value = isPrivate ? '私钥已转为 JWK' : '公钥已转为 JWK'
  } catch (err) {
    errorMsg.value = '转换失败：' + (err as Error).message
  }
}

async function jwkToPem() {
  errorMsg.value = ''
  info.value = ''
  const t = jwkText.value.trim()
  if (!t) { errorMsg.value = '请粘贴 JWK'; return }
  try {
    const jwk = JSON.parse(t)
    const isPrivate = !!jwk.d
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5' }, true, isPrivate ? ['sign'] : ['verify'])
    const der = new Uint8Array(await crypto.subtle.exportKey(isPrivate ? 'pkcs8' : 'spki', key))
    pem.value = derToPem(der, isPrivate ? 'PRIVATE KEY' : 'PUBLIC KEY')
    info.value = 'JWK 已转为 ' + (isPrivate ? '私钥' : '公钥') + ' PEM'
  } catch (err) {
    errorMsg.value = '转换失败：' + (err as Error).message
  }
}

function toJwks() {
  try {
    const jwk = JSON.parse(jwkText.value)
    jwkText.value = JSON.stringify({ keys: [jwk] }, null, 2)
    info.value = '已包装为 JWKS'
  } catch { errorMsg.value = '当前 JWK 不是合法 JSON' }
}
function copy(v: string) { copyText(v) }
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">PEM</label>
        <textarea v-model="pem" class="tu-textarea" rows="9" placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----" />
      </div>
      <div class="tu-row">
        <button class="tu-btn" @click="pemToJwk">PEM → JWK</button>
      </div>
      <p class="tu-hint">支持 RSA 公钥(SPKI)/私钥(PKCS8)。</p>
    </div>
    <div>
      <div class="tu-field">
        <label class="tu-label">JWK / JWKS</label>
        <textarea v-model="jwkText" class="tu-textarea" rows="9" placeholder='{ "kty": "RSA", "n": "...", "e": "..." }' />
      </div>
      <div class="tu-row">
        <button class="tu-btn" @click="jwkToPem">JWK → PEM</button>
        <button class="tu-btn ghost" @click="toJwks">包装为 JWKS</button>
        <button class="tu-btn ghost" @click="copy(jwkText)">复制</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-if="info" class="tu-alert ok">{{ info }}</p>
    </div>
  </div>
</template>

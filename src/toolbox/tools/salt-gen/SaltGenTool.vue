<script setup lang="ts">
/**
 * 盐值 (Salt) 生成（Web Crypto，本地）
 * 用于口令哈希 / 密钥派生前的随机盐。
 */
import { ref } from 'vue'
import { copyText } from '../../core/download'
import { randomBytesToHex, randomBytesToBase64 } from '../../core/random'
import { randomBytesToBase64Url } from '../../core/cryptoFile'

type Fmt = 'hex' | 'b64url' | 'b64'
const fmt = ref<Fmt>('hex')
const bytes = ref(16)
const result = ref('')
const errorMsg = ref('')

function gen() {
  errorMsg.value = ''
  try {
    const n = Math.max(1, Math.min(128, bytes.value))
    const buf = crypto.getRandomValues(new Uint8Array(n))
    if (fmt.value === 'hex') result.value = randomBytesToHex(buf)
    else if (fmt.value === 'b64url') result.value = randomBytesToBase64Url(buf)
    else result.value = randomBytesToBase64(buf)
  } catch (err) {
    errorMsg.value = '生成失败：' + (err as Error).message
  }
}
function copy() { if (result.value) copyText(result.value) }
</script>

<template>
  <div class="tu-t1">
    <div class="tu-field">
      <label class="tu-label">编码</label>
      <div class="tu-seg">
        <button v-for="f in (['hex','b64url','b64'] as Fmt[])" :key="f" :class="{ 'is-on': fmt === f }" @click="fmt = f">{{ { hex:'Hex', b64url:'Base64URL', b64:'Base64' }[f] }}</button>
      </div>
    </div>
    <div class="tu-row">
      <span class="tu-label">字节长度</span>
      <input v-model.number="bytes" type="number" min="1" max="128" class="tu-input tu-inline" style="max-width:120px" />
    </div>
    <div class="tu-row">
      <button class="tu-btn" @click="gen">生成</button>
      <button v-if="result" class="tu-btn ghost" @click="copy">复制</button>
    </div>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <div v-if="result" class="tu-out">{{ result }}</div>
    <p class="tu-hint">盐值用于 PBKDF2 / bcrypt / Argon2 等口令哈希，增强抗彩虹表能力。</p>
  </div>
</template>

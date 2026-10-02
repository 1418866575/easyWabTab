<script setup lang="ts">
/**
 * API 密钥 / Token 生成（Web Crypto，本地）
 * 支持 Hex / Base64URL / Base64 / UUID v4，可设定字节长度与批量生成。
 */
import { ref } from 'vue'
import { randomBytesToHex } from '../../core/random'
import { copyText } from '../../core/download'
import { randomBytesToBase64Url } from '../../core/cryptoFile'

type Fmt = 'hex' | 'b64url' | 'b64' | 'uuid'
const fmt = ref<Fmt>('b64url')
const bytes = ref(32)
const count = ref(1)
const results = ref<string[]>([])
const errorMsg = ref('')

function genOne(): string {
  const n = Math.max(1, bytes.value)
  const buf = crypto.getRandomValues(new Uint8Array(n))
  if (fmt.value === 'hex') return randomBytesToHex(buf)
  if (fmt.value === 'b64url') return randomBytesToBase64Url(buf)
  if (fmt.value === 'b64') {
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    return btoa(bin)
  }
  // uuid v4
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b).map(x => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`
}

function gen() {
  errorMsg.value = ''
  try {
    results.value = Array.from({ length: Math.min(50, Math.max(1, count.value)) }, () => genOne())
  } catch (err) {
    errorMsg.value = '生成失败：' + (err as Error).message
  }
}
async function copyAll() { await copyText(results.value.join('\n')) }
</script>

<template>
  <div class="tu-t1">
    <div class="tu-field">
      <label class="tu-label">格式</label>
      <div class="tu-seg">
        <button v-for="f in (['hex','b64url','b64','uuid'] as Fmt[])" :key="f" :class="{ 'is-on': fmt === f }" @click="fmt = f">{{ { hex:'Hex', b64url:'Base64URL', b64:'Base64', uuid:'UUID v4' }[f] }}</button>
      </div>
    </div>
    <div v-if="fmt !== 'uuid'" class="tu-row">
      <span class="tu-label">字节长度</span>
      <input v-model.number="bytes" type="number" min="1" max="128" class="tu-input tu-inline" style="max-width:120px" />
    </div>
    <div class="tu-row">
      <span class="tu-label">生成数量</span>
      <input v-model.number="count" type="number" min="1" max="50" class="tu-input tu-inline" style="max-width:120px" />
    </div>
    <div class="tu-row">
      <button class="tu-btn" @click="gen">生成</button>
      <button v-if="results.length" class="tu-btn ghost" @click="copyAll">复制全部</button>
    </div>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <div v-if="results.length" class="tu-out">{{ results.join('\n') }}</div>
    <p class="tu-hint">基于浏览器密码学安全随机数（crypto.getRandomValues），不可预测。</p>
  </div>
</template>

<script setup lang="ts">
/**
 * RSA 密钥生成（node-forge，本地）
 * 生成 RSA 公私钥对并导出为 PEM；私钥仅本机展示，不上传。
 */
import { ref } from 'vue'
import forge from 'node-forge'
import { copyText, downloadText } from '../../core/download'

const bits = ref(2048)
const busy = ref(false)
const errorMsg = ref('')
const publicPem = ref('')
const privatePem = ref('')

function gen() {
  busy.value = true
  errorMsg.value = ''
  publicPem.value = ''
  privatePem.value = ''
  // 让出一帧以显示“生成中”
  setTimeout(() => {
    try {
      const pair = forge.pki.rsa.generateKeyPair({ bits: bits.value })
      publicPem.value = forge.pki.publicKeyToPem(pair.publicKey)
      privatePem.value = forge.pki.privateKeyToPem(pair.privateKey)
    } catch (err) {
      errorMsg.value = '生成失败：' + (err as Error).message
    } finally {
      busy.value = false
    }
  }, 30)
}

function copy(v: string) { copyText(v) }
function dl(name: string, v: string) { if (v) downloadText(name, v) }
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">密钥长度</label>
        <div class="tu-seg">
          <button v-for="b in [2048, 4096]" :key="b" :class="{ 'is-on': bits === b }" @click="bits = b">{{ b }} 位</button>
        </div>
      </div>
      <div class="tu-row">
        <button class="tu-btn" :disabled="busy" @click="gen">{{ busy ? '生成中…' : '生成密钥对' }}</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">密钥在浏览器本地生成，绝不上传；请妥善保存私钥。</p>
    </div>
    <div>
      <div v-if="publicPem" class="tu-field">
        <label class="tu-label">公钥 (Public Key PEM)</label>
        <textarea class="tu-textarea" :value="publicPem" readonly rows="6" />
        <div class="tu-row">
          <button class="tu-btn ghost" @click="copy(publicPem)">复制</button>
          <button class="tu-btn ghost" @click="dl('rsa_public.pem', publicPem)">下载</button>
        </div>
      </div>
      <div v-if="privatePem" class="tu-field">
        <label class="tu-label">私钥 (Private Key PEM)</label>
        <textarea class="tu-textarea" :value="privatePem" readonly rows="8" />
        <div class="tu-row">
          <button class="tu-btn ghost" @click="copy(privatePem)">复制</button>
          <button class="tu-btn ghost" @click="dl('rsa_private.pem', privatePem)">下载</button>
        </div>
      </div>
      <div v-if="!publicPem && !errorMsg" class="tu-preview">生成后在此显示密钥</div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * CSR 生成（node-forge，本地）
 * 生成 RSA 密钥并创建证书签名请求（CSR），同时返回私钥。
 */
import { ref } from 'vue'
import forge from 'node-forge'
import { copyText, downloadText } from '../../core/download'

const cn = ref('')
const org = ref('')
const ou = ref('')
const country = ref('')
const email = ref('')
const bits = ref(2048)
const busy = ref(false)
const errorMsg = ref('')
const csrPem = ref('')
const keyPem = ref('')

function gen() {
  errorMsg.value = ''
  csrPem.value = ''
  keyPem.value = ''
  if (!cn.value) { errorMsg.value = '请填写通用名称 (CN)'; return }
  busy.value = true
  setTimeout(() => {
    try {
      const keys = forge.pki.rsa.generateKeyPair({ bits: bits.value })
      const csr = forge.pki.createCertificationRequest()
      csr.publicKey = keys.publicKey
      const attrs: any[] = [{ name: 'commonName', value: cn.value }]
      if (org.value) attrs.push({ name: 'organizationName', value: org.value })
      if (ou.value) attrs.push({ name: 'organizationalUnitName', value: ou.value })
      if (country.value) attrs.push({ name: 'countryName', value: country.value })
      if (email.value) attrs.push({ name: 'emailAddress', value: email.value })
      csr.setSubject(attrs)
      csr.sign(keys.privateKey, forge.md.sha256.create())
      csrPem.value = forge.pki.certificationRequestToPem(csr)
      keyPem.value = forge.pki.privateKeyToPem(keys.privateKey)
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
      <div class="tu-field"><label class="tu-label">通用名称 CN（必填，如域名）</label><input v-model="cn" class="tu-input" placeholder="example.com" /></div>
      <div class="tu-field"><label class="tu-label">组织 O</label><input v-model="org" class="tu-input" /></div>
      <div class="tu-field"><label class="tu-label">部门 OU</label><input v-model="ou" class="tu-input" /></div>
      <div class="tu-field"><label class="tu-label">国家 C（两位）</label><input v-model="country" class="tu-input tu-inline" maxlength="2" /></div>
      <div class="tu-field"><label class="tu-label">邮箱</label><input v-model="email" class="tu-input" /></div>
      <div class="tu-field">
        <label class="tu-label">密钥长度</label>
        <div class="tu-seg">
          <button v-for="b in [2048, 4096]" :key="b" :class="{ 'is-on': bits === b }" @click="bits = b">{{ b }}</button>
        </div>
      </div>
      <div class="tu-row"><button class="tu-btn" :disabled="busy" @click="gen">{{ busy ? '生成中…' : '生成 CSR' }}</button></div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">私钥仅在本地生成与展示，请妥善保存以便后续使用证书。</p>
    </div>
    <div>
      <div v-if="csrPem" class="tu-field">
        <label class="tu-label">证书请求 (CSR PEM)</label>
        <textarea class="tu-textarea" :value="csrPem" readonly rows="7" />
        <div class="tu-row"><button class="tu-btn ghost" @click="copy(csrPem)">复制</button><button class="tu-btn ghost" @click="dl('request.csr', csrPem)">下载</button></div>
      </div>
      <div v-if="keyPem" class="tu-field">
        <label class="tu-label">私钥 (Private Key PEM)</label>
        <textarea class="tu-textarea" :value="keyPem" readonly rows="7" />
        <div class="tu-row"><button class="tu-btn ghost" @click="copy(keyPem)">复制</button><button class="tu-btn ghost" @click="dl('private.key', keyPem)">下载</button></div>
      </div>
      <div v-if="!csrPem && !errorMsg" class="tu-preview">生成后在此显示 CSR 与私钥</div>
    </div>
  </div>
</template>

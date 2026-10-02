<script setup lang="ts">
import { ref } from 'vue'
import forge from 'node-forge'
import { copyText } from '../../core/download'

const pem = ref('')
const errorMsg = ref('')
const verified = ref<boolean | null>(null)
const subject = ref('')
const attrs = ref<{ name: string; value: string }[]>([])
const sigAlg = ref('')
const pubBits = ref(0)
const modulus = ref('')

function parse() {
  errorMsg.value = ''
  verified.value = null
  subject.value = ''
  attrs.value = []
  sigAlg.value = ''
  pubBits.value = 0
  modulus.value = ''
  if (!pem.value.trim()) { errorMsg.value = '请粘贴 CSR (PEM)'; return }
  try {
    const csr = forge.pki.certificationRequestFromPem(pem.value)
    verified.value = csr.verify()
    const list = csr.subject.attributes.map((a: any) => ({
      name: (a as any).shortName || a.name,
      value: String(a.value)
    }))
    attrs.value = list
    subject.value = list.map((a: any) => a.name + '=' + a.value).join(', ')
    sigAlg.value = (csr as any).signatureOid || '未知'
    const pk = csr.publicKey as any
    if (pk && pk.n) {
      pubBits.value = pk.n.bitLength()
      const hex = pk.n.toString(16)
      modulus.value = hex.length > 48 ? hex.slice(0, 48) + '…（共 ' + hex.length + ' 位十六进制）' : hex
    }
    if (!verified.value) errorMsg.value = 'CSR 签名校验未通过（可能格式异常或已被篡改）'
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  }
}
function copySubject() { copyText(subject.value) }
</script>

<template>
  <div class="tu-t6">
    <div class="tu-field">
      <label class="tu-label">粘贴 CSR（以 -----BEGIN CERTIFICATE REQUEST----- 开头）</label>
      <textarea v-model="pem" class="tu-textarea" rows="6" placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;MIIC..." />
    </div>
    <div class="tu-row">
      <button class="tu-btn" @click="parse">解析</button>
      <button class="tu-btn ghost" :disabled="!subject" @click="copySubject">复制主题</button>
    </div>
    <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
    <div v-if="attrs.length" class="tu-grid">
      <div class="tu-card"><div class="tu-card-title">签名校验</div><div class="tu-card-value" :style="verified ? 'color:var(--color-success);font-size:14px' : 'color:var(--color-error);font-size:14px'">{{ verified ? '通过' : '未通过' }}</div></div>
      <div class="tu-card"><div class="tu-card-title">签名算法 OID</div><div class="tu-card-value" style="font-size:13px">{{ sigAlg }}</div></div>
      <div class="tu-card"><div class="tu-card-title">公钥长度</div><div class="tu-card-value">{{ pubBits }} 位</div></div>
    </div>
    <div v-if="attrs.length" class="tu-field">
      <label class="tu-label">主题字段</label>
      <div class="tu-table-wrap">
        <table class="tu-table"><thead><tr><th>字段</th><th>值</th></tr></thead><tbody>
          <tr v-for="(a, i) in attrs" :key="i"><td>{{ a.name }}</td><td class="break">{{ a.value }}</td></tr>
        </tbody></table>
      </div>
    </div>
    <div v-if="modulus" class="tu-field">
      <label class="tu-label">公钥模数（hex，截断）</label>
      <div class="tu-out">{{ modulus }}</div>
    </div>
    <div v-if="!attrs.length && !errorMsg" class="tu-preview">解析结果将显示在此处</div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
</style>

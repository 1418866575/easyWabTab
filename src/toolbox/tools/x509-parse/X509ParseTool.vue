<script setup lang="ts">
/**
 * X.509 证书解析（node-forge，本地）
 * 粘贴 PEM 证书，解析主题/签发者/有效期/序列号/指纹。
 */
import { ref } from 'vue'
import forge from 'node-forge'

interface Row { k: string; v: string }
const pem = ref('')
const errorMsg = ref('')
const rows = ref<Row[]>([])
const fp = ref<{ alg: string; hex: string }[]>([])

function attrs(list: any[]): string {
  return list.map(a => `${a.shortName || a.name}=${a.value}`).join(', ')
}

function parse() {
  errorMsg.value = ''
  rows.value = []
  fp.value = []
  const t = pem.value.trim()
  if (!t) { errorMsg.value = '请粘贴证书内容'; return }
  try {
    const cert = forge.pki.certificateFromPem(t)
    const der = forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes()
    rows.value = [
      { k: '主题 (Subject)', v: attrs(cert.subject.attributes) },
      { k: '签发者 (Issuer)', v: attrs(cert.issuer.attributes) },
      { k: '序列号 (Serial)', v: cert.serialNumber },
      { k: '生效时间 (Not Before)', v: cert.validity.notBefore.toString() },
      { k: '过期时间 (Not After)', v: cert.validity.notAfter.toString() },
      { k: '签名算法', v: cert.siginfo.algorithmOid || '—' }
    ]
    for (const alg of ['sha256', 'sha1']) {
      const md = forge.md[alg].create()
      md.update(der)
      fp.value.push({ alg: alg.toUpperCase(), hex: md.digest().toHex().toUpperCase().replace(/(.{2})/g, '$1 ').trim() })
    }
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  }
}
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">证书 (PEM)</label>
        <textarea v-model="pem" class="tu-textarea" rows="10" placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----" />
      </div>
      <div class="tu-row">
        <button class="tu-btn" @click="parse">解析</button>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">支持 X.509 v1/v3 证书；解析全程本地完成。</p>
    </div>
    <div>
      <div v-if="rows.length" class="tu-table-wrap">
        <table class="tu-table">
          <tbody>
            <tr v-for="r in rows" :key="r.k"><td class="tu-tree-key">{{ r.k }}</td><td>{{ r.v }}</td></tr>
            <tr v-for="f in fp" :key="f.alg"><td class="tu-tree-key">{{ f.alg }} 指纹</td><td class="mono">{{ f.hex }}</td></tr>
          </tbody>
        </table>
      </div>
      <div v-else class="tu-preview">解析结果（先粘贴证书）</div>
    </div>
  </div>
</template>

<style scoped>
.mono { font-family: var(--font-family-mono); font-size: 11.5px; word-break: break-all; }
</style>

<script setup lang="ts">
/**
 * JWT 解析与验证（纯前端实现，HS256/384/512 验签走 crypto-js）
 */
import { computed, ref } from 'vue'
import { decodeJwt, verifyJwt, tsToLocal } from '../../core/jwt'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const token = ref('')
const secret = ref('')
const leeway = ref(0)

useDirtyFlag(() => !!token.value.trim())
const { copy } = useToolActions()

const res = computed(() => decodeJwt(token.value, Number(leeway.value) || 0))

const verify = computed(() => {
  if (!res.value.ok || !secret.value) return null
  return verifyJwt(token.value, secret.value, res.value.alg)
})

const timeText = computed(() => {
  const t = res.value.time
  if (!res.value.ok) return ''
  const parts: string[] = []
  if (t.issuedAt) parts.push(`签发时间 iat：${tsToLocal(t.issuedAt)}`)
  if (t.hasExp) parts.push(`过期时间 exp：${tsToLocal(t.expiresAt)}${t.expired ? '（已过期）' : '（未过期）'}`)
  if (t.hasNbf) parts.push(`生效时间 nbf：${tsToLocal(t.notBefore)}${t.notYet ? '（尚未生效）' : ''}`)
  return parts.join('　')
})
</script>

<template>
  <div class="tu-t1">
    <TuField label="JWT Token">
      <textarea
        v-model="token"
        class="tu-textarea"
        rows="4"
        spellcheck="false"
        placeholder="粘贴 eyJhbGciOi... 形式的 JWT"
        data-testid="tb-modal-input"
      />
      <p v-if="res.error" class="tu-alert">{{ res.error }}</p>
    </TuField>

    <div class="tu-row">
      <span class="tu-label">算法</span>
      <span class="tu-mono">{{ res.alg || '—' }}</span>
      <span class="tu-label">时钟偏移容差（秒）</span>
      <input v-model.number="leeway" type="number" min="0" class="tu-input tu-inline" style="max-width: 100px" />
    </div>

    <p v-if="timeText" class="tu-alert" :class="{ ok: !res.time.expired && !res.time.notYet }">{{ timeText }}</p>

    <div class="tu-t2">
      <TuOutput
        title="Header"
        :text="res.header.json"
        filename="jwt-header.json"
        mime="application/json"
        empty="—"
      >
        <pre class="tu-code">{{ res.header.json || res.header.error || '—' }}</pre>
      </TuOutput>
      <TuOutput
        title="Payload"
        :text="res.payload.json"
        filename="jwt-payload.json"
        mime="application/json"
        empty="—"
      >
        <pre class="tu-code">{{ res.payload.json || res.payload.error || '—' }}</pre>
      </TuOutput>
    </div>

    <TuField label="签名校验（仅支持 HS256 / HS384 / HS512）">
      <div class="tu-row">
        <input
          v-model="secret"
          class="tu-input"
          type="text"
          placeholder="填写签发密钥 secret"
          autocomplete="off"
        />
      </div>
      <p v-if="!secret" class="tu-hint">填写密钥后自动校验；RS/ES 等非对称算法会明确提示不支持。</p>
      <p v-else-if="verify && verify.ok" class="tu-alert ok">签名一致（{{ verify.reason }}）</p>
      <p v-else-if="verify" class="tu-alert">校验失败：{{ verify.reason }}</p>
    </TuField>

    <TuOutput title="签名段" :text="res.signature" filename="jwt-signature.txt" empty="—">
      <p class="tu-mono break">{{ res.signature || '—' }}</p>
    </TuOutput>

    <div class="tu-row">
      <button type="button" class="tu-btn ghost" :disabled="!res.payload.json" @click="copy(res.payload.json)">
        复制 Payload
      </button>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>粘贴 JWT 即自动解码 Header 与 Payload，并显示签发 / 过期 / 生效时间。</li>
          <li>填写密钥可对 HS256/384/512 签名做一致性校验；非对称算法不会误判为失败。</li>
          <li>密钥与 Token 均只在本地内存中使用，不会上传或持久化。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
.break { word-break: break-all; margin: 0; }
.tu-code {
  margin: 0;
  max-height: 240px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>

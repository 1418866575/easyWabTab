<script setup lang="ts">
import { ref, computed } from 'vue'

const origin = ref('https://app.example.com')
const useCreds = ref(false)
const headersText = ref('')

const verdict = computed(() => {
  const lines = headersText.value.split(/\r?\n/)
  const acao = lines.find(l => /^access-control-allow-origin\s*:/i.test(l))
  const acac = lines.find(l => /^access-control-allow-credentials\s*:/i.test(l))
  if (!acao) {
    return { ok: false, msg: '响应中缺少 Access-Control-Allow-Origin，浏览器将拦截跨域响应。' }
  }
  const aoVal = (acao.split(':')[1] || '').trim()
  if (aoVal === '*') {
    if (useCreds.value) {
      return { ok: false, msg: 'Access-Control-Allow-Origin 为 *，但请求带凭据（Cookie/Authorization），浏览器会拒绝。需改为具体来源并配合 Allow-Credentials: true。' }
    }
    return { ok: true, msg: '通配符 * 允许任意来源（不含凭据），跨域放行。' }
  }
  if (origin.value && aoVal !== origin.value) {
    return { ok: false, msg: `Access-Control-Allow-Origin 为 ${aoVal}，与请求来源 ${origin.value} 不一致，浏览器拦截。` }
  }
  if (useCreds.value) {
    if (!acac || !/true/i.test((acac.split(':')[1] || '').trim())) {
      return { ok: false, msg: '请求带凭据，但缺少 Access-Control-Allow-Credentials: true，浏览器拦截。' }
    }
    return { ok: true, msg: '来源与凭据均匹配，跨域放行。' }
  }
  return { ok: true, msg: '来源匹配，跨域放行。' }
})
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field"><label class="tu-label">请求来源 Origin</label><input v-model="origin" class="tu-input" placeholder="https://app.example.com" /></div>
      <label class="tu-check" :class="{ 'is-on': useCreds }"><input type="checkbox" v-model="useCreds" /> 请求携带凭据（Cookie / Authorization）</label>
      <div class="tu-field" style="margin-top:12px"><label class="tu-label">目标响应头（粘贴，用于判断）</label><textarea v-model="headersText" class="tu-textarea" rows="8" placeholder="Access-Control-Allow-Origin: https://app.example.com&#10;Access-Control-Allow-Credentials: true" /></div>
      <p class="tu-hint">仅依据你粘贴的响应头做静态判断，不实际发请求。</p>
    </div>
    <div>
      <div class="tu-alert" :class="verdict.ok ? 'ok' : ''" style="margin-bottom:12px">{{ verdict.msg }}</div>
      <details class="tu-folding">
        <summary>CORS 速览</summary>
        <div class="tu-folding-body">
          <ol>
            <li>浏览器同源策略：协议 / 域名 / 端口任一不同即跨域。</li>
            <li>简单请求（GET/HEAD/POST + 简单头）直接发，靠响应头决定是否可读。</li>
            <li>非简单请求先发 OPTIONS 预检，需 Allow-Methods / Allow-Headers 匹配。</li>
            <li>带凭据时 Allow-Origin 不能是 *，必须明确来源且 Allow-Credentials: true。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { copyText } from '../../core/download'

const method = ref('GET')
const url = ref('')
const headersText = ref('')
const bodyText = ref('')
const busy = ref(false)
const errorMsg = ref('')
const statusLine = ref('')
const duration = ref(0)
const respHeaders = ref<Record<string, string>>({})
const respBody = ref('')

function parseHeaders(t: string): Record<string, string> {
  const h: Record<string, string> = {}
  for (const line of t.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) {
      const k = line.slice(0, i).trim()
      const v = line.slice(i + 1).trim()
      if (k) h[k] = v
    }
  }
  return h
}

async function send() {
  errorMsg.value = ''
  statusLine.value = ''
  respHeaders.value = {}
  respBody.value = ''
  if (!url.value) { errorMsg.value = '请填写 URL'; return }
  busy.value = true
  const t0 = performance.now()
  try {
    const init: RequestInit = {
      method: method.value,
      headers: parseHeaders(headersText.value)
    }
    if (method.value !== 'GET' && method.value !== 'HEAD' && bodyText.value) {
      init.body = bodyText.value
    }
    const res = await fetch(url.value, init)
    const t1 = performance.now()
    duration.value = Math.round(t1 - t0)
    const h: Record<string, string> = {}
    res.headers.forEach((v, k) => { h[k] = v })
    respHeaders.value = h
    statusLine.value = `${res.status} ${res.statusText}`
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      try { respBody.value = JSON.stringify(await res.json(), null, 2) } catch { respBody.value = await res.text() }
    } else if (ct.startsWith('text/') || ct.includes('xml') || ct.includes('javascript')) {
      respBody.value = await res.text()
    } else {
      const buf = await res.arrayBuffer()
      respBody.value = `[二进制响应，长度 ${buf.byteLength} 字节]`
    }
  } catch (err) {
    const t1 = performance.now()
    duration.value = Math.round(t1 - t0)
    errorMsg.value = '请求失败：' + (err as Error).message + '\n（若为跨域 CORS 限制，浏览器出于安全不会暴露细节，请确认服务端允许该来源）'
  } finally {
    busy.value = false
  }
}

function copyRes() { copyText(respBody.value) }
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-row">
        <select v-model="method" class="tu-select tu-inline">
          <option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option><option>HEAD</option>
        </select>
        <input v-model="url" class="tu-input" style="flex:1" placeholder="https://api.example.com/v1/resource" />
      </div>
      <div class="tu-field"><label class="tu-label">请求头（每行 Key: Value）</label><textarea v-model="headersText" class="tu-textarea" rows="4" placeholder="Authorization: Bearer xxx&#10;Content-Type: application/json" /></div>
      <div class="tu-field"><label class="tu-label">请求体（GET/HEAD 忽略）</label><textarea v-model="bodyText" class="tu-textarea" rows="5" placeholder='{"key":"value"}' /></div>
      <div class="tu-row"><button class="tu-btn" :disabled="busy" @click="send">{{ busy ? '请求中…' : '发送请求' }}</button></div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">请求由你的浏览器直接发出，不经过本站服务器；跨域结果取决于目标服务 CORS 配置。</p>
    </div>
    <div>
      <div v-if="statusLine" class="tu-row">
        <span class="tu-card" style="padding:6px 10px">状态 <b>{{ statusLine }}</b></span>
        <span class="tu-card" style="padding:6px 10px">耗时 <b>{{ duration }} ms</b></span>
        <button class="tu-btn ghost" @click="copyRes">复制响应</button>
      </div>
      <div v-if="Object.keys(respHeaders).length" class="tu-field">
        <label class="tu-label">响应头</label>
        <div class="tu-table-wrap"><table class="tu-table"><tbody>
          <tr v-for="(v, k) in respHeaders" :key="k"><td>{{ k }}</td><td class="break">{{ v }}</td></tr>
        </tbody></table></div>
      </div>
      <div v-if="respBody" class="tu-field">
        <label class="tu-label">响应体</label>
        <textarea class="tu-textarea" :value="respBody" readonly rows="10" />
      </div>
      <div v-if="!statusLine && !errorMsg" class="tu-preview">响应将显示在此处</div>
    </div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
</style>

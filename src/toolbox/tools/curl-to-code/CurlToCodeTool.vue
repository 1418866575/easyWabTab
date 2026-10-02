<script setup lang="ts">
import { ref, computed } from 'vue'
import { copyText, downloadText } from '../../core/download'

const input = ref('')
const lang = ref<'js' | 'py' | 'curl'>('js')
const errorMsg = ref('')

interface Req { method: string; url: string; headers: Record<string, string>; body: string; user: string }

function parse(t: string): Req {
  const s = t.replace(/\\\s*\n/g, ' ')
  const headers: Record<string, string> = {}
  const bodies: string[] = []
  let method = ''
  let url = ''
  let user = ''

  const urlMatch = s.match(/https?:\/\/[^\s"']+/)
  if (urlMatch) url = urlMatch[0]

  const mMatch = s.match(/(?:--request|-X)\s+(\w+)/i)
  if (mMatch) method = mMatch[1].toUpperCase()

  const hRe = /(?:--header|-H)\s+(["']?)([^"']+)\1/g
  let hm: RegExpExecArray | null
  while ((hm = hRe.exec(s))) {
    const i = hm[2].indexOf(':')
    if (i > 0) headers[hm[2].slice(0, i).trim()] = hm[2].slice(i + 1).trim()
  }

  const dRe = /(?:--data(?:-raw|-binary|-urlencode)?|-d)\s+(["'])([\s\S]*?)\1/g
  let dm: RegExpExecArray | null
  while ((dm = dRe.exec(s))) bodies.push(dm[2])
  const body = bodies.join('&')

  const uMatch = s.match(/(?:--user|-u)\s+(\S+)/)
  if (uMatch) user = uMatch[1]

  if (!method) method = body ? 'POST' : 'GET'
  if (user && !headers['Authorization']) {
    headers['Authorization'] = 'Basic ' + btoa(user)
  }
  return { method, url, headers, body, user }
}

const q = (v: string) => JSON.stringify(v)

const code = computed(() => {
  errorMsg.value = ''
  if (!input.value.trim()) return ''
  let req: Req
  try { req = parse(input.value) } catch (e) { errorMsg.value = '解析失败：' + (e as Error).message; return '' }
  if (!req.url) { errorMsg.value = '未识别到 http(s) 地址'; return '' }
  if (lang.value === 'js') {
    const lines: string[] = []
    lines.push('const res = await fetch(' + q(req.url) + ', {')
    lines.push('  method: ' + q(req.method) + ',')
    if (Object.keys(req.headers).length) {
      lines.push('  headers: {')
      for (const [k, v] of Object.entries(req.headers)) lines.push('    ' + q(k) + ': ' + q(v) + ',')
      lines.push('  },')
    }
    if (req.body) lines.push('  body: ' + q(req.body) + ',')
    lines.push('})')
    lines.push('const data = await res.json()')
    return lines.join('\n')
  }
  if (lang.value === 'py') {
    const lines: string[] = []
    lines.push('import requests')
    lines.push('resp = requests.request(')
    lines.push('    ' + q(req.method) + ',')
    lines.push('    ' + q(req.url) + ',')
    if (Object.keys(req.headers).length) {
      lines.push('    headers={')
      for (const [k, v] of Object.entries(req.headers)) lines.push('        ' + q(k) + ': ' + q(v) + ',')
      lines.push('    },')
    }
    if (req.body) lines.push('    data=' + q(req.body) + ',')
    lines.push(')')
    lines.push('print(resp.status_code)')
    lines.push('print(resp.text)')
    return lines.join('\n')
  }
  const lines: string[] = ['curl -X ' + req.method + ' ' + q(req.url)]
  for (const [k, v] of Object.entries(req.headers)) lines.push('  -H ' + q(k + ': ' + v))
  if (req.user) lines.push('  -u ' + q(req.user))
  if (req.body) lines.push('  -d ' + q(req.body))
  return lines.join(' \\\n')
})

function copy() { if (code.value) copyText(code.value) }
function dl() { if (code.value) downloadText('request.' + (lang.value === 'py' ? 'py' : lang.value === 'js' ? 'js' : 'sh'), code.value) }
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-field"><label class="tu-label">粘贴 cURL 命令</label><textarea v-model="input" class="tu-textarea" rows="12" placeholder="curl 'https://api.example.com/x' -H 'Content-Type: application/json' -d '{&quot;a&quot;:1}'" /></div>
      <div class="tu-field">
        <label class="tu-label">目标语言</label>
        <div class="tu-seg">
          <button :class="{ 'is-on': lang === 'js' }" @click="lang = 'js'">JavaScript</button>
          <button :class="{ 'is-on': lang === 'py' }" @click="lang = 'py'">Python</button>
          <button :class="{ 'is-on': lang === 'curl' }" @click="lang = 'curl'">格式化</button>
        </div>
      </div>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p class="tu-hint">自动识别 -X / -H / -d / -u；附带 -u 时生成 Basic 鉴权头。纯本地解析。</p>
    </div>
    <div>
      <div v-if="code" class="tu-field">
        <label class="tu-label">生成代码</label>
        <textarea class="tu-textarea" :value="code" readonly rows="14" />
        <div class="tu-row"><button class="tu-btn ghost" @click="copy">复制</button><button class="tu-btn ghost" @click="dl">下载</button></div>
      </div>
      <div v-else class="tu-preview">代码将显示在此处</div>
    </div>
  </div>
</template>

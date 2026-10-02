<script setup lang="ts">
import { computed, ref } from 'vue'
import { copyText, downloadText } from '../../core/download'

type Lang = 'ts' | 'java' | 'py' | 'go' | 'cs' | 'rust'
const lang = ref<Lang>('ts')
const input = ref('{\n  "id": 1,\n  "name": "示例",\n  "active": true,\n  "tags": ["a","b"],\n  "profile": { "age": 18 }\n}')
const error = ref('')
const root = ref('Root')

type Field = { name: string; ts: string; java: string; py: string; go: string; cs: string; rust: string }

function infer(v: unknown): Field['ts'] {
  if (v === null) return 'unknown | null'
  if (Array.isArray(v)) {
    if (v.length) return infer(v[0]) + '[]'
    return 'unknown[]'
  }
  if (typeof v === 'object') return 'object'
  return typeof v
}
function javaType(t: string): string {
  if (t === 'number') return 'double'
  if (t === 'string') return 'String'
  if (t === 'boolean') return 'boolean'
  if (t.endsWith('[]')) return javaType(t.slice(0, -2)) + '[]'
  return t === 'object' ? 'Object' : t
}
function snake(s: string): string { return s.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '') }

const fields = computed<Field[]>(() => {
  error.value = ''
  let obj: any
  try { obj = JSON.parse(input.value) } catch (e) { error.value = 'JSON 解析失败：' + (e as Error).message; return [] }
  if (Array.isArray(obj)) obj = obj[0] || {}
  if (typeof obj !== 'object' || obj === null) { error.value = '根须为对象（或对象数组）'; return [] }
  return Object.keys(obj).map(k => {
    const t = infer(obj[k])
    return { name: k, ts: t, java: javaType(t), py: t === 'number' ? 'float' : t === 'boolean' ? 'bool' : t === 'string' ? 'str' : t, go: t, cs: t, rust: t }
  })
})

const code = computed(() => {
  const fs = fields.value
  if (!fs.length) return ''
  const R = root.value || 'Root'
  const lines = (fn: (f: Field) => string) => fs.map(fn).join('\n')
  switch (lang.value) {
    case 'ts':
      return 'interface ' + R + ' {\n' + lines(f => '  ' + f.name + ': ' + f.ts + ';') + '\n}'
    case 'java':
      return 'public class ' + R + ' {\n' + lines(f => '    private ' + f.java + ' ' + f.name + ';') + '\n}'
    case 'py': {
      const body = fs.length ? lines(f => '    ' + snake(f.name) + ': ' + f.py) : '    pass'
      return 'from dataclasses import dataclass\n\n@dataclass\nclass ' + R + ':\n' + body
    }
    case 'go':
      return 'type ' + R + ' struct {\n' + lines(f => '    ' + (f.name[0].toUpperCase() + f.name.slice(1)) + ' ' + f.go + ' `json:"' + f.name + '"`') + '\n}'
    case 'cs':
      return 'public class ' + R + ' {\n' + lines(f => '    public ' + f.cs + ' ' + f.name + ' { get; set; }') + '\n}'
    default:
      return 'struct ' + R + ' {\n' + lines(f => '    ' + f.name + ': ' + f.rust + ',') + '\n}'
  }
})

async function copy() { if (code.value) await copyText(code.value) }
function dl() { if (code.value) downloadText(root.value + '.' + ({ ts: 'ts', java: 'java', py: 'py', go: 'go', cs: 'cs', rust: 'rs' }[lang.value]), code.value) }
</script>

<template>
  <div class="tu-t2">
    <div class="tu-t1">
      <div class="tu-field"><label class="tu-label">JSON 输入</label><textarea v-model="input" class="tu-textarea" /></div>
      <div class="tu-row">
        <div class="tu-field" style="flex:1"><label class="tu-label">根类名</label><input v-model="root" class="tu-input" /></div>
      </div>
      <div v-if="error" class="tu-alert"><span>⚠</span><span>{{ error }}</span></div>
    </div>
    <div class="tu-t1">
      <div class="tu-toolbar">
        <div class="tu-seg">
          <button v-for="l in (['ts','java','py','go','cs','rust'] as Lang[])" :key="l" :class="{ 'is-on': lang === l }" @click="lang = l">{{ l.toUpperCase() }}</button>
        </div>
        <span class="tu-spacer" />
        <button class="tu-btn" @click="copy">复制</button>
        <button class="tu-btn ghost" @click="dl">下载</button>
      </div>
      <pre class="tu-out">{{ code || '（请修正 JSON）' }}</pre>
    </div>
  </div>
</template>

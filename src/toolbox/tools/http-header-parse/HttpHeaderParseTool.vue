<script setup lang="ts">
import { ref, computed } from 'vue'
import { copyText } from '../../core/download'

const input = ref('')
interface Row { key: string; value: string }
const SEC = [
  'Content-Security-Policy',
  'Strict-Transport-Security',
  'X-Content-Type-Options',
  'X-Frame-Options',
  'Referrer-Policy',
  'Permissions-Policy',
  'Cross-Origin-Opener-Policy'
]
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  for (const line of input.value.split(/\r?\n/)) {
    const i = line.indexOf(':')
    if (i > 0) out.push({ key: line.slice(0, i).trim(), value: line.slice(i + 1).trim() })
  }
  return out
})
const headerKeys = computed(() => new Set(rows.value.map(r => r.key.toLowerCase())))
const secStatus = computed(() => SEC.map(s => ({ name: s, ok: headerKeys.value.has(s.toLowerCase()) })))
function copyAll() { copyText(rows.value.map(r => r.key + ': ' + r.value).join('\n')) }
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field"><label class="tu-label">粘贴 HTTP 响应头</label><textarea v-model="input" class="tu-textarea" rows="12" placeholder="Content-Type: text/html; charset=utf-8&#10;Strict-Transport-Security: max-age=31536000" /></div>
      <div class="tu-row"><button class="tu-btn ghost" :disabled="!rows.length" @click="copyAll">复制全部</button></div>
      <p class="tu-hint">每行一个「Key: Value」，自动解析为表格。</p>
    </div>
    <div>
      <div v-if="rows.length" class="tu-field">
        <label class="tu-label">解析结果（{{ rows.length }} 项）</label>
        <div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>响应头</th><th>值</th></tr></thead><tbody>
          <tr v-for="(r, i) in rows" :key="i"><td>{{ r.key }}</td><td class="break">{{ r.value }}</td></tr>
        </tbody></table></div>
      </div>
      <div class="tu-field">
        <label class="tu-label">安全响应头检查</label>
        <div class="tu-grid">
          <div v-for="s in secStatus" :key="s.name" class="tu-card" :style="s.ok ? 'border-color:var(--color-success)' : 'border-color:var(--color-border)'">
            <div class="tu-card-title">{{ s.name }}</div>
            <div class="tu-card-value" :style="s.ok ? 'color:var(--color-success);font-size:13px' : 'color:var(--color-text-muted);font-size:13px'">{{ s.ok ? '已配置' : '缺失' }}</div>
          </div>
        </div>
      </div>
      <div v-if="!rows.length" class="tu-preview">解析结果将显示在此处</div>
    </div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
</style>

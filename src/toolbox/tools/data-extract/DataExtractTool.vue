<script setup lang="ts">
import { ref, computed } from 'vue'
import { copyText, downloadText } from '../../core/download'

const input = ref('')
const emails = computed(() => [...new Set(input.value.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || [])])
const urls = computed(() => [...new Set(input.value.match(/https?:\/\/[^\s"'<>]+/g) || [])])
const ips = computed(() => [...new Set(input.value.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])])
const phones = computed(() => [...new Set(input.value.match(/(?<!\d)(?:\+?86)?1[3-9]\d{9}(?!\d)/g) || [])])
const jsons = computed(() => {
  const out: string[] = []
  const re = /\{[\s\S]*?\}|\[[\s\S]*?\]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input.value))) {
    try { JSON.parse(m[0]); out.push(m[0]) } catch { /* 非合法 JSON 跳过 */ }
  }
  return out
})
function copy(arr: string[]) { copyText(arr.join('\n')) }
function dl(name: string, arr: string[]) { if (arr.length) downloadText(name, arr.join('\n')) }
</script>

<template>
  <div class="tu-t4">
    <div>
      <div class="tu-field">
        <label class="tu-label">粘贴待提取的文本（日志、网页源码、文档等）</label>
        <textarea v-model="input" class="tu-textarea" rows="14" placeholder="支持从大段文本中识别邮箱、网址、IP、手机号与 JSON 片段" />
      </div>
      <p class="tu-hint">全部在本地正则提取，不上传任何内容。</p>
    </div>
    <div>
      <div class="tu-grid">
        <div class="tu-card"><div class="tu-card-title">邮箱（{{ emails.length }}）</div><div class="tu-card-value" style="font-size:13px">{{ emails.slice(0, 3).join('，') || '—' }}</div></div>
        <div class="tu-card"><div class="tu-card-title">网址（{{ urls.length }}）</div><div class="tu-card-value" style="font-size:13px">{{ urls.slice(0, 2).join('，') || '—' }}</div></div>
        <div class="tu-card"><div class="tu-card-title">IP（{{ ips.length }}）</div><div class="tu-card-value" style="font-size:13px">{{ ips.slice(0, 3).join('，') || '—' }}</div></div>
        <div class="tu-card"><div class="tu-card-title">手机号（{{ phones.length }}）</div><div class="tu-card-value" style="font-size:13px">{{ phones.slice(0, 3).join('，') || '—' }}</div></div>
        <div class="tu-card"><div class="tu-card-title">JSON（{{ jsons.length }}）</div><div class="tu-card-value" style="font-size:13px">{{ jsons.length ? '已识别合法 JSON' : '—' }}</div></div>
      </div>
      <div v-if="input" class="tu-row" style="margin-top:10px">
        <button class="tu-btn ghost" :disabled="!emails.length" @click="copy(emails)">复制邮箱</button>
        <button class="tu-btn ghost" :disabled="!urls.length" @click="copy(urls)">复制网址</button>
        <button class="tu-btn ghost" :disabled="!ips.length" @click="copy(ips)">复制 IP</button>
        <button class="tu-btn ghost" :disabled="!phones.length" @click="copy(phones)">复制手机号</button>
        <button class="tu-btn ghost" :disabled="!jsons.length" @click="dl('extracted.json', jsons)">下载 JSON</button>
      </div>
      <div class="tu-field" style="margin-top:10px">
        <label class="tu-label">提取详情</label>
        <div class="tu-table-wrap" v-if="emails.length || urls.length || ips.length || phones.length || jsons.length">
          <table class="tu-table">
            <tbody>
              <tr v-for="(e, i) in emails" :key="'e' + i"><td>邮箱</td><td class="break">{{ e }}</td></tr>
              <tr v-for="(u, i) in urls" :key="'u' + i"><td>网址</td><td class="break">{{ u }}</td></tr>
              <tr v-for="(ip, i) in ips" :key="'i' + i"><td>IP</td><td class="break">{{ ip }}</td></tr>
              <tr v-for="(p, i) in phones" :key="'p' + i"><td>手机</td><td class="break">{{ p }}</td></tr>
              <tr v-for="(j, i) in jsons" :key="'j' + i"><td>JSON</td><td class="break">{{ j.slice(0, 80) }}{{ j.length > 80 ? '…' : '' }}</td></tr>
            </tbody>
          </table>
        </div>
        <div v-else class="tu-preview">提取结果将显示在此处</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.break { word-break: break-all; }
</style>

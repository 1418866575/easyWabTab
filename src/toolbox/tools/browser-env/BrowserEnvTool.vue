<script setup lang="ts">
/**
 * 浏览器环境检测：UA 解析、屏幕/网络/存储采集、能力矩阵、导出报告
 */
import { computed, onMounted, ref } from 'vue'
import { buildReport, detectFeatures, reportToJson, reportToText, type EnvInput, type EnvReport } from './browserEnvCore'
import { humanSize } from '../../core/download'
import { useToolActions } from '../../composables/useToolActions'

const report = ref<EnvReport | null>(null)
const copiedAt = ref(0)
const { copy, save } = useToolActions()

const text = computed(() => (report.value ? reportToText(report.value) : ''))

function webglRenderer(): string | null {
  try {
    const canvas = document.createElement('canvas')
    const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
    if (!gl) return null
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    if (!ext) return gl.getParameter(gl.RENDERER) || null
    return String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL))
  } catch {
    return null
  }
}

function timezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return ''
  }
}

function collect(): EnvInput {
  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { effectiveType?: string; downlink?: number; rtt?: number }
    userAgentData?: { platform?: string }
  }
  return {
    ua: nav.userAgent,
    language: nav.language,
    languages: Array.isArray(nav.languages) ? nav.languages.join(', ') : '',
    platform: nav.platform,
    userAgentData: nav.userAgentData?.platform ?? null,
    cpuCores: nav.hardwareConcurrency ?? null,
    deviceMemory: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    touchPoints: nav.maxTouchPoints ?? 0,
    cookiesEnabled: nav.cookieEnabled,
    online: nav.onLine,
    dpr: window.devicePixelRatio,
    screen: `${screen.width} × ${screen.height}`,
    viewport: `${window.innerWidth} × ${window.innerHeight}`,
    colorDepth: screen.colorDepth,
    timezone: timezone(),
    connection: nav.connection
      ? [nav.connection.effectiveType, nav.connection.downlink ? `${nav.connection.downlink} Mbps` : '', nav.connection.rtt ? `RTT ${nav.connection.rtt}ms` : '']
          .filter(Boolean)
          .join(' · ')
      : null,
    storageQuota: null,
    storageUsage: null,
    webglRenderer: webglRenderer(),
    doNotTrack: nav.doNotTrack ?? ''
  }
}

async function collectStorage(): Promise<{ quota: string | null; usage: string | null }> {
  try {
    if (!navigator.storage?.estimate) return { quota: null, usage: null }
    const est = await navigator.storage.estimate()
    return {
      quota: est.quota ? humanSize(est.quota) : null,
      usage: est.usage ? humanSize(est.usage) : null
    }
  } catch {
    return { quota: null, usage: null }
  }
}

async function refresh() {
  const input = collect()
  const st = await collectStorage()
  input.storageQuota = st.quota
  input.storageUsage = st.usage
  report.value = buildReport(input, detectFeatures())
  copiedAt.value = Date.now()
}

onMounted(refresh)
</script>

<template>
  <div class="tu-t1">
    <div class="tu-toolbar">
      <button type="button" class="tu-btn" @click="refresh">重新检测</button>
      <template v-if="report">
        <button type="button" class="tu-btn ghost" @click="copy(text)">复制文本报告</button>
        <button type="button" class="tu-btn ghost" @click="save(`browser-env-${copiedAt}.json`, reportToJson(report), 'application/json')">导出 JSON</button>
      </template>
    </div>

    <template v-if="report">
      <div v-for="g in report.rows" :key="g.group" class="be-group">
        <h3 class="be-title">{{ g.group }}</h3>
        <div class="tu-table-wrap">
          <table class="tu-table">
            <tbody>
              <tr v-for="it in g.items" :key="it.k">
                <th class="be-k">{{ it.k }}</th>
                <td class="be-v">{{ it.v }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <h3 class="be-title">能力检测（{{ report.features.filter((f) => f.ok).length }} / {{ report.features.length }} 支持）</h3>
      <div class="be-feats">
        <span v-for="f in report.features" :key="f.name" class="be-feat" :class="{ 'is-ok': f.ok }">
          {{ f.ok ? '✓' : '✕' }} {{ f.name }}
        </span>
      </div>

      <details class="tu-folding">
        <summary>原始 User-Agent</summary>
        <div class="tu-folding-body be-ua">{{ report.rawUa }}</div>
      </details>
      <p class="tu-hint">所有数据仅在本地采集与展示，点击「导出」才生成文件，不会自动上传。</p>
    </template>
  </div>
</template>

<style scoped>
.be-group { display: flex; flex-direction: column; gap: 8px; }
.be-title { margin: 8px 0 0; font-size: var(--fs-sm); font-weight: 600; color: var(--color-text); }
.be-k { width: 140px; }
.be-v { font-family: var(--font-family-mono); word-break: break-all; }
.be-feats { display: flex; flex-wrap: wrap; gap: 8px; }
.be-feat {
  font-size: var(--fs-caption);
  padding: 4px 10px;
  border-radius: var(--radius-full);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
}
.be-feat.is-ok { color: var(--color-success-text); border-color: var(--color-success); background: var(--color-success-soft); }
.be-ua { word-break: break-all; }
</style>

<script setup lang="ts">
/**
 * 网络测速：同源静态资源下行带宽 + 延迟/抖动
 *
 * 明确不做（UI 已标注）：上行测速（无后端接收端）、外部测速节点。
 */
import { computed, ref } from 'vue'
import {
  CONCURRENCY,
  median,
  SPEED_ASSETS,
  SINGLE_TIMEOUT_MS,
  speedLabel,
  summarize,
  type SpeedResult
} from './speedCore'
import { useToast } from '@/composables/useToast'

const toast = useToast()

const testing = ref(false)
const progress = ref(0)
const result = ref<SpeedResult | null>(null)
const history = ref<{ at: number; mbps: number; latency: number }[]>([])

const mbpsText = computed(() => (result.value ? result.value.mbps.toFixed(2) : '—'))

/** 带宽测试：并发拉取同源图片（带 cache-buster），按样本计时 */
async function measureBandwidth(): Promise<{ downloads: { bytes: number; ms: number }[] }> {
  const jobs = SPEED_ASSETS.map((name) => async () => {
    const url = `${import.meta.env.BASE_URL}backgrounds/${name}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`
    const t0 = performance.now()
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), SINGLE_TIMEOUT_MS)
      const res = await fetch(url, { cache: 'no-store', signal: ctrl.signal })
      const buf = await res.arrayBuffer()
      clearTimeout(timer)
      return { bytes: buf.byteLength, ms: performance.now() - t0 }
    } catch {
      return { bytes: 0, ms: 0 }
    }
  })
  const downloads: { bytes: number; ms: number }[] = []
  let done = 0
  const queue = jobs.slice()
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (queue.length) {
        const job = queue.shift()
        if (!job) break
        const r = await job()
        if (r.bytes > 0) downloads.push(r)
        done++
        progress.value = Math.round((done / jobs.length) * 100)
      }
    })
  )
  return { downloads }
}

/** 延迟：对同源 favicon 发 HEAD 请求取 RTT */
async function measureLatency(): Promise<number[]> {
  const pings: number[] = []
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 3000)
      await fetch(`${import.meta.env.BASE_URL}favicon.ico?t=${Date.now()}-${i}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: ctrl.signal
      })
      clearTimeout(timer)
      pings.push(performance.now() - t0)
    } catch {
      // 单次失败忽略
    }
  }
  return pings
}

async function run() {
  if (testing.value) return
  testing.value = true
  progress.value = 0
  result.value = null
  try {
    const pings = await measureLatency()
    progress.value = 10
    const { downloads } = await measureBandwidth()
    const r = summarize(downloads, pings)
    if (!r.samples) {
      toast.error('测速失败：同源资源不可达')
      testing.value = false
      return
    }
    result.value = r
    history.value = [{ at: Date.now(), mbps: r.mbps, latency: r.latency }, ...history.value].slice(0, 5)
  } catch {
    toast.error('测速过程出现异常')
  }
  testing.value = false
}

function fmtLatency(list: number[]): string {
  return list.length ? `${Math.round(median(list))} ms` : '—'
}
</script>

<template>
  <div class="tu-t1">
    <p class="tu-alert info">
      通过下载本站静态资源测下行带宽与延迟；上行测速暂不支持（无后端接收端）。结果受并发与浏览器限制影响，仅供粗略参考。
    </p>

    <div class="tu-toolbar">
      <button type="button" class="tu-btn" :disabled="testing" @click="run">
        {{ testing ? `测速中 ${progress}%…` : '开始测速' }}
      </button>
      <span v-if="result" class="tu-hint st-inline">{{ speedLabel(result.mbps) }}</span>
    </div>

    <div v-if="result" class="tu-grid">
      <div class="tu-card">
        <div class="tu-card-title">下行带宽</div>
        <div class="tu-card-value">{{ mbpsText }} Mbps</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">延迟</div>
        <div class="tu-card-value">{{ result.latency ? Math.round(result.latency) + ' ms' : '—' }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">抖动</div>
        <div class="tu-card-value">{{ result.jitterMs ? result.jitterMs.toFixed(1) + ' ms' : '—' }}</div>
      </div>
      <div class="tu-card">
        <div class="tu-card-title">下载量</div>
        <div class="tu-card-value">{{ (result.bytes / 1048576).toFixed(2) }} MB</div>
      </div>
    </div>

    <div v-if="history.length" class="tu-table-wrap">
      <table class="tu-table">
        <thead>
          <tr><th>时间</th><th>下行</th><th>延迟</th></tr>
        </thead>
        <tbody>
          <tr v-for="h in history" :key="h.at">
            <td>{{ new Date(h.at).toLocaleTimeString() }}</td>
            <td>{{ h.mbps.toFixed(2) }} Mbps</td>
            <td>{{ h.latency ? Math.round(h.latency) + ' ms' : fmtLatency([h.latency]) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-if="result" class="tu-hint">共 {{ result.samples }} 个有效样本；带宽取样本 75 分位以剔除慢启动。全部计算在本地完成。</p>
  </div>
</template>

<style scoped>
.st-inline { margin-bottom: 0; }
</style>

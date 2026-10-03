<script setup lang="ts">
/**
 * 连通性检测（纯前端，零上传）
 * ⚠️ 浏览器无法发送 ICMP 报文，故本工具用「HTTP 握手 + 计时」近似判断目标是否可达。
 */
import { ref, computed } from 'vue'
import { useToast } from '@/composables/useToast'
import { splitTargets, normalizeTarget, probeOnce, summarize, type ProbeResult } from '../../core/ping'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const toast = useToast()

const input = ref('example.com, github.com, 1.1.1.1')
const timeoutMs = ref(5000)
const running = ref(false)
const results = ref<ProbeResult[]>([])
/** 并发度：同时最多探测的目标数 */
const concurrency = ref(6)

useDirtyFlag(() => input.value.trim().length > 0)
const { copy, save } = useToolActions()

const stats = computed(() => summarize(results.value))
const hasRun = computed(() => results.value.length > 0)

/** 结果表格文本（复制/导出用） */
const tableText = computed(() => {
  if (!results.value.length) return ''
  const head = '目标,状态,耗时(ms),说明'
  const lines = results.value.map(r =>
    [r.input, r.status, r.ms != null ? String(r.ms) : '-', r.message].join(',')
  )
  return [head, ...lines].join('\n')
})

async function run() {
  const targets = splitTargets(input.value)
  if (!targets.length) {
    toast.warning('请输入至少一个网址或 IP')
    return
  }
  running.value = true
  results.value = []

  // 并发分批，避免一次开太多请求被浏览器排队/拒绝
  const size = Math.max(1, Math.min(10, concurrency.value))
  for (let i = 0; i < targets.length; i += size) {
    const batch = targets.slice(i, i + size)
    const done = await Promise.all(
      batch.map(async t => {
        const { url, host } = normalizeTarget(t)
        const r = await probeOnce(url, timeoutMs.value)
        const res: ProbeResult = {
          input: t,
          url,
          host,
          ok: r.ok,
          status: r.ok ? '通过' : '拒绝',
          message: r.message
        }
        if (r.ms != null) res.ms = r.ms
        if (r.statusCode != null) res.statusCode = r.statusCode
        return res
      })
    )
    results.value = [...results.value, ...done]
  }
  running.value = false
  const s = stats.value
  if (s.total) toast.success(`检测完成：通过 ${s.pass}，拒绝 ${s.fail}（共 ${s.total}）`)
}

function clearAll() {
  results.value = []
  toast.info('已清空检测结果')
}
</script>

<template>
  <div class="tu-t2">
    <div class="tu-t1">
      <TuField label="目标（网址或 IP，多个用逗号分隔）">
        <textarea
          v-model="input"
          class="tu-textarea"
          style="min-height: 110px"
          placeholder="example.com, https://www.github.com, 1.1.1.1, 192.168.1.1:8080"
        />
        <p class="tu-hint">支持域名、IPv4、IPv6 与 host:port；未写协议默认按 http:// 探测。</p>
      </TuField>

      <TuField label="超时（毫秒）" :extra="String(timeoutMs)">
        <input v-model.number="timeoutMs" type="range" min="1000" max="15000" step="500" class="tu-range" />
      </TuField>

      <TuField label="并发数" :extra="String(concurrency)">
        <input v-model.number="concurrency" type="range" min="1" max="10" class="tu-range" />
      </TuField>

      <div class="tu-row">
        <button class="tu-btn" :disabled="running" @click="run">
          {{ running ? '检测中…' : '开始检测' }}
        </button>
        <button class="tu-btn ghost" :disabled="running || !hasRun" @click="clearAll">清空结果</button>
        <button v-if="hasRun" class="tu-btn ghost" @click="copy(tableText)">复制</button>
        <button v-if="hasRun" class="tu-btn ghost" @click="save('ping-result.csv', '﻿' + tableText, 'text/csv;charset=utf-8')">
          导出 CSV
        </button>
      </div>

      <p v-if="hasRun" class="tu-hint">
        共 {{ stats.total }} 个目标 ·
        <span class="pg-ok">通过 {{ stats.pass }}</span> ·
        <span class="pg-fail">拒绝 {{ stats.fail }}</span>
      </p>
    </div>

    <TuOutput
      title="检测结果"
      :text="tableText"
      filename="ping-result.csv"
      mime="text/csv;charset=utf-8"
      empty="点击「开始检测」查看结果"
    >
      <div v-if="hasRun" class="tu-table-wrap">
        <table class="tu-table">
          <thead>
            <tr>
              <th>目标</th>
              <th>状态</th>
              <th>耗时</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in results" :key="r.input">
              <td class="tu-mono">{{ r.input }}</td>
              <!-- 三重表达：图标（勾/叉）+ 文字（通过/拒绝）+ 颜色（绿/红） -->
              <td>
                <span class="pg-status" :class="r.ok ? 'is-ok' : 'is-fail'">
                  <span class="pg-icon" aria-hidden="true">{{ r.ok ? '✔' : '✘' }}</span>
                  {{ r.status }}
                </span>
              </td>
              <td class="tu-mono">{{ r.ms != null ? r.ms + ' ms' : '—' }}</td>
              <td class="pg-msg">{{ r.message }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="pg-empty">暂无结果</p>
    </TuOutput>

    <details class="tu-folding">
      <summary>使用说明与能力边界</summary>
      <div class="tu-folding-body">
        <ol>
          <li><b>浏览器无法发送 ICMP 报文</b>，因此本工具不是系统级 ping，而是用 <b>HTTP 握手 + 计时</b>近似判断目标是否可达。</li>
          <li>结果含义：<b>通过</b>=浏览器能连上该地址（网络层可达）；<b>拒绝</b>=连不上、超时或被浏览器拦截。</li>
          <li>受同源策略影响，部分站点即使在线也可能因 CORS / 混合内容被浏览器拦截而显示「拒绝」，此时属浏览器限制，并非目标真的离线。</li>
          <li>全部探测在本机浏览器完成，不向任何第三方服务器发送数据。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
/* 状态徽标：通过=绿、拒绝=红（同时带 ✔/✘ 图标与「通过/拒绝」文字） */
.pg-status { display: inline-flex; align-items: center; gap: 4px; font-weight: 600; white-space: nowrap; }
.pg-icon { font-weight: 700; }
.pg-status.is-ok { color: var(--color-success); }
.pg-status.is-fail { color: var(--color-error); }
.pg-ok { color: var(--color-success); }
.pg-fail { color: var(--color-error); }
.pg-msg { color: var(--color-text-secondary); font-size: 12px; }
.pg-empty { margin: 0; font-size: 12.5px; color: var(--color-text-muted); }
.tu-mono { font-family: var(--font-family-mono); }
</style>

<script setup lang="ts">
/**
 * 世界时钟与时区转换（Intl 自动处理夏令时）+ 倒计时
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  CITIES,
  convertZone,
  countdown,
  diffText,
  formatInZone,
  formatOffset,
  tzOffsetMinutes,
  tzSupported,
  type Countdown
} from '../../core/clock'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const now = ref(new Date())
const selected = ref<string[]>(['shanghai', 'tokyo', 'london', 'newyork', 'utc'])
const hour12 = ref(false)
const showSeconds = ref(true)
const fromTz = ref('Asia/Shanghai')
const toTz = ref('America/New_York')
const localTime = ref('2026-01-01 09:00')
const targetTime = ref('2026-12-31 23:59')

useDirtyFlag(() => selected.value.length > 1)
const { copy } = useToolActions()

let timer: number | undefined

function tick() {
  now.value = new Date()
}
timer = window.setInterval(tick, 1000)

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})

const supportedCities = computed(() => CITIES.filter(c => tzSupported(c.tz)))

const rows = computed(() =>
  selected.value
    .map(id => supportedCities.value.find(c => c.id === id))
    .filter(Boolean)
    .map(c => {
      const city = c as (typeof CITIES)[number]
      const f = formatInZone(city.tz, now.value, { hour12: hour12.value, seconds: showSeconds.value })
      return {
        id: city.id,
        name: city.name,
        tz: city.tz,
        flag: city.flag,
        date: f.date,
        time: f.time,
        weekday: f.weekday,
        offset: formatOffset(tzOffsetMinutes(city.tz, now.value)),
        diff: diffText(city.tz, now.value)
      }
    })
)

function toggleCity(id: string) {
  const i = selected.value.indexOf(id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(id)
}

const converted = computed(() => convertZone(fromTz.value, toTz.value, localTime.value))

const cd = computed<Countdown>(() => {
  const d = new Date(targetTime.value.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? { days: 0, hours: 0, minutes: 0, seconds: 0, total: 0, past: false } : countdown(d, now.value)
})

const clockText = computed(() =>
  rows.value.map(r => `${r.flag} ${r.name}\t${r.date} ${r.time}\t${r.offset}`).join('\n')
)
</script>

<template>
  <div class="tu-t6">
    <div class="tu-toolbar">
      <button
        v-for="c in supportedCities"
        :key="c.id"
        type="button"
        class="tu-check"
        :class="{ 'is-on': selected.includes(c.id) }"
        @click="toggleCity(c.id)"
      >{{ c.flag }} {{ c.name }}</button>
    </div>

    <div class="tu-row">
      <button type="button" class="tu-check" :class="{ 'is-on': hour12 }" @click="hour12 = !hour12">12 小时制</button>
      <button type="button" class="tu-check" :class="{ 'is-on': showSeconds }" @click="showSeconds = !showSeconds">
        显示秒
      </button>
    </div>

    <TuOutput title="世界时钟" :text="clockText" filename="world-clock.txt" empty="至少选择一个城市">
      <template #actions>
        <button type="button" class="tu-btn ghost" @click="copy(clockText)">复制</button>
      </template>
      <div class="tu-grid">
        <div v-for="r in rows" :key="r.id" class="tu-card">
          <div class="tu-card-title">{{ r.flag }} {{ r.name }} · {{ r.offset }}</div>
          <div class="tu-card-value tu-mono">{{ r.time }}</div>
          <div class="tu-hint">{{ r.date }} {{ r.weekday }}</div>
          <div class="tu-hint">{{ r.diff }}</div>
        </div>
      </div>
    </TuOutput>

    <TuField label="时区换算">
      <div class="tu-row">
        <span class="tu-label">从</span>
        <select v-model="fromTz" class="tu-select tu-inline" style="max-width: 180px">
          <option v-for="c in supportedCities" :key="c.id" :value="c.tz">{{ c.name }}（{{ c.tz }}）</option>
        </select>
        <span class="tu-label">到</span>
        <select v-model="toTz" class="tu-select tu-inline" style="max-width: 180px">
          <option v-for="c in supportedCities" :key="c.id" :value="c.tz">{{ c.name }}（{{ c.tz }}）</option>
        </select>
      </div>
      <div class="tu-row">
        <span class="tu-label">源时间</span>
        <input v-model="localTime" class="tu-input tu-inline" style="max-width: 200px" placeholder="YYYY-MM-DD HH:mm" />
      </div>
      <p v-if="converted.ok" class="tu-alert ok">换算结果：{{ converted.text }}</p>
      <p v-else class="tu-alert">{{ converted.error }}</p>
    </TuField>

    <TuField label="倒计时">
      <div class="tu-row">
        <span class="tu-label">目标时间</span>
        <input v-model="targetTime" class="tu-input tu-inline" style="max-width: 200px" placeholder="YYYY-MM-DD HH:mm" />
      </div>
      <div class="tu-grid">
        <div class="tu-card">
          <div class="tu-card-title">天</div>
          <div class="tu-card-value">{{ cd.days }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">时</div>
          <div class="tu-card-value">{{ cd.hours }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">分</div>
          <div class="tu-card-value">{{ cd.minutes }}</div>
        </div>
        <div class="tu-card">
          <div class="tu-card-title">秒</div>
          <div class="tu-card-value">{{ cd.seconds }}</div>
        </div>
      </div>
      <p v-if="cd.past && cd.total !== 0" class="tu-alert">目标时间已过去</p>
    </TuField>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>点击城市名可加入/移出时钟面板，时间每秒刷新。</li>
          <li>时区换算与时差基于 Intl 数据，自动处理夏令时。</li>
          <li>倒计时支持未来与过去两种场景，显示天/时/分/秒。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 18px; }
</style>

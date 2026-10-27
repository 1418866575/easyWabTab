<script setup lang="ts">
/**
 * 退休年龄计算器（依据 2025 年渐进式延迟法定退休年龄政策，纯前端）
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  RETIRE_CATEGORIES,
  calcRetirement,
  type RetireCategory
} from '../../core/retirement'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import TuField from '../../components/tool/TuField.vue'

const LS_KEY = 'toolbox-retirement-birth'
const GOV_SOURCE_URL = 'https://www.gov.cn/yaowen/liebiao/202409/content_6974294.htm'

const now = new Date()
const todayText = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`
const defaultBirth = `${now.getFullYear() - 35}-06`

/** 读取上次选择的出生年月（localStorage），非法则回落默认值 */
function loadBirth(): string {
  try {
    const v = localStorage.getItem(LS_KEY)
    if (v && /^\d{4}-\d{2}$/.test(v)) {
      const m = Number(v.slice(5, 7))
      if (m >= 1 && m <= 12) return v
    }
  } catch {
    /* localStorage 不可用时忽略 */
  }
  return defaultBirth
}

const birth = ref(loadBirth())
const category = ref<RetireCategory>('male')

// 出生年月缓存到本地，下次打开自动带出
watch(birth, v => {
  try {
    localStorage.setItem(LS_KEY, v)
  } catch {
    /* ignore */
  }
})

const pad2 = (n: number) => String(n).padStart(2, '0')

const parsed = computed(() => {
  const m = /^(\d{4})-(\d{2})$/.exec(birth.value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (month < 1 || month > 12) return null
  return { year, month }
})

const birthLabel = computed(() =>
  parsed.value ? `${parsed.value.year} 年 ${parsed.value.month} 月` : '请选择出生年月'
)

// ===== 年月选择弹层 =====
const pickerOpen = ref(false)
const pickerRef = ref<HTMLElement | null>(null)
const yearListRef = ref<HTMLElement | null>(null)
const viewYear = ref(parsed.value?.year ?? now.getFullYear() - 35)

const years = computed(() => {
  const maxYear = now.getFullYear()
  const arr: number[] = []
  for (let y = 1940; y <= maxYear; y++) arr.push(y)
  return arr
})

function openPicker() {
  viewYear.value = parsed.value?.year ?? now.getFullYear() - 35
  pickerOpen.value = true
  nextTick(() => {
    const el = yearListRef.value?.querySelector<HTMLElement>(`[data-y="${viewYear.value}"]`)
    el?.scrollIntoView({ block: 'center' })
  })
}

function togglePicker() {
  if (pickerOpen.value) pickerOpen.value = false
  else openPicker()
}

function pickMonth(m: number) {
  birth.value = `${viewYear.value}-${pad2(m)}`
  pickerOpen.value = false
}

function onDocMouseDown(e: MouseEvent) {
  if (!pickerOpen.value) return
  const el = pickerRef.value
  if (el && !el.contains(e.target as Node)) pickerOpen.value = false
}
onMounted(() => document.addEventListener('mousedown', onDocMouseDown, true))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocMouseDown, true))

const result = computed(() => {
  const p = parsed.value
  return calcRetirement({
    category: category.value,
    birthYear: p ? p.year : 0,
    birthMonth: p ? p.month : 0,
    today: now
  })
})

useDirtyFlag(() => !!parsed.value)
</script>

<template>
  <div class="tu-t4 rc">
    <div>
      <TuField label="出生年月" hint="点选年月；选择会被记住，下次自动带出。">
        <div ref="pickerRef" class="rc-ym">
          <button
            type="button"
            class="tu-input rc-ym-trigger"
            :class="{ 'is-open': pickerOpen }"
            data-testid="tb-modal-input"
            @click="togglePicker"
          >
            <span>{{ birthLabel }}</span>
            <span class="rc-ym-caret">▾</span>
          </button>

          <div v-if="pickerOpen" class="rc-ym-pop">
            <div ref="yearListRef" class="rc-ym-years">
              <button
                v-for="y in years"
                :key="y"
                :data-y="y"
                type="button"
                class="rc-ym-year"
                :class="{ on: y === viewYear }"
                @click="viewYear = y"
              >
                {{ y }}
              </button>
            </div>
            <div class="rc-ym-months">
              <button
                v-for="m in 12"
                :key="m"
                type="button"
                class="rc-ym-month"
                :class="{ on: parsed && parsed.year === viewYear && parsed.month === m }"
                @click="pickMonth(m)"
              >
                {{ m }}月
              </button>
            </div>
          </div>
        </div>
      </TuField>

      <TuField
        label="人员类别"
        hint="女职工按原法定退休年龄区分：干部/管理技术岗 55 岁，工人岗 50 岁。"
      >
        <div class="rc-cats">
          <button
            v-for="c in RETIRE_CATEGORIES"
            :key="c.id"
            type="button"
            class="tu-check"
            :class="{ 'is-on': category === c.id }"
            @click="category = c.id"
          >
            {{ c.shortName }}
          </button>
        </div>
      </TuField>

      <TuField label="测算日期">
        <p class="rc-today">{{ todayText }}</p>
      </TuField>
    </div>

    <div>
      <p v-if="!parsed" class="tu-hint">请选择出生年月后自动测算</p>
      <p v-else-if="!result.ok" class="tu-alert">{{ result.error }}</p>

      <template v-else>
        <div class="rc-banner">
          <div class="rc-banner-label">法定退休年龄</div>
          <div class="rc-banner-age">{{ result.legalAgeText }}</div>
          <div class="rc-banner-sub">预计 {{ result.retireText }} 退休</div>
          <div class="rc-banner-rem" :class="{ 'is-done': result.isRetired }">
            {{ result.remainingText }}
          </div>
        </div>

        <div class="tu-grid rc-grid">
          <div class="tu-card">
            <div class="tu-card-title">原法定退休年龄</div>
            <div class="tu-card-value">{{ result.baseAgeText }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">预计退休时间</div>
            <div class="tu-card-value">{{ result.retireText }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">弹性退休区间</div>
            <div class="tu-card-value rc-small">
              {{ result.flexEarliestText }} ~ {{ result.flexLatestText }}
            </div>
            <div class="tu-hint">{{ result.flexEarliestDate }} ~ {{ result.flexLatestDate }}</div>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">最低缴费年限</div>
            <div class="tu-card-value">{{ result.minContribText }}</div>
          </div>
        </div>

        <details class="tu-folding">
          <summary>政策依据与说明</summary>
          <div class="tu-folding-body">
            <p class="rc-source">
              政策原文：
              <a :href="GOV_SOURCE_URL" target="_blank" rel="noopener noreferrer">
                中国政府网 · 全国人大常委会关于实施渐进式延迟法定退休年龄的决定
              </a>
            </p>
            <ol>
              <li v-for="(n, i) in result.notes" :key="i">{{ n }}</li>
            </ol>
          </div>
        </details>
      </template>
    </div>
  </div>
</template>

<style scoped>
.rc-banner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 18px 16px;
  margin-bottom: 12px;
  text-align: center;
  background: var(--color-primary-soft);
  border-radius: 12px;
}
.rc-banner-label {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--color-primary);
}
.rc-banner-age {
  font-size: 38px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--color-primary);
}
.rc-banner-sub {
  font-size: 13px;
  color: var(--color-text-secondary);
}
.rc-banner-rem {
  margin-top: 2px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}
.rc-banner-rem.is-done {
  color: var(--color-success);
}

.rc-cats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rc-grid {
  margin-bottom: 12px;
}

.rc-small {
  font-size: 15px;
}

.rc-today {
  margin: 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

/* ===== 年月选择器 ===== */
.rc-ym {
  position: relative;
}
.rc-ym-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  text-align: left;
  cursor: pointer;
}
.rc-ym-trigger.is-open {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px var(--color-primary-soft);
}
.rc-ym-caret {
  font-size: 12px;
  color: var(--color-text-muted);
}
.rc-ym-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 8px;
  width: 100%;
  min-width: 260px;
  padding: 8px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 14%);
}
.rc-ym-years {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 220px;
  overflow-y: auto;
  padding-right: 2px;
}
.rc-ym-year,
.rc-ym-month {
  min-height: 28px;
  padding: 4px 6px;
  font-size: 12.5px;
  font-family: var(--font-family);
  color: var(--color-text-secondary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: color var(--motion-duration) var(--motion-ease),
    background-color var(--motion-duration) var(--motion-ease);
}
.rc-ym-year:hover,
.rc-ym-month:hover {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.rc-ym-year.on,
.rc-ym-month.on {
  color: var(--color-primary);
  font-weight: 600;
  background: var(--color-primary-soft);
  border-color: var(--color-primary);
}
.rc-ym-months {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  align-content: start;
}

.rc-source {
  margin: 0 0 6px;
  font-size: 12.5px;
  line-height: 1.6;
}
.rc-source a {
  color: var(--color-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  word-break: break-all;
}

@media (max-width: 640px) {
  .rc-banner-age {
    font-size: 30px;
  }
}
</style>

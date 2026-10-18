<script setup lang="ts">
/**
 * 元素周期表（工具箱 / 科学分类）
 * 完整展示 118 个化学元素：标准 18 列网格 + 镧系/锕系独立两行，按分类着色；
 * 支持关键字搜索（序数/符号/中英文名）、分类高亮（点击图例/占位块切换）、周期/族筛选；
 * 点击元素在右侧详情卡查看序数、符号、中英文名、原子量、分类、电子排布、周期、族、
 * 相态、密度、熔点、沸点、电负性、发现者等。数据离线内置（elements.ts）。
 */
import { computed, ref } from 'vue'
import { CATEGORIES, ELEMENTS, type PElement } from './elements'

const colorMap: Record<string, string> = Object.fromEntries(CATEGORIES.map(c => [c.id, c.color]))

const search = ref('')
const activeCats = ref<string[]>([])
const periodFilter = ref<string>('')
const groupFilter = ref<string>('')
const selected = ref<PElement | null>(null)

const periods = [1, 2, 3, 4, 5, 6, 7]
const groups = Array.from({ length: 18 }, (_, i) => i + 1)

// 背景色亮度 → 文字深色/白色，保证各分类配色下可读
function textOn(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1f2937' : '#ffffff'
}

function matchesSearch(e: PElement): boolean {
  const q = search.value.trim().toLowerCase()
  if (!q) return true
  return String(e.number) === q ||
    e.symbol.toLowerCase().includes(q) ||
    e.cn.includes(q) ||
    e.name.toLowerCase().includes(q)
}

// 统一「聚焦」模型：命中全部生效筛选则高亮，否则淡出（保持表格完整形状）
function isActive(e: PElement): boolean {
  if (!matchesSearch(e)) return false
  if (activeCats.value.length && !activeCats.value.includes(e.category)) return false
  if (periodFilter.value && String(e.period) !== periodFilter.value) return false
  if (groupFilter.value && String(e.group) !== groupFilter.value) return false
  return true
}

const activeCount = computed(() => ELEMENTS.filter(isActive).length)

function selectEl(e: PElement) { selected.value = e }
function toggleCat(id: string) {
  const i = activeCats.value.indexOf(id)
  if (i >= 0) activeCats.value.splice(i, 1)
  else activeCats.value.push(id)
}
function resetFilters() {
  search.value = ''
  activeCats.value = []
  periodFilter.value = ''
  groupFilter.value = ''
}

function fmtMass(e: PElement): string {
  return e.massApprox ? `[${e.atomicMass}]` : String(e.atomicMass)
}
function kToC(k: number | null): string {
  return k == null ? '—' : `${(k - 273.15).toFixed(1)} °C`
}
</script>

<template>
  <div class="pt-root">
    <div class="tu-toolbar pt-bar">
      <input
        v-model="search" class="tu-input pt-search" type="search"
        placeholder="搜索：序数 / 符号 / 中文名 / 英文名（如 26、Fe、铁）"
        aria-label="搜索元素"
      />
      <label class="tu-label pt-inline">周期</label>
      <select v-model="periodFilter" class="tu-select">
        <option value="">全部</option>
        <option v-for="p in periods" :key="p" :value="String(p)">{{ p }}</option>
      </select>
      <label class="tu-label pt-inline">族</label>
      <select v-model="groupFilter" class="tu-select">
        <option value="">全部</option>
        <option v-for="g in groups" :key="g" :value="String(g)">{{ g }}</option>
      </select>
      <button class="tu-btn ghost" @click="resetFilters">重置</button>
      <span class="tu-spacer"></span>
      <span class="tu-stat">命中 {{ activeCount }} / {{ ELEMENTS.length }}</span>
    </div>

    <div class="pt-wrap">
      <div class="pt-main tu-canvas-box">
        <div class="pt-grid">
          <button
            v-for="e in ELEMENTS" :key="e.number"
            class="pt-cell"
            :class="{ dim: !isActive(e), sel: selected === e }"
            :style="{ gridColumn: e.x, gridRow: e.y, background: colorMap[e.category], color: textOn(colorMap[e.category]) }"
            :title="`${e.cn} ${e.symbol}（${e.categoryCn}）`"
            @click="selectEl(e)"
          >
            <span class="pt-num">{{ e.number }}</span>
            <span class="pt-sym">{{ e.symbol }}</span>
            <span class="pt-cn">{{ e.cn }}</span>
          </button>

          <!-- f 区定位占位（点击按分类筛选） -->
          <div class="pt-cell pt-placeholder" :style="{ gridColumn: 3, gridRow: 6 }" @click="toggleCat('lanthanide')">57–71</div>
          <div class="pt-cell pt-placeholder" :style="{ gridColumn: 3, gridRow: 7 }" @click="toggleCat('actinide')">89–103</div>
        </div>
      </div>

      <aside class="pt-side">
        <div class="pt-legend">
          <div class="pt-legend-title">分类（点击高亮）</div>
          <div class="pt-chips">
            <button
              v-for="c in CATEGORIES" :key="c.id"
              class="tu-check pt-chip"
              :class="{ 'is-on': activeCats.includes(c.id) }"
              @click="toggleCat(c.id)"
            >
              <span class="pt-dot" :style="{ background: c.color }"></span>{{ c.cn }}
            </button>
          </div>
        </div>

        <div class="tu-card pt-detail" v-if="selected">
          <div class="pt-detail-head">
            <span class="pt-detail-sym" :style="{ background: colorMap[selected.category], color: textOn(colorMap[selected.category]) }">{{ selected.symbol }}</span>
            <div>
              <div class="pt-detail-cn">{{ selected.cn }}</div>
              <div class="pt-detail-en">{{ selected.name }} · 第 {{ selected.number }} 号</div>
            </div>
          </div>
          <span class="pt-tag" :style="{ background: colorMap[selected.category], color: textOn(colorMap[selected.category]) }">{{ selected.categoryCn }}</span>

          <dl class="pt-dl">
            <div><dt>原子序数</dt><dd>{{ selected.number }}</dd></div>
            <div><dt>元素符号</dt><dd>{{ selected.symbol }}</dd></div>
            <div><dt>中文名称</dt><dd>{{ selected.cn }}</dd></div>
            <div><dt>英文名</dt><dd>{{ selected.name }}</dd></div>
            <div><dt>原子量</dt><dd>{{ fmtMass(selected) }} g/mol</dd></div>
            <div><dt>周期 / 族</dt><dd>{{ selected.period }} / {{ selected.group || '—' }}</dd></div>
            <div><dt>电子排布</dt><dd class="pt-mono">{{ selected.electron || '—' }}</dd></div>
            <div><dt>电子层</dt><dd class="pt-mono">{{ selected.shells.join(', ') }}</dd></div>
            <div><dt>相态（常温）</dt><dd>{{ selected.phaseCn || '—' }}</dd></div>
            <div><dt>密度</dt><dd>{{ selected.density != null ? selected.density + ' g/cm³' : '—' }}</dd></div>
            <div><dt>熔点</dt><dd>{{ selected.meltK != null ? selected.meltK + ' K（' + kToC(selected.meltK) + '）' : '—' }}</dd></div>
            <div><dt>沸点</dt><dd>{{ selected.boilK != null ? selected.boilK + ' K（' + kToC(selected.boilK) + '）' : '—' }}</dd></div>
            <div><dt>电负性</dt><dd>{{ selected.en != null ? selected.en : '—' }}</dd></div>
            <div><dt>发现者</dt><dd>{{ selected.discoveredBy || '—' }}</dd></div>
          </dl>
        </div>
        <div class="tu-card pt-detail pt-hint" v-else>
          点击任意元素查看详细资料
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.pt-root { height: 100%; display: flex; flex-direction: column; gap: 12px; }
.pt-bar { align-items: center; }
.pt-search { flex: 1 1 240px; min-width: 180px; }
.pt-inline { margin: 0 4px 0 8px; }

.pt-wrap { display: flex; gap: 12px; flex: 1 1 auto; min-height: 0; }
.pt-main { flex: 1 1 auto; min-width: 0; overflow: auto; padding: 4px; }
.pt-side { flex: 0 0 300px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }

.pt-grid {
  display: grid;
  grid-template-columns: repeat(18, minmax(40px, 1fr));
  grid-auto-rows: 46px;
  gap: 4px;
  min-width: 820px;
}
.pt-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  padding: 2px;
  cursor: pointer;
  font-family: var(--font-family);
  transition: transform var(--motion-duration) var(--motion-ease), opacity var(--motion-duration) var(--motion-ease), box-shadow var(--motion-duration) var(--motion-ease);
  overflow: hidden;
}
.pt-cell:hover { transform: scale(1.12); z-index: 5; box-shadow: 0 4px 12px rgba(0,0,0,.25); }
.pt-cell.dim { opacity: 0.18; filter: saturate(.4); }
.pt-cell.sel { outline: 3px solid var(--color-primary); outline-offset: -1px; z-index: 6; }
.pt-num { position: absolute; top: 2px; left: 4px; font-size: 9px; line-height: 1; opacity: .85; }
.pt-sym { font-size: 15px; font-weight: 700; line-height: 1.1; }
.pt-cn { font-size: 10px; line-height: 1.1; opacity: .95; }

.pt-placeholder {
  background: transparent !important;
  color: var(--color-text-muted);
  border: 1px dashed var(--color-border);
  font-size: 11px;
  cursor: pointer;
}
.pt-placeholder:hover { transform: none; box-shadow: none; color: var(--color-primary); border-color: var(--color-primary); }

.pt-legend-title { font-size: 12px; color: var(--color-text-secondary); margin-bottom: 6px; }
.pt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pt-chip { font-size: 11.5px; padding: 3px 8px; }
.pt-dot { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-right: 5px; flex: 0 0 auto; }

.pt-detail { padding: 12px; }
.pt-detail-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.pt-detail-sym { width: 46px; height: 46px; border-radius: 8px; display: grid; place-items: center; font-size: 20px; font-weight: 700; flex: 0 0 auto; }
.pt-detail-cn { font-size: 17px; font-weight: 600; color: var(--color-text); }
.pt-detail-en { font-size: 12px; color: var(--color-text-secondary); }
.pt-tag { display: inline-block; font-size: 11px; padding: 2px 8px; border-radius: 999px; margin-bottom: 10px; }

.pt-dl { margin: 0; display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; font-size: 12.5px; }
.pt-dl > div { display: contents; }
.pt-dl dt { color: var(--color-text-secondary); white-space: nowrap; }
.pt-dl dd { margin: 0; color: var(--color-text); word-break: break-word; }
.pt-mono { font-family: var(--font-family-mono); font-size: 11.5px; }
.pt-hint { color: var(--color-text-muted); display: grid; place-items: center; min-height: 120px; text-align: center; }

@media (max-width: 860px) {
  .pt-wrap { flex-direction: column; }
  .pt-side { flex: 0 0 auto; }
}
</style>

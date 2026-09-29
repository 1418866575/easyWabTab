<script setup lang="ts">
/**
 * 图表配色（基于基色生成协调方案 + 明暗阶梯）
 */
import { computed, ref } from 'vue'
import { colorScale, expandHex, harmonyColors, hexToHsl, hslToHex } from '../../core/color'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const base = ref('#3b82f6')
const count = ref(6)
const mode = ref<'even' | 'harmony'>('even')
const scale = ref<string[]>([])

useDirtyFlag(() => !!base.value)
const { copy, save } = useToolActions()

const harmony = computed(() => {
  try {
    return harmonyColors(expandHex(base.value))
  } catch {
    return []
  }
})

const palette = computed<string[]>(() => {
  const n = Math.max(2, Math.min(12, Number(count.value) || 6))
  try {
    const { h, s } = hexToHsl(expandHex(base.value))
    if (mode.value === 'harmony' && harmony.value.length) {
      return harmony.value.slice(0, n).map(x => x.hex.toUpperCase())
    }
    const list: string[] = []
    for (let i = 0; i < n; i++) {
      const hh = (h + Math.round(360 / n) * i) % 360
      const ss = Math.max(35, Math.min(90, s + (i % 2 ? 8 : -8)))
      const ll = Math.max(35, Math.min(78, 50 + ((i % 3) - 1) * 10))
      list.push(hslToHex(hh, ss, ll).toUpperCase())
    }
    return list
  } catch {
    return []
  }
})

const chartPreview = computed(() => {
  const n = palette.value.length || 1
  return palette.value.map((c, i) => ({ c, v: 30 + ((i * 37) % 70) }))
})

function buildScale() {
  try {
    scale.value = colorScale(expandHex(base.value))
  } catch {
    scale.value = []
  }
}

const cssText = computed(() =>
  palette.value.map((c, i) => `  --chart-${i + 1}: ${c};`).join('\n')
)
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="基色">
        <div class="tu-row">
          <input v-model="base" type="color" class="tu-input tu-inline" style="max-width: 70px" />
          <input v-model="base" class="tu-input tu-inline" style="max-width: 130px" spellcheck="false" />
        </div>
      </TuField>

      <TuField label="生成方式">
        <div class="tu-toolbar">
          <button type="button" class="tu-check" :class="{ 'is-on': mode === 'even' }" @click="mode = 'even'">
            色环均匀分布
          </button>
          <button type="button" class="tu-check" :class="{ 'is-on': mode === 'harmony' }" @click="mode = 'harmony'">
            协调色方案
          </button>
        </div>
      </TuField>

      <TuField label="颜色数量" :extra="String(count)">
        <input v-model.number="count" type="range" min="2" max="12" class="tu-range" />
      </TuField>

      <TuField label="协调色参考">
        <div class="tu-swatches">
          <div
            v-for="h in harmony"
            :key="h.name"
            class="tu-swatch"
            :style="{ background: h.hex }"
            :title="`${h.name} ${h.hex}`"
          >{{ h.name }}</div>
        </div>
      </TuField>

      <div class="tu-row">
        <button type="button" class="tu-btn ghost" @click="buildScale">生成明暗阶梯</button>
      </div>
    </div>

    <div>
      <TuOutput
        title="配色方案"
        :text="palette.join('  ')"
        filename="palette.txt"
        empty="—"
      >
        <template #actions>
          <button type="button" class="tu-btn ghost" @click="copy(palette.join(', '))">复制色值</button>
          <button type="button" class="tu-btn ghost" @click="copy(cssText)">复制 CSS 变量</button>
          <button type="button" class="tu-btn ghost" @click="save('palette.json', JSON.stringify(palette, null, 2), 'application/json')">
            下载 JSON
          </button>
        </template>
        <div class="tu-swatches">
          <div
            v-for="c in palette"
            :key="c"
            class="tu-swatch"
            :style="{ background: c }"
            :title="c"
          >{{ c }}</div>
        </div>
      </TuOutput>

      <TuOutput title="图表效果预览" :text="palette.join(', ')" filename="chart-colors.txt" empty="—">
        <div class="tu-bars">
          <div v-for="(p, i) in chartPreview" :key="i" class="tu-bar-row">
            <span class="tu-bar-label">{{ palette[i] }}</span>
            <span class="tu-bar" :style="{ width: p.v + '%', background: p.c }" />
          </div>
        </div>
      </TuOutput>

      <TuOutput
        v-if="scale.length"
        title="明暗阶梯（10 级）"
        :text="scale.join(', ')"
        filename="scale.txt"
        empty="点击「生成明暗阶梯」"
      >
        <div class="tu-scale">
          <div v-for="(c, i) in scale" :key="i" class="tu-scale-cell" :style="{ background: c }" :title="c">
            <span>{{ i + 1 }}</span>
          </div>
        </div>
      </TuOutput>
    </div>

    <details class="tu-folding" style="grid-column: 1 / -1">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>选择基色后自动生成色环均匀分布或协调色方案的配色。</li>
          <li>色值可复制为逗号分隔、CSS 变量或 JSON，便于接入图表库。</li>
          <li>「明暗阶梯」给出同色相 10 级明暗色阶，适合做热力图与层级色。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-bars { display: flex; flex-direction: column; gap: 6px; }
.tu-bar-row { display: flex; align-items: center; gap: 8px; }
.tu-bar-label { width: 78px; font-family: var(--font-family-mono); font-size: 11.5px; }
.tu-bar { height: 14px; border-radius: 3px; min-width: 8px; }
.tu-scale { display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; }
.tu-scale-cell {
  height: 40px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  border-radius: 2px;
}
</style>

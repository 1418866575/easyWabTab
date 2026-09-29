<script setup lang="ts">
/**
 * 颜色转换与取色器（HEX / RGB / HSL / HSV / CMYK 互转 + WCAG 对比度检查）
 */
import { computed, ref, watch } from 'vue'
import {
  bundleFromRgb,
  contrastRatio,
  cmykToRgb,
  expandHex,
  hexToRgb,
  hslToHex,
  hsvToRgb,
  isValidHex,
  parseColor,
  rgbToCmyk,
  rgbToHsl,
  rgbToHsv,
  rgbToHex,
  wcagLevel,
  type ColorBundle
} from '../../core/color'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

const text = ref('#3b82f6')
const rgb = ref({ r: 59, g: 130, b: 246 })
const fg = ref('#ffffff')
const bg = ref('#3b82f6')
const parseError = ref('')
const inputMode = ref<'hex' | 'rgb' | 'hsl' | 'cmyk'>('hex')

useDirtyFlag(() => !!text.value)
const { copy } = useToolActions()

const bundle = computed<ColorBundle>(() => ({
  hex: rgbToHex(rgb.value.r, rgb.value.g, rgb.value.b),
  rgb: { ...rgb.value },
  hsl: rgbToHsl(rgb.value.r, rgb.value.g, rgb.value.b),
  hsv: rgbToHsv(rgb.value.r, rgb.value.g, rgb.value.b),
  cmyk: rgbToCmyk(rgb.value.r, rgb.value.g, rgb.value.b)
}))

const hexValue = computed(() => bundle.value.hex.toUpperCase())
const rgbText = computed(() => `rgb(${rgb.value.r}, ${rgb.value.g}, ${rgb.value.b})`)
const hslText = computed(() => {
  const { h, s, l } = bundle.value.hsl
  return `hsl(${h}, ${s}%, ${l}%)`
})
const hsvText = computed(() => {
  const { h, s, v } = bundle.value.hsv
  return `hsv(${h}, ${s}%, ${v}%)`
})
const cmykText = computed(() => {
  const c = bundle.value.cmyk
  return `cmyk(${c.c}%, ${c.m}%, ${c.y}%, ${c.k}%)`
})

const ratio = computed(() => {
  try {
    return contrastRatio(hexToRgb(expandHex(fg.value)), hexToRgb(expandHex(bg.value)))
  } catch {
    return 0
  }
})
const wcag = computed(() => wcagLevel(ratio.value, false))
const wcagLarge = computed(() => wcagLevel(ratio.value, true))

/** 从任意文本解析并同步到内部 RGB */
function applyText(v: string) {
  const res = parseColor(v)
  if (!res.ok || !res.bundle) {
    parseError.value = res.error || '无法识别'
    return
  }
  parseError.value = ''
  rgb.value = { ...res.bundle.rgb }
}

watch(text, v => {
  if (inputMode.value === 'hex') applyText(v)
})

function syncFromText() {
  applyText(text.value)
}

function onColorInput(e: Event) {
  const v = (e.target as HTMLInputElement).value
  text.value = v
  inputMode.value = 'hex'
  applyText(v)
}

function setChannel(k: 'r' | 'g' | 'b', v: number) {
  rgb.value = { ...rgb.value, [k]: Math.max(0, Math.min(255, Number(v) || 0)) }
  text.value = rgbToHex(rgb.value.r, rgb.value.g, rgb.value.b)
  inputMode.value = 'hex'
}

function setHsl(k: 'h' | 's' | 'l', v: number) {
  const cur = bundle.value.hsl
  const next = { ...cur, [k]: Number(v) || 0 }
  const hex = hslToHex(Math.max(0, Math.min(360, next.h)), Math.max(0, Math.min(100, next.s)), Math.max(0, Math.min(100, next.l)))
  applyText(hex)
  text.value = hex
  inputMode.value = 'hex'
}

function setHsv(k: 'h' | 's' | 'v', v: number) {
  const cur = bundle.value.hsv
  const next = { ...cur, [k]: Number(v) || 0 }
  const out = hsvToRgb(Math.max(0, Math.min(360, next.h)), Math.max(0, Math.min(100, next.s)), Math.max(0, Math.min(100, next.v)))
  applyText(rgbToHex(out.r, out.g, out.b))
  text.value = rgbToHex(out.r, out.g, out.b)
  inputMode.value = 'hex'
}

function setCmyk(k: 'c' | 'm' | 'y' | 'kk', v: number) {
  const cur = bundle.value.cmyk
  const next = { c: cur.c, m: cur.m, y: cur.y, k: cur.k }
  if (k === 'c') next.c = Number(v) || 0
  if (k === 'm') next.m = Number(v) || 0
  if (k === 'y') next.y = Number(v) || 0
  if (k === 'kk') next.k = Number(v) || 0
  const out = cmykToRgb(next.c, next.m, next.y, next.k)
  applyText(rgbToHex(out.r, out.g, out.b))
  text.value = rgbToHex(out.r, out.g, out.b)
  inputMode.value = 'hex'
}

function useAsFg() {
  fg.value = hexValue.value
}

function useAsBg() {
  bg.value = hexValue.value
}

const validHex = computed(() => isValidHex(text.value))
</script>

<template>
  <div class="tu-t4">
    <div>
      <TuField label="当前颜色">
        <div class="tu-row">
          <input :value="hexValue" type="color" class="tu-input tu-inline" style="max-width: 70px" @input="onColorInput" />
          <input v-model="text" class="tu-input" spellcheck="false" placeholder="#3b82f6 或 rgb(…) 或 hsl(…) 或 cmyk(…)" />
          <button type="button" class="tu-btn ghost" @click="syncFromText">解析</button>
        </div>
        <p v-if="parseError" class="tu-alert">{{ parseError }}</p>
        <p v-else-if="!validHex" class="tu-hint">支持 #hex / rgb() / hsl() / cmyk() 输入</p>
      </TuField>

      <div class="tu-preview tu-checker" :style="{ background: hexValue, minHeight: '96px' }" />

      <TuField label="RGB">
        <div class="tu-row">
          <span class="tu-label">R</span>
          <input :value="rgb.r" type="range" min="0" max="255" class="tu-range" @input="setChannel('r', +($event.target as HTMLInputElement).value)" />
          <input :value="rgb.r" type="number" min="0" max="255" class="tu-input tu-inline" style="max-width: 78px" @change="setChannel('r', +($event.target as HTMLInputElement).value)" />
        </div>
        <div class="tu-row">
          <span class="tu-label">G</span>
          <input :value="rgb.g" type="range" min="0" max="255" class="tu-range" @input="setChannel('g', +($event.target as HTMLInputElement).value)" />
          <input :value="rgb.g" type="number" min="0" max="255" class="tu-input tu-inline" style="max-width: 78px" @change="setChannel('g', +($event.target as HTMLInputElement).value)" />
        </div>
        <div class="tu-row">
          <span class="tu-label">B</span>
          <input :value="rgb.b" type="range" min="0" max="255" class="tu-range" @input="setChannel('b', +($event.target as HTMLInputElement).value)" />
          <input :value="rgb.b" type="number" min="0" max="255" class="tu-input tu-inline" style="max-width: 78px" @change="setChannel('b', +($event.target as HTMLInputElement).value)" />
        </div>
      </TuField>

      <TuField label="HSL">
        <div class="tu-row">
          <span class="tu-label">H</span>
          <input :value="bundle.hsl.h" type="range" min="0" max="360" class="tu-range" @input="setHsl('h', +($event.target as HTMLInputElement).value)" />
        </div>
        <div class="tu-row">
          <span class="tu-label">S</span>
          <input :value="bundle.hsl.s" type="range" min="0" max="100" class="tu-range" @input="setHsl('s', +($event.target as HTMLInputElement).value)" />
        </div>
        <div class="tu-row">
          <span class="tu-label">L</span>
          <input :value="bundle.hsl.l" type="range" min="0" max="100" class="tu-range" @input="setHsl('l', +($event.target as HTMLInputElement).value)" />
        </div>
      </TuField>

      <TuField label="HSV / CMYK（只读可调）">
        <div class="tu-row">
          <span class="tu-label">H</span>
          <input :value="bundle.hsv.h" type="range" min="0" max="360" class="tu-range" @input="setHsv('h', +($event.target as HTMLInputElement).value)" />
          <span class="tu-label">S</span>
          <input :value="bundle.hsv.s" type="range" min="0" max="100" class="tu-range" @input="setHsv('s', +($event.target as HTMLInputElement).value)" />
        </div>
        <div class="tu-row">
          <span class="tu-label">V</span>
          <input :value="bundle.hsv.v" type="range" min="0" max="100" class="tu-range" @input="setHsv('v', +($event.target as HTMLInputElement).value)" />
          <span class="tu-label">K</span>
          <input :value="bundle.cmyk.k" type="range" min="0" max="100" class="tu-range" @input="setCmyk('kk', +($event.target as HTMLInputElement).value)" />
        </div>
      </TuField>
    </div>

    <div>
      <TuOutput
        title="各格式色值"
        :text="`HEX  ${hexValue}\nRGB  ${rgbText}\nHSL  ${hslText}\nHSV  ${hsvText}\nCMYK ${cmykText}`"
        filename="color.txt"
        empty="—"
      >
        <div class="tu-grid">
          <div class="tu-card">
            <div class="tu-card-title">HEX</div>
            <div class="tu-card-value tu-mono">{{ hexValue }}</div>
            <button type="button" class="tu-btn ghost" @click="copy(hexValue)">复制</button>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">RGB</div>
            <div class="tu-card-value tu-mono">{{ rgbText }}</div>
            <button type="button" class="tu-btn ghost" @click="copy(rgbText)">复制</button>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">HSL</div>
            <div class="tu-card-value tu-mono">{{ hslText }}</div>
            <button type="button" class="tu-btn ghost" @click="copy(hslText)">复制</button>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">HSV</div>
            <div class="tu-card-value tu-mono">{{ hsvText }}</div>
            <button type="button" class="tu-btn ghost" @click="copy(hsvText)">复制</button>
          </div>
          <div class="tu-card">
            <div class="tu-card-title">CMYK</div>
            <div class="tu-card-value tu-mono">{{ cmykText }}</div>
            <button type="button" class="tu-btn ghost" @click="copy(cmykText)">复制</button>
          </div>
        </div>
      </TuOutput>

      <TuField label="WCAG 对比度检查">
        <div class="tu-row">
          <span class="tu-label">前景</span>
          <input v-model="fg" type="color" class="tu-input tu-inline" style="max-width: 70px" />
          <input v-model="fg" class="tu-input tu-inline" style="max-width: 110px" spellcheck="false" />
          <span class="tu-label">背景</span>
          <input v-model="bg" type="color" class="tu-input tu-inline" style="max-width: 70px" />
          <input v-model="bg" class="tu-input tu-inline" style="max-width: 110px" spellcheck="false" />
        </div>
        <div class="tu-row">
          <button type="button" class="tu-btn ghost" @click="useAsFg">当前色设为前景</button>
          <button type="button" class="tu-btn ghost" @click="useAsBg">当前色设为背景</button>
        </div>
        <div class="tu-preview" :style="{ background: bg, color: fg, padding: '14px', textAlign: 'center' }">
          示例文本 Aa 中文 123
        </div>
        <div class="tu-stat">
          <span>对比度 {{ ratio.toFixed(2) }} : 1</span>
          <span>正文 {{ wcag.text }}</span>
          <span>大字号 {{ wcagLarge.text }}</span>
        </div>
        <p class="tu-hint">WCAG AA 要求正文 ≥ 4.5，大字号 ≥ 3；AAA 要求正文 ≥ 7。</p>
      </TuField>

      <details class="tu-folding">
        <summary>使用说明</summary>
        <div class="tu-folding-body">
          <ol>
            <li>可直接输入 #hex、rgb()、hsl() 或 cmyk() 任意格式并点「解析」。</li>
            <li>拖动 RGB / HSL / HSV 滑块实时换算，各格式结果可一键复制。</li>
            <li>对比度区可校验前景/背景配色是否满足 WCAG 可访问性要求。</li>
          </ol>
        </div>
      </details>
    </div>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); font-size: 12.5px; }
</style>

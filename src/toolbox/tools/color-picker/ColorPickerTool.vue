<script setup lang="ts">
/**
 * 取色与色值转换（HEX / RGB / HSL，纯前端实现）
 */
import { ref } from 'vue'
import { useToast } from '@/composables/useToast'
import { hexToRgb, rgbToHsl } from '../../core/color'

const hex = ref('#3b82f6')
const output = ref('')
const { success, error } = useToast()

/** input[type=color] 的值即 HEX，与输入框双向联动 */
function onPick(e: Event) {
  hex.value = (e.target as HTMLInputElement).value
  convert()
}

function convert() {
  const v = hex.value.trim()
  if (!/^#?[0-9a-fA-F]{6}$/.test(v)) {
    output.value = '请输入 6 位 HEX 色值，如 #3b82f6'
    return
  }
  const s = v.startsWith('#') ? v : '#' + v
  const c = hexToRgb(s)
  const hsl = rgbToHsl(c.r, c.g, c.b)
  output.value = [
    'HEX：' + s.toUpperCase(),
    'RGB：rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')',
    'HSL：hsl(' + Math.round(hsl.h) + ', ' + Math.round(hsl.s) + '%, ' + Math.round(hsl.l) + '%)'
  ].join('\n')
}

async function copy() {
  if (!output.value) { error('暂无可复制内容'); return }
  try {
    await navigator.clipboard.writeText(output.value)
    success('已复制到剪贴板')
  } catch {
    error('复制失败，请手动选择结果复制')
  }
}

convert()
</script>

<template>
  <div>
    <div class="tu-row">
      <span class="tu-label">取色</span>
      <input :value="hex" type="color" class="tu-input tu-inline" style="max-width:90px" @input="onPick" />
      <span class="tu-label">HEX</span>
      <input v-model="hex" class="tu-input tu-inline" style="max-width:180px" placeholder="#3b82f6" />
      <button type="button" class="tu-btn" @click="convert">转换</button>
      <button type="button" class="tu-btn ghost" @click="copy">复制结果</button>
    </div>

    <div class="tu-field">
      <span class="tu-label">色值结果</span>
      <div class="tu-out" data-testid="tool-color-output">{{ output }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { copyText } from '../../core/download'

const expr = ref('')
const result = ref('')
const error = ref('')

const FN: Record<string, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  log: Math.log10, ln: Math.log, sqrt: Math.sqrt, abs: Math.abs,
  exp: Math.exp, floor: Math.floor, ceil: Math.ceil, round: Math.round
}

function safeEval(input: string): { value?: number; error?: string } {
  const s = (input || '').trim()
  if (!s) return { error: '请输入表达式' }
  // 仅允许数字、运算符、括号、空格、函数名与常量
  if (!/^[0-9+\-*/%^().\s a-zA-Z]+$/.test(s)) return { error: '包含非法字符' }
  let code = s
    .replace(/\bpi\b/gi, '(' + Math.PI + ')')
    .replace(/\be\b/gi, '(' + Math.E + ')')
  for (const f of Object.keys(FN)) {
    code = code.replace(new RegExp('\\b' + f + '\\b', 'g'), 'Math.' + f)
  }
  code = code.replace(/\^/g, '**')
  try {
    // eslint-disable-next-line no-new-func
    const v = Function('Math', 'return (' + code + ')') as (m: typeof Math) => number
    const out = v(Math)
    if (typeof out !== 'number' || !isFinite(out)) return { error: '计算结果无效' }
    return { value: out }
  } catch {
    return { error: '表达式语法错误' }
  }
}

function calc() {
  error.value = ''
  const r = safeEval(expr.value)
  if (r.error) { error.value = r.error; result.value = ''; return }
  result.value = String(round(r.value!))
}

function round(n: number): number {
  return Math.round(n * 1e10) / 1e10
}

function append(token: string) {
  expr.value += token
}
function clearAll() { expr.value = ''; result.value = ''; error.value = '' }
function backspace() { expr.value = expr.value.slice(0, -1) }
async function copy() {
  if (!result.value) return
  await copyText(result.value)
}
</script>

<template>
  <div class="tu-t1">
    <div class="tu-field">
      <label class="tu-label">表达式</label>
      <input v-model="expr" class="tu-input tu-mono" placeholder="如 (1+2)*sin(pi/6)" @keyup.enter="calc" />
    </div>
    <div class="tu-row">
      <button class="tu-btn" @click="calc">计算</button>
      <button class="tu-btn ghost" @click="clearAll">清空</button>
      <button class="tu-btn ghost" @click="backspace">退格</button>
      <button class="tu-btn ghost" @click="copy">复制结果</button>
    </div>
    <div v-if="error" class="tu-alert"><span>⚠</span><span>{{ error }}</span></div>
    <div v-else-if="result" class="tu-out">= {{ result }}</div>

    <div class="tu-field">
      <label class="tu-label">快捷输入</label>
      <div class="tu-row">
        <button v-for="t in ['(',')','+','-','*','/','^','%']" :key="t" class="tu-btn ghost" @click="append(t)">{{ t }}</button>
      </div>
      <div class="tu-row">
        <button v-for="f in ['sin','cos','tan','log','ln','sqrt','abs','exp']" :key="f" class="tu-btn ghost" @click="append(f + '()')">{{ f }}</button>
      </div>
      <div class="tu-row">
        <button class="tu-btn ghost" @click="append('pi')">π</button>
        <button class="tu-btn ghost" @click="append('e')">e</button>
      </div>
    </div>
    <p class="tu-hint">支持 + - * / % ^ 与括号；函数 sin cos tan asin acos atan log ln sqrt abs exp 等；常量 pi、e。计算全程在本机完成。</p>
  </div>
</template>

<style scoped>
.tu-mono { font-family: var(--font-family-mono); }
</style>

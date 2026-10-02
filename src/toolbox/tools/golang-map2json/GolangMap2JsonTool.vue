<script setup lang="ts">
/**
 * Go Map / 复合字面量 → JSON 转换器
 * 支持：map[K]V{...}、[]T{...}、嵌套字面量、&Type{...}、字符串(双引号/反引号)、
 *       数字(含 0x/0o/0b/分隔符)、true/false/nil，以及可选 var x = / x := / return 前缀。
 * 纯前端解析，零上传。
 */
import { computed, ref } from 'vue'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

type Json = null | boolean | number | string | Json[] | { [k: string]: Json }

type TypeKind = 'map' | 'slice' | 'other' | null

class GoLiteralParser {
  private s: string
  private i = 0
  constructor(s: string) {
    this.s = s
  }

  private eof(): boolean {
    return this.i >= this.s.length
  }
  private peek(): string {
    return this.s[this.i] ?? ''
  }
  private skipWs() {
    while (this.i < this.s.length && /\s/.test(this.s[this.i])) this.i++
  }

  private isIdentChar(c: string): boolean {
    return /[A-Za-z0-9_.]/.test(c)
  }

  private readIdent(): string {
    let j = this.i
    while (j < this.s.length && this.isIdentChar(this.s[j])) j++
    const id = this.s.slice(this.i, j)
    this.i = j
    return id
  }

  private skipString() {
    const q = this.peek()
    this.i++ // 开引号
    while (this.i < this.s.length) {
      const c = this.s[this.i]
      if (c === '\\' && q === '"') {
        this.i += 2
        continue
      }
      if (c === q) {
        this.i++
        return
      }
      this.i++
    }
    throw new Error(`字符串未闭合（位置 ${this.i}）`)
  }

  private consumeBalanced(open: string, close: string) {
    if (this.peek() !== open) return
    let depth = 0
    while (this.i < this.s.length) {
      const c = this.s[this.i]
      if (c === '"' || c === '`') {
        this.skipString()
        continue
      }
      if (c === open) depth++
      else if (c === close) {
        depth--
        this.i++
        if (depth === 0) return
      } else this.i++
    }
    throw new Error(`括号未闭合（${open}${close}，位置 ${this.i}）`)
  }

  /** 跳过可选的 var x = / x := / return 前缀 */
  private skipOptionalPrefix() {
    this.skipWs()
    if (this.s.startsWith('var', this.i) && !this.isIdentChar(this.s[this.i + 3] ?? '')) {
      this.i += 3
      this.skipWs()
      this.readIdent()
      this.skipWs()
      if (this.peek() === '=') {
        this.i++
        this.skipWs()
      }
      return
    }
    if (this.s.startsWith('return', this.i) && !this.isIdentChar(this.s[this.i + 6] ?? '')) {
      this.i += 6
      this.skipWs()
      return
    }
    let j = this.i
    if (/[A-Za-z_]/.test(this.s[j] ?? '')) {
      while (j < this.s.length && this.isIdentChar(this.s[j])) j++
      if (this.s.startsWith(':=', j)) {
        this.i = j + 2
        this.skipWs()
      }
    }
  }

  /** 消费一个 Go 类型表达式，返回最外层字面量形态：map→对象 / slice→数组 / other→对象(结构体)/ null→未知 */
  private consumeType(): TypeKind {
    this.skipWs()
    if (this.peek() === '&') {
      this.i++
      this.skipWs()
    }
    if (this.s.startsWith('map', this.i) && !this.isIdentChar(this.s[this.i + 3] ?? '')) {
      this.i += 3
      this.skipWs()
      if (this.peek() === '[') this.consumeBalanced('[', ']')
      this.skipWs()
      this.consumeType() // 值类型（形态由最外层 map 决定）
      return 'map'
    }
    if (this.peek() === '[') {
      this.i++
      this.skipWs()
      if (this.peek() === ']') {
        this.i++
        this.skipWs()
        this.consumeType()
        return 'slice'
      }
      this.consumeType() // 数组长度表达式
      if (this.peek() === ']') {
        this.i++
        this.skipWs()
        this.consumeType()
        return 'slice'
      }
      return 'other'
    }
    if (/[A-Za-z_]/.test(this.peek())) {
      const id = this.readIdent()
      if (id === 'true' || id === 'false' || id === 'nil' || id === 'iota') {
        this.i -= id.length // 还原，交由 parseValue 处理
        return null
      }
      this.skipWs()
      if (id === 'interface' || id === 'struct') {
        if (this.peek() === '{') this.consumeBalanced('{', '}')
      }
      return 'other'
    }
    return null
  }

  private parseString(): string {
    const q = this.peek()
    this.i++ // 开引号
    let out = ''
    while (this.i < this.s.length) {
      const c = this.s[this.i]
      if (c === '\\' && q === '"') {
        const n = this.s[this.i + 1]
        switch (n) {
          case 'n': out += '\n'; break
          case 't': out += '\t'; break
          case 'r': out += '\r'; break
          case '"': out += '"'; break
          case '\\': out += '\\'; break
          case '`': out += '`'; break
          case 'a': out += '\x07'; break
          case 'b': out += '\b'; break
          case 'f': out += '\f'; break
          case 'v': out += '\v'; break
          case '0': case '1': case '2': case '3': case '4': case '5': case '6': case '7': {
            let k = this.i + 1
            let val = 0
            while (k < this.i + 4 && /[0-7]/.test(this.s[k])) {
              val = val * 8 + (this.s[k].charCodeAt(0) - 48)
              k++
            }
            out += String.fromCharCode(val)
            this.i = k
            continue
          }
          case 'x': {
            out += String.fromCharCode(parseInt(this.s.slice(this.i + 2, this.i + 4), 16) || 0)
            this.i += 4
            continue
          }
          case 'u': {
            out += String.fromCharCode(parseInt(this.s.slice(this.i + 2, this.i + 6), 16) || 0)
            this.i += 6
            continue
          }
          case 'U': {
            out += String.fromCodePoint(parseInt(this.s.slice(this.i + 2, this.i + 10), 16) || 0)
            this.i += 10
            continue
          }
          default: out += n
        }
        this.i += 2
        continue
      }
      if (c === q) {
        this.i++
        return out
      }
      out += c
      this.i++
    }
    throw new Error(`字符串未闭合（位置 ${this.i}）`)
  }

  private parseNumber(): number {
    let j = this.i
    if (this.s[j] === '-') j++
    if (/0[xX]/.test(this.s.slice(j, j + 2))) {
      let k = j + 2
      while (k < this.s.length && /[0-9a-fA-F]/.test(this.s[k])) k++
      const num = parseInt(this.s.slice(j, k).replace(/_/g, ''), 16)
      this.i = k
      return num
    }
    if (/0[oO]/.test(this.s.slice(j, j + 2))) {
      let k = j + 2
      while (k < this.s.length && /[0-7]/.test(this.s[k])) k++
      const num = parseInt(this.s.slice(j, k).replace(/_/g, ''), 8)
      this.i = k
      return num
    }
    if (/0[bB]/.test(this.s.slice(j, j + 2))) {
      let k = j + 2
      while (k < this.s.length && /[01]/.test(this.s[k])) k++
      const num = parseInt(this.s.slice(j, k).replace(/_/g, ''), 2)
      this.i = k
      return num
    }
    while (j < this.s.length && /[0-9_.]/.test(this.s[j])) j++
    if (this.s[j] === 'e' || this.s[j] === 'E') {
      j++
      if (this.s[j] === '+' || this.s[j] === '-') j++
      while (j < this.s.length && /[0-9_]/.test(this.s[j])) j++
    }
    const raw = this.s.slice(this.i, j).replace(/_/g, '')
    this.i = j
    const num = Number(raw)
    if (isNaN(num)) throw new Error(`无效数字「${raw}」（位置 ${this.i}）`)
    return num
  }

  private parseObject(): { [k: string]: Json } {
    this.i++ // {
    const obj: { [k: string]: Json } = {}
    while (!this.eof()) {
      this.skipWs()
      if (this.peek() === '}') {
        this.i++
        return obj
      }
      let key: string
      const c = this.peek()
      if (c === '"' || c === '`') key = this.parseString()
      else if (/[A-Za-z_]/.test(c)) key = this.readIdent()
      else throw new Error(`对象键应为字符串或标识符（位置 ${this.i}）`)
      this.skipWs()
      if (this.peek() !== ':') throw new Error(`对象键后应为 ":"（位置 ${this.i}）`)
      this.i++ // :
      obj[key] = this.parseValue()
      this.skipWs()
      if (this.peek() === ',') {
        this.i++
        continue
      }
      if (this.peek() === '}') {
        this.i++
        return obj
      }
      throw new Error(`对象元素后应为 "," 或 "}"（位置 ${this.i}）`)
    }
    throw new Error('对象未闭合')
  }

  private parseArray(): Json[] {
    this.i++ // [
    const arr: Json[] = []
    while (!this.eof()) {
      this.skipWs()
      if (this.peek() === ']') {
        this.i++
        return arr
      }
      arr.push(this.parseValue())
      this.skipWs()
      if (this.peek() === ',') {
        this.i++
        continue
      }
      if (this.peek() === ']') {
        this.i++
        return arr
      }
      throw new Error(`数组元素后应为 "," 或 "]"（位置 ${this.i}）`)
    }
    throw new Error('数组未闭合')
  }

  parseValue(): Json {
    this.skipWs()
    const t = this.consumeType()
    this.skipWs()
    const c = this.peek()
    if (c === '{') {
      // map / 结构体字面量 → 对象；slice 字面量 → 数组（元素为值）
      return t === 'slice' ? this.parseArray() : this.parseObject()
    }
    if (c === '[') return this.parseArray()
    if (c === '"' || c === '`') return this.parseString()
    if (c === '-' || /[0-9]/.test(c)) return this.parseNumber()
    if (/[A-Za-z_]/.test(c)) {
      const id = this.readIdent()
      if (id === 'true') return true
      if (id === 'false') return false
      if (id === 'nil' || id === 'iota') return null
      throw new Error(`无法识别的标识符「${id}」：仅支持字面量，不支持变量/常量引用`)
    }
    throw new Error(`位置 ${this.i} 处出现意外字符「${c || 'EOF'}」`)
  }

  parse(): Json {
    this.skipOptionalPrefix()
    const v = this.parseValue()
    this.skipWs()
    // 容忍尾随的分号与空白
    while (!this.eof() && (this.peek() === ';' || this.peek() === ',')) this.i++
    this.skipWs()
    if (!this.eof()) {
      throw new Error(`存在多余内容（位置 ${this.i}）；本工具每次仅转换单个字面量`)
    }
    return v
  }
}

function convert(src: string): string {
  const parser = new GoLiteralParser(src)
  const value = parser.parse()
  return JSON.stringify(value, null, 2)
}

const SAMPLE = `map[string]interface{}{
    "name":   "easy-web-tab",
    "stars":  128,
    "active": true,
    "tags":   []string{"go", "vue", "tool"},
    "owner": map[string]interface{}{
        "id":   1,
        "nick": "sifu",
        "meta": []interface{}{"v1", 2, nil},
    },
}`

const input = ref(SAMPLE)
const output = ref('')
const error = ref('')
const convertCount = ref(0)

useDirtyFlag(() => convertCount.value > 0)
const { copy, save } = useToolActions()

function run() {
  error.value = ''
  if (!input.value.trim()) {
    output.value = ''
    error.value = '请输入 Go 字面量'
    return
  }
  try {
    output.value = convert(input.value)
    convertCount.value++
  } catch (e) {
    output.value = ''
    error.value = e instanceof Error ? e.message : String(e)
  }
}

function loadSample() {
  input.value = SAMPLE
  run()
}

function clearAll() {
  input.value = ''
  output.value = ''
  error.value = ''
}

const hasOutput = computed(() => output.value.length > 0)

run()
</script>

<template>
  <div class="tu-t2 golang-map2json">
    <TuField label="Go 字面量（map / 切片 / 结构体）">
      <div class="gm-toolbar">
        <button type="button" class="tu-btn" @click="run">转换</button>
        <button type="button" class="tu-btn ghost" @click="loadSample">示例</button>
        <button type="button" class="tu-btn ghost" @click="clearAll">清空</button>
      </div>
      <textarea
        v-model="input"
        class="tu-textarea gm-input"
        spellcheck="false"
        placeholder="粘贴 Go map[string]interface{}{...} 等复合字面量"
        @input="run"
      />
    </TuField>

    <TuOutput
      title="JSON 结果"
      :text="output"
      filename="converted.json"
      mime="application/json"
      empty="转换后在此显示"
    >
      <template #actions>
        <button type="button" class="tu-btn ghost" :disabled="!hasOutput" @click="copy(output)">复制 JSON</button>
        <button type="button" class="tu-btn ghost" :disabled="!hasOutput" @click="save('converted.json', output, 'application/json')">下载</button>
      </template>
      <pre v-if="hasOutput" class="gm-json">{{ output }}</pre>
      <p v-else-if="error" class="tu-alert">{{ error }}</p>
      <p v-else class="tu-out-empty">转换后在此显示</p>
    </TuOutput>
  </div>
</template>

<style scoped>
.golang-map2json { align-items: start; }
.gm-toolbar { display: flex; gap: 8px; margin-bottom: 8px; }
.gm-input { min-height: 360px; font-family: var(--font-family-mono); }
.gm-json {
  margin: 0;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--color-text);
  max-height: 420px;
  overflow: auto;
}
.tu-out-empty { margin: 0; font-size: 12.5px; color: var(--color-text-muted); }
</style>

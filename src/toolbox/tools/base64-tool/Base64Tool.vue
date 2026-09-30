<script setup lang="ts">
/**
 * Base64 编解码（文本 / 文件，纯前端实现）
 * 支持 URL-safe 变体、换行折行、DataURL 输出与文件读写。
 */
import { computed, ref } from 'vue'
import {
  decodeBase64,
  encodeBase64,
  fromUrlSafe,
  toUrlSafe,
  wrapText,
  bytesToDataUrl
} from '../../core/base64'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, readFileAsBuffer } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const mode = ref<'encode' | 'decode'>('encode')
const input = ref('你好，easy-web-tab 🚀')
const urlSafe = ref(false)
const wrapWidth = ref(0)
const fileInfo = ref('')
const dataUrl = ref('')

useDirtyFlag(() => !!input.value.trim() || !!dataUrl.value)
const { copy, save } = useToolActions()

const result = computed(() => {
  const src = input.value
  if (!src) return { ok: true, text: '' }
  if (mode.value === 'encode') {
    const r = encodeBase64(src, urlSafe.value)
    return r.ok ? { ok: true, text: wrapText(r.text, wrapWidth.value) } : r
  }
  const r = decodeBase64(fromUrlSafe(src))
  return r.ok ? { ok: true, text: r.text } : r
})

async function onFiles(files: File[]) {
  const file = files[0]
  if (!file) return
  const buf = await readFileAsBuffer(file)
  const bytes = new Uint8Array(buf)
  if (mode.value === 'encode') {
    let bin = ''
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    const b64 = btoa(bin)
    input.value = urlSafe.value ? toUrlSafe(b64) : b64
    fileInfo.value = `${file.name}（${file.size} 字节）已编码`
  } else {
    input.value = new TextDecoder().decode(bytes)
    fileInfo.value = `${file.name}（${file.size} 字节）已读入`
  }
  dataUrl.value = bytesToDataUrl(bytes, file.type || 'application/octet-stream')
}

function swap() {
  mode.value = mode.value === 'encode' ? 'decode' : 'encode'
  if (result.value.ok && result.value.text) input.value = result.value.text
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-toolbar">
        <div class="tu-seg">
          <button type="button" :class="{ 'is-on': mode === 'encode' }" @click="mode = 'encode'">编码</button>
          <button type="button" :class="{ 'is-on': mode === 'decode' }" @click="mode = 'decode'">解码</button>
        </div>
        <button type="button" class="tu-check" :class="{ 'is-on': urlSafe }" @click="urlSafe = !urlSafe">
          URL-safe
        </button>
        <span class="tu-spacer" />
        <button type="button" class="tu-btn ghost" @click="swap">结果写回左侧</button>
      </div>

      <TuField :label="mode === 'encode' ? '待编码文本' : '待解码 Base64'">
        <textarea
          v-model="input"
          class="tu-textarea"
          rows="10"
          spellcheck="false"
          :placeholder="mode === 'encode' ? '输入要编码的文本' : '粘贴 Base64 字符串'"
          data-testid="tb-modal-input"
        />
      </TuField>

      <div class="tu-row">
        <span class="tu-label">折行宽度</span>
        <select v-model.number="wrapWidth" class="tu-select tu-inline" style="max-width: 120px">
          <option :value="0">不折行</option>
          <option :value="64">64</option>
          <option :value="76">76</option>
        </select>
      </div>

      <TuField label="文件（可选）">
        <TuDrop accept="*/*" hint="选择文件：编码模式读入字节，解码模式读入文本" @files="onFiles" />
        <p v-if="fileInfo" class="tu-hint">{{ fileInfo }}</p>
      </TuField>
    </div>

    <div>
      <p v-if="!result.ok" class="tu-alert">{{ result.error }}</p>
      <p v-else class="tu-alert ok">{{ mode === 'encode' ? '编码' : '解码' }}成功 · {{ result.text.length }} 字符</p>

      <TuOutput
        :title="mode === 'encode' ? 'Base64 结果' : '原文结果'"
        :text="result.text"
        :filename="mode === 'encode' ? 'encoded.txt' : 'decoded.txt'"
        empty="输入内容后显示结果"
      >
        <pre class="tu-code">{{ result.text }}</pre>
      </TuOutput>

      <TuOutput v-if="dataUrl" title="Data URL（来自文件）" :text="dataUrl" filename="data-url.txt" empty="—">
        <p class="tu-code break">{{ dataUrl.slice(0, 120) }}…（共 {{ dataUrl.length }} 字符）</p>
      </TuOutput>

      <div class="tu-row">
        <button type="button" class="tu-btn ghost" :disabled="!result.text" @click="copy(result.text)">复制结果</button>
        <button type="button" class="tu-btn ghost" :disabled="!result.text" @click="save('base64.txt', result.text)">
          下载
        </button>
      </div>
    </div>

    <details class="tu-folding tu-span">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>文本按 UTF-8 处理，中文与 emoji 不会乱码。</li>
          <li>开启 URL-safe 会把 <code>+</code>/<code>/</code> 替换为 <code>-</code>/<code>_</code> 并去掉补位等号。</li>
          <li>文件在浏览器本地读取，不做任何上传。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-span { grid-column: 1 / -1; }
.tu-code {
  margin: 0;
  max-height: 260px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  white-space: pre-wrap;
  word-break: break-all;
}
.break { word-break: break-all; }
</style>

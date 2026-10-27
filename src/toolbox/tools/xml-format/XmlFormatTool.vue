<script setup lang="ts">
/**
 * XML 格式化 / 美化 / 校验（纯前端实现）
 * - 按三层级缩进与换行，保留注释 / CDATA / 处理指令 / DOCTYPE
 * - 结构不合法时给出原因，并尽量定位到行 + 列
 */
import { computed, ref } from 'vue'
import { formatXml } from '../../core/xml'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'

type IndentKey = '2' | '4' | 'tab'

const input = ref(
  '<?xml version="1.0" encoding="UTF-8"?>\n<root><item id="1">Hello</item><item id="2">World</item></root>'
)
const indent = ref<IndentKey>('2')

useDirtyFlag(() => !!input.value.trim())
const { copy, save } = useToolActions()

const result = computed(() => formatXml(input.value, { indent: indent.value }))

const stats = computed(() => ({
  chars: input.value.length,
  lines: input.value ? input.value.split('\n').length : 0
}))

function writeBack() {
  if (result.value.ok) input.value = result.value.text
}
</script>

<template>
  <div class="tu-t2">
    <div>
      <div class="tu-toolbar">
        <div class="tu-seg">
          <button type="button" :class="{ 'is-on': indent === '2' }" @click="indent = '2'">2 空格</button>
          <button type="button" :class="{ 'is-on': indent === '4' }" @click="indent = '4'">4 空格</button>
          <button type="button" :class="{ 'is-on': indent === 'tab' }" @click="indent = 'tab'">Tab</button>
        </div>
        <span class="tu-spacer" />
        <button type="button" class="tu-btn ghost" :disabled="!result.ok" @click="writeBack">写回输入框</button>
      </div>

      <TuField label="原始 XML" :extra="`${stats.chars} 字符 / ${stats.lines} 行`">
        <textarea
          v-model="input"
          class="tu-textarea"
          rows="18"
          spellcheck="false"
          placeholder="在此粘贴 XML 内容"
          data-testid="tb-modal-input"
        />
      </TuField>

      <p v-if="!result.ok" class="tu-alert">
        {{ result.error?.message }}
        <template v-if="result.error && result.error.line > 0">
          （第 {{ result.error.line }} 行 第 {{ result.error.column }} 列）
        </template>
      </p>
      <p v-else class="tu-alert ok">XML 合法 · 格式化后 {{ result.text.split('\n').length }} 行</p>
    </div>

    <div>
      <TuOutput
        title="格式化结果"
        :text="result.text"
        filename="data.xml"
        mime="application/xml"
        empty="左侧输入合法 XML 后显示结果"
      >
        <pre class="tu-code">{{ result.text }}</pre>
      </TuOutput>

      <div class="tu-row">
        <button type="button" class="tu-btn ghost" :disabled="!result.text" @click="copy(result.text)">
          复制结果
        </button>
        <button
          type="button"
          class="tu-btn ghost"
          :disabled="!result.text"
          @click="save('data.xml', result.text, 'application/xml')"
        >
          下载 XML
        </button>
      </div>
    </div>

    <details class="tu-folding tu-span">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>粘贴 XML 后自动校验并格式化，右侧实时显示缩进结果。</li>
          <li>结构不合法时会给出原因，并尽量定位到具体行与列。</li>
          <li>保留注释、CDATA、处理指令与 DOCTYPE；自闭合标签保持 &lt;tag /&gt; 形式。</li>
          <li>所有处理均在浏览器本地完成，不上传任何数据。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-span {
  grid-column: 1 / -1;
}
.tu-code {
  margin: 0;
  max-height: 420px;
  overflow: auto;
  font-family: var(--font-family-mono);
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>

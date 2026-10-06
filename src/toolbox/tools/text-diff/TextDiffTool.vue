<script setup lang="ts">
/**
 * 文本差异对比（行级 + 字符级，纯前端实现）
 */
import { computed, ref } from 'vue'
import { diffTexts, type DiffPart } from '../../core/diff'
import { useDirtyFlag } from '../../prefs/useToolDirty'
import { useToolActions, readFileAsText } from '../../composables/useToolActions'
import TuField from '../../components/tool/TuField.vue'
import TuOutput from '../../components/tool/TuOutput.vue'
import TuDrop from '../../components/tool/TuDrop.vue'

const left = ref('第一行内容\n相同的一行\n需要修改的旧文本\n仅在左侧出现\n')
const right = ref('第一行内容\n相同的一行\n需要修改的新文本\n仅在右侧出现\n')
const ignoreWhitespace = ref(false)
const ignoreCase = ref(false)
const ignoreBlankLines = ref(false)
const charLevel = ref(true)
const inlineView = ref(true)

useDirtyFlag(() => !!left.value.trim() || !!right.value.trim())
const { copy } = useToolActions()

const result = computed(() =>
  diffTexts(left.value, right.value, {
    ignoreWhitespace: ignoreWhitespace.value,
    ignoreCase: ignoreCase.value,
    ignoreBlankLines: ignoreBlankLines.value,
    charLevel: charLevel.value
  })
)

const stats = computed(() => result.value.stats)

const patchText = computed(() =>
  result.value.lines
    .map(l => {
      if (l.type === 'same') return `  ${l.right ?? ''}`
      if (l.type === 'add') return `+ ${l.right ?? ''}`
      if (l.type === 'del') return `- ${l.left ?? ''}`
      return `- ${l.left ?? ''}\n+ ${l.right ?? ''}`
    })
    .join('\n')
)

async function onFiles(files: File[]) {
  const list = files.slice(0, 2)
  const [a, b] = await Promise.all(list.map(readFileAsText))
  if (a !== undefined) left.value = a
  if (b !== undefined) right.value = b
}

function swap() {
  const t = left.value
  left.value = right.value
  right.value = t
}

function partsOf(parts?: DiffPart[]) {
  return parts || []
}
</script>

<template>
  <div class="tu-t3">
    <div class="tu-toolbar">
      <button type="button" class="tu-check" :class="{ 'is-on': ignoreWhitespace }" @click="ignoreWhitespace = !ignoreWhitespace">
        忽略行首尾空白
      </button>
      <button type="button" class="tu-check" :class="{ 'is-on': ignoreCase }" @click="ignoreCase = !ignoreCase">
        忽略大小写
      </button>
      <button type="button" class="tu-check" :class="{ 'is-on': ignoreBlankLines }" @click="ignoreBlankLines = !ignoreBlankLines">
        忽略空行
      </button>
      <button type="button" class="tu-check" :class="{ 'is-on': charLevel }" @click="charLevel = !charLevel">
        字符级差异
      </button>
      <button type="button" class="tu-check" :class="{ 'is-on': inlineView }" @click="inlineView = !inlineView">
        合并视图
      </button>
      <span class="tu-spacer" />
      <button type="button" class="tu-btn ghost" @click="swap">交换两侧</button>
    </div>

    <div class="tu-t2">
      <TuField label="原始文本（左）">
        <textarea v-model="left" class="tu-textarea" rows="10" spellcheck="false" data-testid="tb-modal-input" />
      </TuField>
      <TuField label="目标文本（右）">
        <textarea v-model="right" class="tu-textarea" rows="10" spellcheck="false" />
      </TuField>
    </div>

    <TuField label="从文件对比（可一次选两个文件）">
      <TuDrop :multiple="true" accept=".txt,.md,.json,.csv,text/*" hint="选择两个文本文件" @files="onFiles" />
    </TuField>

    <div class="tu-stat">
      <span>相同 {{ stats.same }}</span>
      <span>新增 {{ stats.add }}</span>
      <span>删除 {{ stats.del }}</span>
      <span>修改 {{ stats.modify }}</span>
    </div>

    <TuOutput title="差异结果" :text="patchText" filename="diff.patch" empty="两侧一致，没有差异">
      <div class="tu-diff">
        <template v-if="inlineView">
          <div v-for="(l, i) in result.lines" :key="i" class="tu-diff-row" :class="l.type">
            <span class="tu-diff-sign">
              {{ l.type === 'add' ? '+' : l.type === 'del' ? '-' : l.type === 'modify' ? '~' : ' ' }}
            </span>
            <span v-if="l.type === 'modify' && l.rightParts">
              <span
                v-for="(p, pi) in partsOf(l.rightParts)"
                :key="pi"
                :class="{ 'tu-chr-add': p.type === 'add', 'tu-chr-del': p.type === 'del' }"
              >{{ p.text }}</span>
            </span>
            <span v-else>{{ l.type === 'del' ? l.left : l.right }}</span>
          </div>
        </template>
        <template v-else>
          <div v-for="(l, i) in result.lines" :key="i" class="tu-diff-row" :class="l.type">
            <span class="tu-diff-sign">
              {{ l.type === 'add' ? '+' : l.type === 'del' ? '-' : l.type === 'modify' ? '~' : ' ' }}
            </span>
            <span v-if="l.type === 'modify' && l.leftParts">
              <span
                v-for="(p, pi) in partsOf(l.leftParts)"
                :key="'L' + pi"
                :class="{ 'tu-chr-add': p.type === 'add', 'tu-chr-del': p.type === 'del' }"
              >{{ p.text }}</span>
            </span>
            <span v-else>{{ l.type === 'add' ? l.right : l.left }}</span>
          </div>
        </template>
        <p v-if="!result.lines.length" class="tu-out-empty">两侧内容为空</p>
      </div>
    </TuOutput>

    <div class="tu-row">
      <button type="button" class="tu-btn ghost" :disabled="!patchText" @click="copy(patchText)">复制差异</button>
    </div>

    <details class="tu-folding">
      <summary>使用说明</summary>
      <div class="tu-folding-body">
        <ol>
          <li>默认为合并视图（左右同一行展示），关闭后仅显示单侧内容。</li>
          <li>开启「字符级差异」后，修改行会进一步标出具体变化的字符。</li>
          <li>可一次选择两个文件自动填入左右两侧。</li>
        </ol>
      </div>
    </details>
  </div>
</template>

<style scoped>
.tu-diff-sign {
  display: inline-block;
  width: 14px;
  color: var(--color-text-muted);
  font-family: var(--font-family-mono);
}
.tu-chr-add {
  background: var(--color-success-soft);
  color: var(--color-success);
}
.tu-chr-del {
  background: var(--color-error-soft);
  color: var(--color-error);
  text-decoration: line-through;
}
</style>

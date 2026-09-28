<script setup lang="ts">
/**
 * 文本对比（行级 diff，纯前端实现）
 */
import { ref } from 'vue'
import { diffLines } from '../../core/diff'
import type { DiffRow } from '../../core/diff'

const left = ref('第一行\n第二行\n第三行')
const right = ref('第一行\n第二行改\n第三行\n新增行')
const rows = ref<DiffRow[]>([])
const added = ref(0)
const removed = ref(0)

function compare() {
  const list = diffLines(left.value.split(/\r?\n/), right.value.split(/\r?\n/))
  rows.value = list
  added.value = list.filter(r => r.type === 'add').length
  removed.value = list.filter(r => r.type === 'del').length
}
</script>

<template>
  <div>
    <div class="tu-field">
      <label class="tu-label" for="td-left">文本 A（原始）</label>
      <textarea id="td-left" v-model="left" class="tu-textarea" />
    </div>

    <div class="tu-field">
      <label class="tu-label" for="td-right">文本 B（修改后）</label>
      <textarea id="td-right" v-model="right" class="tu-textarea" />
    </div>

    <div class="tu-row">
      <button type="button" class="tu-btn" @click="compare">对比</button>
      <span v-if="rows.length" class="tu-hint" style="margin:0">新增 {{ added }} 行，删除 {{ removed }} 行</span>
    </div>

    <div v-if="rows.length" class="tu-diff" data-testid="tool-diff-output">
      <div
        v-for="(r, i) in rows"
        :key="i"
        class="tu-diff-row"
        :class="r.type"
      >{{ r.type === 'add' ? '+ ' : r.type === 'del' ? '- ' : '  ' }}{{ r.text }}</div>
    </div>
    <p v-else class="tu-hint">点击「对比」查看两段文本的差异。</p>
  </div>
</template>

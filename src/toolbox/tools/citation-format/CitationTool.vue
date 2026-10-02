<script setup lang="ts">
import { computed, ref } from 'vue'
import { copyText } from '../../core/download'

type CType = 'journal' | 'book' | 'web' | 'thesis'
const type = ref<CType>('journal')
const author = ref('')
const title = ref('')
const source = ref('')
const year = ref('')
const vol = ref('')
const pages = ref('')
const publisher = ref('')
const url = ref('')
const access = ref('')

const today = () => new Date().toISOString().slice(0, 10)

const gbt = computed(() => {
  const a = author.value.trim()
  const t = title.value.trim()
  const y = year.value.trim()
  if (type.value === 'journal') {
    const base = `${a}. ${t}[J]. ${source.value.trim()}`
    return `${base}${y ? ', ' + y : ''}${vol.value.trim() ? ', ' + vol.value.trim() : ''}${pages.value.trim() ? ': ' + pages.value.trim() : ''}.`
  }
  if (type.value === 'book') {
    return `${a}. ${t}[M]. ${publisher.value.trim()}${y ? ', ' + y : ''}.`
  }
  if (type.value === 'thesis') {
    return `${a}. ${t}[D]. ${publisher.value.trim()}${y ? ', ' + y : ''}.`
  }
  const up = source.value.trim()
  return `${a}. ${t}[EB/OL]. ${up ? '(' + up + ') ' : ''}[${access.value.trim() || today()}]. ${url.value.trim()}`
})

const apa = computed(() => {
  const a = author.value.trim()
  const t = title.value.trim()
  const y = year.value.trim()
  if (type.value === 'journal') {
    return `${a} (${y || 'n.d.'}). ${t}. ${source.value.trim()}${vol.value.trim() ? ', ' + vol.value.trim() : ''}${pages.value.trim() ? ', ' + pages.value.trim() : ''}.`
  }
  if (type.value === 'web') {
    return `${a} (${y || 'n.d.'}). ${t}. Retrieved from ${url.value.trim()}`
  }
  return `${a} (${y || 'n.d.'}). ${t}. ${publisher.value.trim()}.`
})

const mla = computed(() => {
  const a = author.value.trim()
  const t = title.value.trim()
  const y = year.value.trim()
  if (type.value === 'journal') {
    return `${a}. "${t}." ${source.value.trim()} ${vol.value.trim()}${y ? ' (' + y + ')' : ''}${pages.value.trim() ? ': ' + pages.value.trim() : '' + '.'}`
  }
  if (type.value === 'web') {
    return `${a}. "${t}." ${source.value.trim()}, ${y || 'n.d.'}, ${url.value.trim()}.`
  }
  return `${a}. ${t}. ${publisher.value.trim()}, ${y || 'n.d.'}.`
})

async function copy(s: string) { await copyText(s) }
</script>

<template>
  <div class="tu-t4">
    <div class="tu-t1">
      <div class="tu-field"><label class="tu-label">文献类型</label>
        <select v-model="type" class="tu-select">
          <option value="journal">期刊论文 [J]</option>
          <option value="book">图书 [M]</option>
          <option value="thesis">学位论文 [D]</option>
          <option value="web">网页 [EB/OL]</option>
        </select>
      </div>
      <div class="tu-field"><label class="tu-label">作者 / 责任者</label><input v-model="author" class="tu-input" placeholder="如 张三" /></div>
      <div class="tu-field"><label class="tu-label">题名</label><input v-model="title" class="tu-input" placeholder="文献标题" /></div>
      <div class="tu-field"><label class="tu-label">来源 / 刊名 / 网站名</label><input v-model="source" class="tu-input" /></div>
      <div class="tu-row">
        <div class="tu-field" style="flex:1"><label class="tu-label">年份</label><input v-model="year" class="tu-input" placeholder="2026" /></div>
        <div class="tu-field" style="flex:1"><label class="tu-label">卷(期)</label><input v-model="vol" class="tu-input" placeholder="12(3)" /></div>
        <div class="tu-field" style="flex:1"><label class="tu-label">页码</label><input v-model="pages" class="tu-input" placeholder="10-20" /></div>
      </div>
      <div class="tu-row" v-if="type !== 'web'">
        <div class="tu-field" style="flex:1"><label class="tu-label">出版社 / 学校</label><input v-model="publisher" class="tu-input" /></div>
      </div>
      <div class="tu-row" v-if="type === 'web'">
        <div class="tu-field" style="flex:1"><label class="tu-label">URL</label><input v-model="url" class="tu-input" /></div>
        <div class="tu-field" style="flex:1"><label class="tu-label">引用日期</label><input v-model="access" class="tu-input" :placeholder="today()" /></div>
      </div>
    </div>
    <div class="tu-t1">
      <div class="tu-card"><div class="tu-card-title">GB/T 7714</div><div class="tu-card-value" style="font-size:13px;font-weight:400">{{ gbt || '—' }}</div><button class="tu-btn ghost" style="margin-top:6px" @click="copy(gbt)">复制</button></div>
      <div class="tu-card"><div class="tu-card-title">APA</div><div class="tu-card-value" style="font-size:13px;font-weight:400">{{ apa || '—' }}</div><button class="tu-btn ghost" style="margin-top:6px" @click="copy(apa)">复制</button></div>
      <div class="tu-card"><div class="tu-card-title">MLA</div><div class="tu-card-value" style="font-size:13px;font-weight:400">{{ mla || '—' }}</div><button class="tu-btn ghost" style="margin-top:6px" @click="copy(mla)">复制</button></div>
      <p class="tu-hint">按规范生成示例，复杂文献请人工校对。全程在本地完成。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Emoji 快速查询：分组浏览 + 关键字搜索 + 点击复制 + 最近使用
 */
import { computed, onMounted, ref } from 'vue'
import {
  EMOJI_GROUPS,
  EMOJI_TOTAL,
  normalizeRecent,
  recordRecentEmoji,
  RECENT_LIMIT,
  searchEmoji,
  type EmojiItem,
  type RecentEmoji
} from './emojiData'
import { loadToolData, saveToolData } from '../../core/toolStore'
import { useToast } from '@/composables/useToast'

const TOOL_ID = 'emoji-finder'
const toast = useToast()

const q = ref('')
const activeGroup = ref(EMOJI_GROUPS[0].id)
const recent = ref<RecentEmoji[]>([])

const searching = computed(() => q.value.trim() !== '')
const results = computed(() => (searching.value ? searchEmoji(q.value, 120) : []))
const current = computed(() => EMOJI_GROUPS.find((g) => g.id === activeGroup.value) ?? EMOJI_GROUPS[0])
const recentItems = computed<EmojiItem[]>(() =>
  recent.value
    .map((r) => {
      for (const g of EMOJI_GROUPS) {
        const hit = g.items.find((i) => i.char === r.char)
        if (hit) return hit
      }
      return { char: r.char, name: '最近使用', keywords: '' }
    })
    .slice(0, RECENT_LIMIT)
)

async function persist() {
  await saveToolData(TOOL_ID, recent.value)
}

async function pick(it: EmojiItem) {
  try {
    await navigator.clipboard.writeText(it.char)
    toast.success(`已复制 ${it.char}`)
  } catch {
    toast.error('复制失败，请手动复制')
  }
  recent.value = recordRecentEmoji(recent.value, it.char)
  await persist()
}

async function clearRecent() {
  recent.value = []
  await persist()
}

onMounted(async () => {
  recent.value = normalizeRecent(await loadToolData(TOOL_ID, []))
})
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <input
        v-model="q"
        type="text"
        class="tu-input"
        placeholder="搜索 Emoji（如：开心 / star / 哭）"
        data-testid="tb-emoji-search"
      />
      <span class="tu-hint ef-count">内置 {{ EMOJI_TOTAL }} 个</span>
    </div>

    <div v-if="recentItems.length && !searching" class="ef-recent">
      <span class="ef-recent-label">最近使用</span>
      <button v-for="it in recentItems" :key="'r' + it.char" type="button" class="ef-item" :title="it.name" @click="pick(it)">{{ it.char }}</button>
      <button type="button" class="tu-btn ghost ef-clear" @click="clearRecent">清空</button>
    </div>

    <template v-if="searching">
      <div class="ef-grid">
        <button v-for="it in results" :key="it.char" type="button" class="ef-item" :title="it.name" @click="pick(it)">{{ it.char }}</button>
      </div>
      <p v-if="!results.length" class="tu-hint">没有匹配的 Emoji，试试中文或英文关键词。</p>
    </template>

    <template v-else>
      <div class="tu-seg ef-segs">
        <button
          v-for="g in EMOJI_GROUPS"
          :key="g.id"
          type="button"
          :class="{ 'is-on': activeGroup === g.id }"
          @click="activeGroup = g.id"
        >{{ g.icon }} {{ g.name }}</button>
      </div>
      <div class="ef-grid">
        <button v-for="it in current.items" :key="it.char" type="button" class="ef-item" :title="it.name" @click="pick(it)">{{ it.char }}</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ef-count { margin-bottom: 0; margin-left: auto; }
.ef-segs { flex-wrap: wrap; margin-bottom: 12px; }
.ef-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 4px; }
.ef-item {
  aspect-ratio: 1;
  font-size: var(--fs-h2);
  line-height: 1;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  cursor: pointer;
  padding: 0;
}
.ef-item:hover { background: var(--color-bg-hover); border-color: var(--color-border); }
.ef-recent { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; margin-bottom: 12px; }
.ef-recent-label { font-size: var(--fs-caption); color: var(--color-text-muted); margin-right: 6px; }
.ef-recent .ef-item { font-size: var(--fs-title); }
.ef-clear { min-height: 24px; padding: 2px 8px; font-size: 11.5px; }
</style>

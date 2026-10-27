<script setup lang="ts">
/**
 * 智能工作台 · 技能详情弹框（只读）
 * 展示顺序 = 技能包结构：frontmatter 元数据 → 正文 → 附属资源树。
 * 正文经 noteMarkdown 渲染（html:false，不会注入脚本）。
 */
import { computed, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { renderMarkdown } from '@/composables/noteMarkdown'
import { copyText } from '@/utils/download'
import { useToast } from '@/composables/useToast'
import { useSmartStore } from '@/stores/smart'
import { SKILL_FILE } from '@/composables/skillPackageCore'
import type { SmartSkill, SmartSkillResource } from '@/types'

const props = defineProps<{ item: SmartSkill }>()
const emit = defineEmits<{ close: []; download: [] }>()

const store = useSmartStore()
const toast = useToast()

/**
 * 复制正文。
 * 成功即记一次使用（touchSkill）：与编辑器里「复制全文」同一口径，
 * 否则技能页的「按使用排序」永远是 0，该排序项形同虚设。
 */
async function copyBody(): Promise<void> {
  const body = props.item.body ?? ''
  if (!body.trim()) {
    toast.warning('正文为空，暂无可复制内容')
    return
  }
  const ok = await copyText(body, '已复制技能正文')
  if (ok) store.touchSkill(props.item.id)
}

/** frontmatter 行：只展示有值的，顺序与 skill.md 一致 */
const frontmatter = computed<{ key: string; value: string }[]>(() => {
  const s = props.item
  const rows: { key: string; value: string }[] = [
    { key: 'name', value: s.name },
    { key: 'description', value: s.description },
    { key: 'version', value: s.version },
    { key: 'author', value: s.author },
    { key: 'category', value: s.category },
    { key: 'tags', value: s.tags.join('、') },
    { key: 'when_to_use', value: s.whenToUse },
    { key: 'tools', value: s.tools.join('、') },
    { key: 'license', value: s.license },
    { key: 'github', value: s.github ?? '' }
  ]
  return rows.filter(r => !!String(r.value ?? '').trim())
})

const extraEntries = computed<{ key: string; value: string }[]>(() => {
  const extra = props.item.extra ?? {}
  return Object.entries(extra)
    .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== '')
    .map(([k, v]) => ({ key: k, value: String(v) }))
})

const html = computed(() => renderMarkdown(props.item.body ?? ''))

/** 资源按目录归拢，展示成树：先目录后文件，同层按名称排序 */
const resourceTree = computed<{ dirs: string[]; files: SmartSkillResource[] }>(() => {
  const dirs = new Set<string>()
  for (const r of props.item.resources ?? []) {
    const i = r.path.lastIndexOf('/')
    if (i > 0) dirs.add(r.path.slice(0, i))
  }
  return {
    dirs: [...dirs].sort((a, b) => a.localeCompare(b)),
    files: [...(props.item.resources ?? [])].sort((a, b) => a.path.localeCompare(b.path))
  }
})

function formatSize(n: number): string {
  const size = Number(n) || 0
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

/** 当前展开预览的资源路径（null = 不展开） */
const expanded = ref<string | null>(null)
function togglePreview(path: string): void {
  expanded.value = expanded.value === path ? null : path
}
const previewText = computed(() => {
  const p = expanded.value
  if (!p) return ''
  const hit = (props.item.resources ?? []).find(r => r.path === p)
  if (!hit) return ''
  return hit.encoding === 'text' ? hit.data : '（二进制文件，不提供预览；下载 zip 后可查看原文件）'
})
</script>

<template>
  <BaseDialog :title="props.item.name" width="820px" @close="emit('close')">
    <div class="skd-body">
      <section class="skd-sec">
        <h4 class="skd-title">{{ SKILL_FILE }} · frontmatter</h4>
        <dl class="skd-fm">
          <template v-for="row in frontmatter" :key="row.key">
            <dt class="skd-fm-key">{{ row.key }}</dt>
            <dd class="skd-fm-val">{{ row.value }}</dd>
          </template>
          <template v-for="row in extraEntries" :key="`x-${row.key}`">
            <dt class="skd-fm-key">{{ row.key }}<span class="skd-fm-extra">自定义</span></dt>
            <dd class="skd-fm-val">{{ row.value }}</dd>
          </template>
        </dl>
      </section>

      <section class="skd-sec">
        <h4 class="skd-title">正文</h4>
        <div class="skd-content" v-html="html" />
      </section>

      <section v-if="resourceTree.files.length" class="skd-sec">
        <h4 class="skd-title">附属资源（{{ resourceTree.files.length }}）</h4>
        <ul class="skd-res">
          <li v-for="r in resourceTree.files" :key="r.path" class="skd-res-item">
            <button type="button" class="skd-res-path" @click="togglePreview(r.path)">{{ r.path }}</button>
            <span class="skd-res-size">{{ formatSize(r.size) }}</span>
          </li>
        </ul>
        <pre v-if="previewText" class="skd-preview">{{ previewText }}</pre>
      </section>
      <p v-else class="skd-res-empty">该技能只有 {{ SKILL_FILE }}，没有附属资源。</p>
    </div>

    <template #footer>
      <el-button size="small" data-testid="skill-detail-copy-body" @click="copyBody">复制正文</el-button>
      <el-button size="small" type="primary" @click="emit('download')">下载 zip</el-button>
      <el-button size="small" @click="emit('close')">关闭</el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
/* 高度与滚动交给 BaseDialog 的 .bd-body（统一 padding + overflow-y:auto），这里只管内容排布 */
.skd-body { display: flex; flex-direction: column; gap: 14px; }
.skd-sec { display: flex; flex-direction: column; gap: 8px; }
.skd-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #111827);
  border-left: 3px solid var(--color-primary, #3b82f6);
  padding-left: 8px;
}

.skd-fm { margin: 0; display: grid; grid-template-columns: 140px 1fr; gap: 4px 10px; font-size: 13px; }
.skd-fm-key { color: var(--color-text-muted, #9ca3af); font-family: ui-monospace, monospace; }
.skd-fm-extra { margin-left: 6px; font-size: 11px; font-family: inherit; color: var(--color-text-muted, #9ca3af); }
.skd-fm-val { margin: 0; color: var(--color-text, #111827); overflow-wrap: anywhere; }

.skd-content {
  padding: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: var(--radius-md, 8px);
  background: var(--color-bg-card, #fff);
  font-size: 13px;
  line-height: 1.7;
  color: var(--color-text, #111827);
  overflow-wrap: anywhere;
}
.skd-content :deep(p) { margin: 0 0 8px; }
.skd-content :deep(p:last-child) { margin-bottom: 0; }
.skd-content :deep(pre) {
  padding: 10px;
  border-radius: 6px;
  background: var(--color-bg-hover, #f3f4f6);
  overflow-x: auto;
}
.skd-content :deep(code) { padding: 1px 5px; border-radius: 4px; background: var(--color-bg-hover, #f3f4f6); font-size: 12px; }
.skd-content :deep(ul), .skd-content :deep(ol) { margin: 0 0 8px; padding-left: 20px; }

.skd-res { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.skd-res-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
}
.skd-res-path {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--color-primary, #3b82f6);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skd-res-size { flex: 0 0 auto; font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.skd-preview {
  margin: 0;
  padding: 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 6px;
  background: var(--color-bg-hover, #f3f4f6);
  font-size: 12px;
  line-height: 1.6;
  max-height: 220px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.skd-res-empty { margin: 0; font-size: 12px; color: var(--color-text-muted, #9ca3af); }
</style>

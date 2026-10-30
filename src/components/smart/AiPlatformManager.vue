<script setup lang="ts">
/**
 * 智能工作台 · 智能网页端页
 * ------------------------------------------------------------------
 * 只做「入口门户」：卡片管理各家国内 AI 网页端的**网页链接**，点击在独立窗口打开。
 * 不内嵌 iframe、不反代、不碰登录态（对方站点禁止被嵌入，登录由浏览器各自保持），
 * 也不保存任何密码/密钥 —— 只记录名称、链接、分组、账号标识与备注。
 */
import { computed, onDeactivated, ref } from 'vue'
import Icon from '@/components/Icon.vue'
import AiPlatformCard from '@/components/smart/AiPlatformCard.vue'
import AiPlatformEditorDialog from '@/components/smart/AiPlatformEditorDialog.vue'
import {
  PLATFORM_UNGROUPED,
  groupPlatforms,
  sortPlatforms,
  validatePlatformUrl,
  type PlatformSort
} from '@/composables/aiPlatformsCore'
import { openAiPlatform, openAiPlatformInTab } from '@/composables/useAiPlatformWindow'
import { useSmartStore } from '@/stores/smart'
import { useToast } from '@/composables/useToast'
import { copyText } from '@/utils/download'
import { showConfirm } from '@/utils/dialog'
import type { AiPlatform } from '@/types'

const store = useSmartStore()
const toast = useToast()

const keyword = ref('')
const group = ref('')
const sort = ref<PlatformSort>('manual')
const favoriteOnly = ref(false)
const pinnedOnly = ref(false)

const editorOpen = ref(false)
const editingId = ref<string | null>(null)

/** 编辑中的网页对象（null = 新增） */
const editingPlatform = computed<AiPlatform | null>(
  () => (editingId.value ? store.platforms.find(p => p.id === editingId.value) ?? null : null)
)

/** 分组药丸：全部 + 各组（含未分组） */
const groupTabs = computed(() => {
  const list = store.platforms
  const groups = groupPlatforms(list, [])
  return [
    { id: '', name: '全部', count: list.length },
    ...groups.map(g => ({
      id: g.group === PLATFORM_UNGROUPED ? '__ungrouped__' : g.group,
      name: g.group,
      count: g.count
    }))
  ]
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const list = store.platforms.filter(p => {
    if (favoriteOnly.value && !p.isFavorite) return false
    if (pinnedOnly.value && !p.pinned) return false
    if (group.value === '__ungrouped__') {
      if (p.group !== PLATFORM_UNGROUPED) return false
    } else if (group.value && p.group !== group.value) {
      return false
    }
    if (!kw) return true
    return [p.name, p.accountLabel, p.plan, p.note, p.group].join('\n').toLowerCase().includes(kw)
  })
  return sortPlatforms(list, sort.value)
})

/** 分组分区：仅在「全部 + 手动排序」时按组显示小标题，其余情况是一个平铺网格 */
const sections = computed(() => {
  const list = filtered.value
  if (group.value || sort.value !== 'manual') {
    return list.length ? [{ group: '', items: list, count: list.length }] : []
  }
  return groupPlatforms(list, [])
})

const showSectionTitle = computed(() => sections.value.length > 1)

// ---------- 打开 ----------

function onOpen(p: AiPlatform, e?: MouseEvent): void {
  if (!p.url) {
    toast.warning('该网页的链接无效，请先编辑修正')
    return
  }
  const check = validatePlatformUrl(p.url)
  if (!check.ok) {
    toast.error(`链接不可用：${check.error}`)
    return
  }

  // Ctrl/⌘/Shift + 点击：普通新标签（不复用独立窗口，符合用户预期）
  if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) {
    if (openAiPlatformInTab(check.url)) store.reportPlatformOpened(p.id)
    return
  }

  // ⚠ 这里不得 await：必须留在用户手势的同步调用栈里，否则会被弹窗拦截
  const r = openAiPlatform(check.url, `ai-${p.id}`)
  if (!r.ok) {
    toast.warning('浏览器拦截了新窗口，请允许弹窗后重试')
    return
  }
  store.reportPlatformOpened(p.id)
}

async function onCopy(p: AiPlatform): Promise<void> {
  if (!p.url) {
    toast.warning('该网页还没有有效链接')
    return
  }
  await copyText(p.url, `已复制「${p.name}」的链接`)
}

// ---------- 增删改 ----------

function openCreate(): void {
  editingId.value = null
  editorOpen.value = true
}

function openEdit(p: AiPlatform): void {
  editingId.value = p.id
  editorOpen.value = true
}

function closeEditor(): void {
  editorOpen.value = false
  editingId.value = null
}

function onSave(payload: Partial<AiPlatform>): void {
  if (editingId.value) {
    const ok = store.updatePlatform(editingId.value, payload)
    if (ok) toast.success('网页已更新')
    else toast.error('保存失败：网页不存在')
  } else {
    const id = store.addPlatform(payload)
    if (id) toast.success('网页已添加')
    else toast.error('保存失败：请检查名称')
  }
  closeEditor()
}

async function onRemove(p: AiPlatform): Promise<void> {
  const ok = await showConfirm(`确定删除「${p.name}」这个入口吗？（不影响该网页自身的账号与对话记录）`, '删除网页')
  if (!ok) return
  if (store.deletePlatform(p.id)) toast.success('已删除')
}

function onTogglePin(p: AiPlatform): void {
  store.togglePlatformPinned(p.id)
}

function onToggleFavorite(p: AiPlatform): void {
  store.togglePlatformFavorite(p.id)
}

function restoreDefaults(): void {
  const added = store.restoreDefaultPlatforms()
  if (added > 0) toast.success(`已恢复 ${added} 个预置网页`)
  else toast.info('预置网页都在，无需恢复')
}

/** KeepAlive 缓存：切走时关闭弹框，避免切回来"自己弹回来"；搜索词/分组/排序保留 */
onDeactivated(() => {
  editorOpen.value = false
  editingId.value = null
})
</script>

<template>
  <div class="ap-wrap">
    <!-- 搜索（复用全局 .ui-search 外壳：描边与焦点环在外壳上） -->
    <div class="ap-search-wrap">
      <div class="ui-search ap-search" role="search">
        <Icon name="search" :size="16" class="ap-search-icon" />
        <input
          v-model="keyword"
          class="ui-search-input"
          type="text"
          placeholder="搜索网页名称、账号、套餐或备注…"
          aria-label="搜索网页"
          autocomplete="off"
          data-testid="ai-platform-search"
        />
        <button v-if="keyword" type="button" class="ap-search-clear" title="清空搜索" aria-label="清空搜索" @click="keyword = ''">✕</button>
      </div>
    </div>

    <!-- 分组药丸 -->
    <div class="ap-groups" role="group" aria-label="网页分组筛选">
      <button
        v-for="t in groupTabs"
        :key="t.id || '__all__'"
        type="button"
        class="ap-pill"
        :class="{ 'is-on': group === t.id }"
        :aria-pressed="group === t.id"
        :data-testid="`ai-platform-group-${t.id || 'all'}`"
        @click="group = t.id"
      >
        <span>{{ t.name }}</span>
        <span class="ap-pill-cnt">{{ t.count }}</span>
      </button>
    </div>

    <!-- 工具栏 -->
    <div class="ap-toolbar">
      <div class="ap-toolbar-left">
        <el-select v-model="sort" size="small" class="ap-sort" aria-label="排序方式" data-testid="ai-platform-sort">
          <el-option value="manual" label="手动顺序" />
          <el-option value="recent" label="最近打开" />
          <el-option value="usage" label="使用次数" />
          <el-option value="name" label="名称" />
        </el-select>
        <button type="button" class="ap-toggle" :class="{ 'is-on': pinnedOnly }" :aria-pressed="pinnedOnly" @click="pinnedOnly = !pinnedOnly">
          只看置顶
        </button>
        <button type="button" class="ap-toggle" :class="{ 'is-on': favoriteOnly }" :aria-pressed="favoriteOnly" @click="favoriteOnly = !favoriteOnly">
          只看收藏
        </button>
        <span class="ap-count">共 {{ filtered.length }} 个</span>
      </div>

      <div class="ap-toolbar-right">
        <button type="button" class="ui-btn ui-btn--sm" title="补回被删掉的预置网页" @click="restoreDefaults">恢复预置</button>
        <button type="button" class="ui-btn ui-btn--primary" data-testid="ai-platform-add" @click="openCreate">
          <Icon name="plus" :size="14" />
          新增网页
        </button>
      </div>
    </div>

    <!-- 卡片网格 -->
    <div v-if="sections.length" class="ap-sections">
      <section v-for="sec in sections" :key="sec.group || '__all__'" class="ap-section">
        <h3 v-if="showSectionTitle" class="ap-section-title">
          {{ sec.group || '全部' }}
          <span class="ap-section-cnt">{{ sec.count }}</span>
        </h3>
        <div class="ap-list">
          <AiPlatformCard
            v-for="p in sec.items"
            :key="p.id"
            :platform="p"
            @open="onOpen(p, $event)"
            @edit="openEdit(p)"
            @remove="onRemove(p)"
            @toggle-pin="onTogglePin(p)"
            @toggle-favorite="onToggleFavorite(p)"
            @copy-link="onCopy(p)"
          />
        </div>
      </section>
    </div>

    <!-- 空态 -->
    <div v-else class="ap-empty" data-testid="ai-platform-empty">
      <Icon name="link" :size="28" />
      <p v-if="keyword || group || favoriteOnly || pinnedOnly">没有匹配的网页，试试清空搜索或筛选条件。</p>
      <template v-else>
        <p>还没有任何网页，先加一个常用的吧。</p>
        <div class="ap-empty-actions">
          <button type="button" class="ui-btn ui-btn--primary" @click="openCreate">新增网页</button>
          <button type="button" class="ui-btn" @click="restoreDefaults">恢复预置网页</button>
        </div>
      </template>
    </div>

    <AiPlatformEditorDialog
      v-if="editorOpen"
      :platform="editingPlatform"
      :existing="store.platforms"
      :groups="groupTabs.map(t => t.name).filter(n => n !== '全部' && n !== PLATFORM_UNGROUPED)"
      @close="closeEditor"
      @save="onSave"
    />
  </div>
</template>

<style scoped>
.ap-wrap {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

/* ---------- 搜索 ---------- */
.ap-search-wrap {
  display: flex;
  justify-content: center;
}
.ap-search {
  width: min(560px, 100%);
}
.ap-search-icon {
  flex: none;
  color: var(--color-text-muted);
}
.ap-search-clear {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: var(--radius-full);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 12px;
  cursor: pointer;
}
.ap-search-clear:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

/* ---------- 分组药丸 ---------- */
.ap-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.ap-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition:
    border-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    background-color var(--motion-duration, 220ms) var(--motion-ease, ease),
    color var(--motion-duration, 220ms) var(--motion-ease, ease);
}
.ap-pill:hover {
  border-color: var(--color-primary);
  color: var(--color-primary);
}
.ap-pill.is-on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.ap-pill-cnt {
  font-size: 12px;
  opacity: 0.75;
}

/* ---------- 工具栏 ---------- */
.ap-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ap-toolbar-left,
.ap-toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ap-sort {
  width: 116px;
}
.ap-toggle {
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  font-size: 12px;
  cursor: pointer;
}
.ap-toggle.is-on {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary);
}
.ap-count {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* ---------- 网格 ---------- */
.ap-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ap-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 6px;
}
.ap-section-cnt {
  font-weight: 400;
  color: var(--color-text-muted);
}
.ap-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

/* ---------- 空态 ---------- */
.ap-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 16px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-lg);
  color: var(--color-text-muted);
  text-align: center;
}
.ap-empty p {
  margin: 0;
  font-size: 13px;
}
.ap-empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

@media (max-width: 768px) {
  .ap-list {
    grid-template-columns: 1fr;
  }
  .ap-toolbar {
    align-items: flex-start;
  }
}
</style>

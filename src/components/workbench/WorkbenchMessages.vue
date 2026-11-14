<script setup lang="ts">
/**
 * 个人工作台 · 留言板
 *
 * 给自己留言：一行标题（可选）+ 一段正文 + 卡片色调，卡片式浏览、可置顶 / 编辑 / 删除。
 * 数据层走 workbenchMessages store（IDB store 'messages'，墓碑删除，随云同步跨设备）。
 * 视觉：卡面复用全局 .ui-card；按钮 / 弹框 / 输入框分别复用 .ui-btn 体系、BaseDialog、el-input，
 * 本组件只写布局与色调派生，不另造一套控件皮肤。
 * 卡片列表统一等高（--mb-card-h）：超长正文按行截断，完整内容仍在详情弹框里，网格不会高矮不齐。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import { DIALOG_BTN } from '@/config/dialogText'
import { showConfirm } from '@/utils/dialog'
import { useToast } from '@/composables/useToast'
import {
  MESSAGE_COLOR_OPTIONS,
  MESSAGE_PRESET_HEX,
  MESSAGE_RANDOM_COLORS,
  isCustomMessageColor,
  randomMessageColor,
  toPickerColor,
  normalizeMessageColor
} from '@/composables/messageBoardCore'
import { useWorkbenchMessagesStore } from '@/stores/workbenchMessages'
import type { MessageBoardMessage, MessageColor } from '@/types'

const store = useWorkbenchMessagesStore()
const toast = useToast()

const keyword = ref('')
const visibleMessages = computed<MessageBoardMessage[]>(() => store.searchMessages(keyword.value))
const hasFilter = computed(() => keyword.value.trim().length > 0)
const countText = computed(() =>
  hasFilter.value
    ? `筛选出 ${visibleMessages.value.length} / ${store.activeMessages.length} 条留言`
    : `共 ${store.activeMessages.length} 条留言`
)

/** 时间格式化：ISO → 本地 'YYYY-MM-DD HH:mm'（不用 toISOString，那是 UTC） */
function formatTime(ts: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** 弹幕前缀：本地年月日 'YYYY-MM-DD' */
function formatDate(ts: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** 色调 class：语义键走 token 派生，自定义 hex 走 CSS 变量 */
function toneClass(color: MessageColor): string {
  return isCustomMessageColor(color) ? 'tone-custom' : `tone-${color}`
}
/** 自定义色以 CSS 变量注入，卡片与弹幕胶囊共用同一份派生规则 */
function colorStyle(color: MessageColor): Record<string, string> {
  return isCustomMessageColor(color) ? { '--mb-custom': color } : {}
}
function colorLabel(color: MessageColor): string {
  if (isCustomMessageColor(color)) return color.toUpperCase()
  return MESSAGE_COLOR_OPTIONS.find((o) => o.value === color)?.label ?? '素色'
}

// ===== 标题弹幕（卡片列表上方的独立多行展示区）=====
// 设计取舍：不用 CSS keyframes 的 -50% 循环。animation-duration 依赖内容宽度，
// 窗口 resize / 留言增减时重算 duration 会让动画按新周期换算进度 → 肉眼可见的跳变。
// 这里用 rAF 按固定像素速度平移 + 每条轨道两份相同内容组取模回绕：速度恒定、宽度变化不重置位置、
// 暂停只是停止累加（天然「从当前位置恢复」），且每帧只写 transform（合成层，不触发重排）。
// 弹幕感来自「多条轨道 + 标题分配 + 相位错开」：每行仍是同一速度匀速左移，不会忽快忽慢。
// 去重要求：全部标题按名称唯一化后**分配**到各轨道，一条留言只属于一条轨道、只渲染一次；
// 组内不再靠「重复标题」撑满宽度，改用组尾 spacer 补足视口，保证任意时刻同一名称最多出现一次。
const MARQUEE_SPEED = 34 // px/s：缓慢可读，不抢卡片区的视觉权重
const MARQUEE_LANES = 5 // 弹幕轨道上限，配合 +200px 的高度
/** 固定伪随机起始相位：等差的 i/5 会让 5 行排成规律斜线，不像弹幕 */
const MARQUEE_LANE_PHASES = [0, 0.37, 0.71, 0.18, 0.86] as const

const viewportRef = ref<HTMLElement | null>(null)
const hoveringItem = ref(false)
/** 每条轨道组尾的空白宽度（px）：只用来撑满视口，不重复任何标题 */
const laneSpacers = ref<number[]>([])

/** 标题为空时退化为正文首行摘要，避免滚动区出现空白项 */
function marqueeTitle(m: MessageBoardMessage): string {
  const title = (m.title ?? '').trim()
  if (title) return title
  const firstLine = (m.content ?? '').split('\n')[0].replace(/\s+/g, ' ').trim()
  if (!firstLine) return '未命名留言'
  return firstLine.length > 24 ? `${firstLine.slice(0, 24)}…` : firstLine
}

/**
 * 有效留言（与卡片同序：置顶优先），按展示名称去重：同名留言只在弹幕里出现一次，
 * 卡片列表仍保留全部记录。不随搜索框筛选变化。
 */
const marqueeItems = computed<MessageBoardMessage[]>(() => {
  const seen = new Set<string>()
  return store.sortedMessages.filter(m => {
    const label = marqueeTitle(m)
    if (seen.has(label)) return false
    seen.add(label)
    return true
  })
})
const hasMarquee = computed(() => marqueeItems.value.length > 0)

/** 把该轨道的总空白均分到每条标题后面，避免所有标题挤在组首 */
function spacerWidth(lane: number, count: number): number {
  return Math.max(0, Math.round((laneSpacers.value[lane] ?? 0) / Math.max(1, count)))
}

interface MarqueeSlot { key: string; message: MessageBoardMessage; label: string }

/**
 * 把去重后的标题轮流分配到各轨道：轨道之间标题集合**互不相交**，合起来覆盖全部名称。
 * 留言少于 5 条时轨道数自动收敛（不渲染空行），每条轨道至少有一条。
 */
const laneSlots = computed<MarqueeSlot[][]>(() => {
  const items = marqueeItems.value
  if (items.length === 0) return []
  const count = Math.min(MARQUEE_LANES, items.length)
  const lanes: MarqueeSlot[][] = Array.from({ length: count }, () => [])
  items.forEach((m, i) => {
    lanes[i % count].push({ key: `${i}-${m.id}`, message: m, label: marqueeTitle(m) })
  })
  return lanes
})

// ===== 留言详情弹框（点击滚动标题）=====
const detailOpen = ref(false)
const detailId = ref<string | null>(null)
const detailMessage = computed<MessageBoardMessage | null>(() =>
  detailId.value ? store.activeMessages.find((m) => m.id === detailId.value) ?? null : null
)
function openDetail(m: MessageBoardMessage): void {
  detailId.value = m.id
  detailOpen.value = true
}
function closeDetail(): void {
  detailOpen.value = false
  detailId.value = null
  // 弹框遮罩会截走 pointer 事件，mouseout 未必到达 → 主动清 hover，关闭后滚动立即恢复
  hoveringItem.value = false
}

// 卡片上的三个操作已收进详情弹框：卡片本身只负责「打开」，功能不丢失
async function toggleDetailPin(): Promise<void> {
  const m = detailMessage.value
  if (m) await store.togglePin(m.id)
}
function editFromDetail(): void {
  const m = detailMessage.value
  if (!m) return
  closeDetail()
  startEdit(m)
}
async function deleteFromDetail(): Promise<void> {
  const id = detailId.value
  if (id) await handleDelete(id) // 复用同一套确认 / 落库 / 关弹框逻辑
}
/** 暂停条件：鼠标停在任一标题项上，或详情弹框打开（背后不滚动，关闭后按 hover 状态恢复） */
const marqueePaused = computed(() => hoveringItem.value || detailOpen.value)

interface LaneState { el: HTMLElement | null; offset: number; width: number; initialized: boolean }
/** 每条轨道独立记录位移与回绕周期；相位只在首次测量时初始化，resize 不重置正在滚动的位置 */
const laneStates: LaneState[] = Array.from({ length: MARQUEE_LANES }, () => ({
  el: null, offset: 0, width: 0, initialized: false
}))

/** 读取全局间距 token 作为轨道基础间隔（JS 计算 spacer 需要 px 数值） */
function baseGapPx(): number {
  const n = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-3'))
  return Number.isFinite(n) ? n : 12
}

function measureMarquee(): void {
  const vp = viewportRef.value
  if (!vp || !hasMarquee.value) {
    for (const s of laneStates) { s.el = null; s.width = 0 }
    return
  }
  const tracks = [...vp.querySelectorAll<HTMLElement>('[data-testid="mb-marquee-track"]')]
  const groups = tracks.map(t => t.querySelector<HTMLElement>('[data-testid="mb-marquee-group"]'))
  const gap = baseGapPx()
  const nextSpacers = [...laneSpacers.value]
  let changed = false
  for (let i = 0; i < tracks.length; i++) {
    const g = groups[i]
    if (!g) continue
    const items = [...g.querySelectorAll<HTMLElement>('.message-marquee-item')]
    const widths = items.map(el => el.getBoundingClientRect().width)
    const itemsWidth = widths.reduce((sum, w) => sum + w, 0)
    // 一组里每个标题只出现一次；宽度不足时用**空白**补齐，绝不重复标题。
    // 组宽必须 >= 视口宽 + 最宽标题：否则视口跨接缝时，A 组标题的右边缘与
    // B 组同标题的左边缘会同时露出来，视觉上就成了「名称重复」。
    const target = vp.clientWidth + Math.max(0, ...widths) + 16
    // 每条标题后跟一个 spacer，组内子元素数约 2n，间隔数按 2n+1 保守估算
    const spacer = Math.max(0, Math.ceil(target - itemsWidth - gap * (items.length * 2 + 1)))
    if (Math.abs(spacer - (nextSpacers[i] ?? 0)) > 1) {
      nextSpacers[i] = spacer
      changed = true
    }
  }
  if (changed) {
    laneSpacers.value = nextSpacers
    // 尺寸变化会触发 ResizeObserver；再排一帧兜底，保证未被观察的轨道也能进入稳定分支
    requestAnimationFrame(() => measureMarquee())
    return
  }
  for (let i = 0; i < MARQUEE_LANES; i++) {
    const s = laneStates[i]
    s.el = tracks[i] ?? null
    const w = groups[i]?.getBoundingClientRect().width ?? 0
    s.width = w
    if (w <= 0) continue
    if (!s.initialized) {
      s.offset = (MARQUEE_LANE_PHASES[i] ?? 0) * w // 错开起点，形成弹幕的参差感
      s.initialized = true
    } else if (s.offset > w) {
      s.offset %= w // 宽度变化只做取模，不把位置打回 0
    }
  }
}

let resizeObserver: ResizeObserver | null = null
function setupMarqueeObserver(): void {
  resizeObserver?.disconnect()
  resizeObserver = null
  if (!viewportRef.value || !hasMarquee.value) {
    for (const s of laneStates) { s.el = null; s.width = 0 }
    return
  }
  resizeObserver = new ResizeObserver(() => measureMarquee())
  resizeObserver.observe(viewportRef.value)
  for (const g of viewportRef.value.querySelectorAll<HTMLElement>('[data-testid="mb-marquee-group"]')) {
    resizeObserver.observe(g)
  }
  measureMarquee()
}
// 留言数据异步加载 / 增删后轨道数与内容变化，DOM 更新完成再重挂测量
watch(marqueeItems, () => setupMarqueeObserver(), { flush: 'post' })

let rafId = 0
let lastTs = 0
let reduceMotion = false
function marqueeFrame(ts: number): void {
  const dt = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0
  lastTs = ts
  // 暂停 = 所有轨道一起停；恢复 = 各自从当前 offset 继续，互不干扰
  if (!reduceMotion && !marqueePaused.value) {
    for (const s of laneStates) {
      if (!s.el || s.width <= 0) continue
      s.offset = (s.offset + MARQUEE_SPEED * dt) % s.width
      s.el.style.transform = `translate3d(${-s.offset}px, 0, 0)`
    }
  }
  rafId = requestAnimationFrame(marqueeFrame)
}

/**
 * 悬停暂停用事件委托而非逐项 mouseenter/leave：
 * 从标题 A 直接滑到 B 时，leave(A)→enter(B) 之间会有一帧 running，滚动会「抖一下」。
 * 这里只在「进入 item」置 true、「离开 item 且不是移到另一个 item」才置 false。
 */
function onMarqueeOver(e: MouseEvent): void {
  if ((e.target as HTMLElement | null)?.closest('.message-marquee-item')) hoveringItem.value = true
}
function onMarqueeOut(e: MouseEvent): void {
  const target = e.target as HTMLElement | null
  if (!target?.closest('.message-marquee-item')) return
  const next = e.relatedTarget as HTMLElement | null
  if (next?.closest?.('.message-marquee-item')) return
  hoveringItem.value = false
}

// ===== 新增 / 编辑表单（同一份弹框）=====
const formOpen = ref(false)
const editingId = ref<string | null>(null)
const formTitle = ref('')
const formContent = ref('')
/**
 * 取色器必须始终拿到合法 hex：modelValue 为 null 时 Element Plus 的首次选色不回写。
 * 故新增时先随机一个色填进取色器（可见、可换）；用户不选 → 保存的就是这个随机色，
 * 既满足「未选随机」，又保证首次打开取色器即可选色。
 */
const formColor = ref<string>(randomMessageColor())
const isFormValid = computed(() => formContent.value.trim().length > 0)

function startAdd(): void {
  editingId.value = null
  formTitle.value = ''
  formContent.value = ''
  formColor.value = randomMessageColor()
  formOpen.value = true
}

function startEdit(m: MessageBoardMessage): void {
  editingId.value = m.id
  formTitle.value = m.title ?? ''
  formContent.value = m.content
  // 旧语义键无法直接喂给取色器，用其代表色回填
  formColor.value = toPickerColor(m.color)
  formOpen.value = true
}

function closeForm(): void {
  formOpen.value = false
}
function randomizeFormColor(): void {
  formColor.value = randomMessageColor()
}
function clearFormColor(): void {
  formColor.value = MESSAGE_PRESET_HEX.default
}

async function handleSave(): Promise<void> {
  if (!isFormValid.value) return
  const patch = {
    title: formTitle.value.trim(),
    content: formContent.value.trim(),
    // 未主动选色时 formColor 已是 startAdd 里给的随机色
    color: normalizeMessageColor(formColor.value)
  }
  if (editingId.value) {
    await store.updateMessage(editingId.value, patch)
    toast.success('留言已更新')
  } else {
    const ok = await store.addMessage(patch)
    if (!ok) { toast.warning('留言内容不能为空'); return }
    toast.success('留言已添加')
  }
  closeForm()
}

async function handleDelete(id: string): Promise<void> {
  if (!await showConfirm('确定要删除这条留言吗？删除后可在「回收站」恢复。', '删除留言')) return
  await store.deleteMessage(id)
  closeForm()
  closeDetail()
  toast.success('留言已移入回收站')
}

onMounted(async () => {
  // 视图已在 onMounted 并发加载，这里做防御性重载（面板被单独挂载 / 云端拉取后也能自愈）
  await store.loadMessages()
  reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false
  setupMarqueeObserver()
  rafId = requestAnimationFrame(marqueeFrame)
})
onBeforeUnmount(() => {
  if (rafId) cancelAnimationFrame(rafId)
  resizeObserver?.disconnect()
  resizeObserver = null
})
</script>

<template>
  <div class="message-board" data-testid="mb-panel">
    <!-- 工具条：搜索 + 计数 + 新增 -->
    <div class="message-toolbar" data-testid="mb-toolbar">
      <el-input
        v-model="keyword"
        class="message-search"
        data-testid="mb-search-input"
        placeholder="搜索留言标题或内容…"
        clearable
      />
      <span class="message-count" data-testid="mb-count">{{ countText }}</span>
      <button type="button" class="btn-add" data-testid="mb-add-button" @click="startAdd">＋ 新增留言</button>
    </div>

    <!-- 标题弹幕：独立于卡片列表，名称去重后分配到多条轨道；无留言时整块不渲染 -->
    <section
      v-if="hasMarquee"
      class="ui-card message-marquee"
      data-testid="mb-marquee"
      :data-paused="marqueePaused ? 'true' : 'false'"
      aria-label="留言标题滚动展示区"
    >
      <!-- 浮在卡片左上角上边缘的标签：不占弹幕宽度、不拦截点击 -->
      <span class="message-marquee-label" data-testid="mb-marquee-label">留言速览</span>
      <div
        ref="viewportRef"
        class="message-marquee-viewport"
        data-testid="mb-marquee-viewport"
        @mouseover="onMarqueeOver"
        @mouseout="onMarqueeOut"
      >
        <!-- 多条弹幕轨道：每行独立位移、同一速度，标题按轨道分配 + 相位错开 -->
        <div
          v-for="(slots, lane) in laneSlots"
          :key="lane"
          class="message-marquee-lane"
          :data-testid="`mb-marquee-lane-${lane}`"
        >
          <div class="message-marquee-track" data-testid="mb-marquee-track">
            <!-- 两组内容完全相同：位移在一组宽度内取模回绕，首尾相接、无空白与跳帧 -->
            <div class="message-marquee-group" data-testid="mb-marquee-group">
              <!-- 间隔均分到每条标题后面：标题铺得均匀，不挤在左端；仍不靠重复标题撑宽度 -->
              <template v-for="slot in slots" :key="slot.key">
                <button
                  type="button"
                  class="ui-btn ui-btn--text message-marquee-item"
                  :class="[toneClass(slot.message.color), { 'is-custom': isCustomMessageColor(slot.message.color) }]"
                  :style="colorStyle(slot.message.color)"
                  :data-mb-id="slot.message.id"
                  :data-testid="`mb-marquee-item-${slot.message.id}`"
                  :title="`${formatDate(slot.message.createdAt)} ${slot.label}`"
                  :aria-label="`查看留言：${slot.label}`"
                  @click="openDetail(slot.message)"
                >
                  <span class="message-marquee-date">{{ formatDate(slot.message.createdAt) }}</span>
                  <span class="message-marquee-dot" aria-hidden="true">·</span>
                  <span class="message-marquee-text">{{ slot.label }}</span>
                </button>
                <span class="message-marquee-spacer" :style="{ width: spacerWidth(lane, slots.length) + 'px' }" aria-hidden="true"></span>
              </template>
            </div>
            <div class="message-marquee-group" data-testid="mb-marquee-group-copy" aria-hidden="true">
              <template v-for="slot in slots" :key="`copy-${slot.key}`">
                <button
                  type="button"
                  class="ui-btn ui-btn--text message-marquee-item"
                  :class="[toneClass(slot.message.color), { 'is-custom': isCustomMessageColor(slot.message.color) }]"
                  :style="colorStyle(slot.message.color)"
                  :data-mb-id="slot.message.id"
                  tabindex="-1"
                  :title="`${formatDate(slot.message.createdAt)} ${slot.label}`"
                  @click="openDetail(slot.message)"
                >
                  <span class="message-marquee-date">{{ formatDate(slot.message.createdAt) }}</span>
                  <span class="message-marquee-dot" aria-hidden="true">·</span>
                  <span class="message-marquee-text">{{ slot.label }}</span>
                </button>
                <span class="message-marquee-spacer" :style="{ width: spacerWidth(lane, slots.length) + 'px' }" aria-hidden="true"></span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 卡片网格：置顶优先（排序在 store / core），每条留言一张卡 -->
    <div v-if="visibleMessages.length > 0" class="message-grid" data-testid="mb-grid">
      <article
        v-for="m in visibleMessages"
        :key="m.id"
        class="ui-card message-card"
        :class="[toneClass(m.color), { 'is-pinned': m.pinned, 'is-custom': isCustomMessageColor(m.color) }]"
        :style="colorStyle(m.color)"
        :data-testid="`mb-card-${m.id}`"
        role="button"
        tabindex="0"
        :aria-label="`查看留言详情：${m.title || '给自己的一句话'}`"
        @click="openDetail(m)"
        @keydown.enter="openDetail(m)"
        @keydown.space.prevent="openDetail(m)"
      >
        <div class="message-card-top">
          <h3 v-if="m.title" class="message-title" :data-testid="`mb-title-${m.id}`">{{ m.title }}</h3>
          <span v-else class="message-title is-placeholder">给自己的一句话</span>
          <span v-if="m.pinned" class="message-pin" data-testid="mb-pin-badge">置顶</span>
        </div>
        <p class="message-content" :data-testid="`mb-content-${m.id}`">{{ m.content }}</p>
        <div class="message-card-foot">
          <time class="message-time" :datetime="m.createdAt">{{ formatTime(m.createdAt) }}</time>
          <span class="message-card-hint">点击查看详情</span>
        </div>
      </article>
    </div>

    <div v-else class="empty-state" data-testid="mb-empty">
      {{ hasFilter ? '没有匹配的留言，换个关键词试试' : '还没有留言，点「新增留言」给自己留一句话吧' }}
    </div>

    <!-- 新增 / 编辑弹框：统一走 BaseDialog -->
    <BaseDialog
      v-if="formOpen"
      :title="editingId ? '编辑留言' : '新增留言'"
      :width="'var(--dlg-w-messages, 520px)'"
      max-height="80vh"
      data-testid="mb-dialog"
      @close="closeForm"
    >
      <div class="message-form">
        <label class="message-field">
          <span class="message-field-label">标题（可选）</span>
          <el-input
            v-model="formTitle"
            data-testid="mb-form-title"
            maxlength="40"
            placeholder="给这条留言起个名字"
          />
        </label>
        <label class="message-field">
          <span class="message-field-label">内容</span>
          <el-input
            v-model="formContent"
            type="textarea"
            :rows="6"
            data-testid="mb-form-content"
            placeholder="想对自己说点什么…"
          />
        </label>
        <div class="message-field">
          <span class="message-field-label">卡片色调</span>
          <div class="message-color-row" data-testid="mb-form-color">
            <el-color-picker
              v-model="formColor"
              :predefine="MESSAGE_RANDOM_COLORS"
              data-testid="mb-form-color-picker"
            />
            <button type="button" class="ui-btn ui-btn--sm" data-testid="mb-form-color-clear" @click="clearFormColor">素色</button>
            <button type="button" class="ui-btn ui-btn--sm" data-testid="mb-form-color-random" @click="randomizeFormColor">随机一个</button>
            <span class="message-color-hint">{{ formColor.toUpperCase() }} · 未选择时已自动随机</span>
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="btn-cancel" data-testid="mb-form-close" @click="closeForm">{{ DIALOG_BTN.close }}</button>
        <button type="button" class="btn-submit" :disabled="!isFormValid" data-testid="mb-form-save" @click="handleSave">{{ DIALOG_BTN.save }}</button>
        <button v-if="editingId" type="button" class="btn-delete" data-testid="mb-form-delete" @click="handleDelete(editingId)">删除</button>
      </template>
    </BaseDialog>

    <!-- 标题详情：完整正文 + 现有字段元信息；关闭由 BaseDialog 与底部按钮统一处理 -->
    <BaseDialog
      v-if="detailOpen"
      title="留言详情"
      :width="'var(--dlg-w-messages, 520px)'"
      max-height="80vh"
      data-testid="mb-detail-dialog"
      @close="closeDetail"
    >
      <div v-if="detailMessage" class="message-detail" data-testid="mb-detail-body">
        <h3 class="message-detail-title" data-testid="mb-detail-title">{{ detailMessage.title || '（无标题）' }}</h3>
        <p class="message-detail-content" data-testid="mb-detail-content">{{ detailMessage.content }}</p>
        <dl class="message-detail-meta">
          <div><dt>卡片色调</dt><dd data-testid="mb-detail-color">{{ colorLabel(detailMessage.color) }}</dd></div>
          <div><dt>置顶状态</dt><dd data-testid="mb-detail-pinned">{{ detailMessage.pinned ? '已置顶' : '未置顶' }}</dd></div>
          <div><dt>创建时间</dt><dd data-testid="mb-detail-created">{{ formatTime(detailMessage.createdAt) }}</dd></div>
          <div><dt>最近编辑</dt><dd data-testid="mb-detail-updated">{{ formatTime(detailMessage.updatedAt) }}</dd></div>
          <div><dt>留言 ID</dt><dd data-testid="mb-detail-id">{{ detailMessage.id }}</dd></div>
        </dl>
      </div>
      <div v-else class="message-detail-empty" data-testid="mb-detail-empty">这条留言已被删除</div>
      <template #footer>
        <button type="button" class="btn-cancel" data-testid="mb-detail-close" @click="closeDetail">{{ DIALOG_BTN.close }}</button>
        <!-- 卡片上的三个操作收进这里，沿用原 testid，避免功能丢失 -->
        <template v-if="detailMessage">
          <button
            type="button"
            class="ui-btn ui-btn--text"
            :data-testid="`mb-pin-${detailMessage.id}`"
            @click="toggleDetailPin"
          >{{ detailMessage.pinned ? '取消置顶' : '置顶' }}</button>
          <button type="button" class="btn-edit" :data-testid="`mb-edit-${detailMessage.id}`" @click="editFromDetail">编辑</button>
          <button type="button" class="btn-delete" :data-testid="`mb-delete-${detailMessage.id}`" @click="deleteFromDetail">删除</button>
        </template>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.message-board {
  /* 卡片统一高度：200px ≈ 标题 1 行 + 正文 4 行 + 脚注 1 行；
     一屏（900px 视口）在工具栏 + 弹幕区之后仍能完整看到两行卡片。 */
  --mb-card-h: 200px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* 工具条：与待办/便签的查询区同构（卡面 + 12px 圆角 + 轻阴影） */
.message-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: var(--space-3);
  background-color: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}
.message-search { width: min(320px, 100%); flex: 1 1 220px; }
.message-count {
  margin-left: auto;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
  white-space: nowrap;
}

/* 卡片网格：auto-fill 自适应列，窄屏自然收敛为一列；卡片统一等高，行内不再留空白 */
.message-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr));
  gap: var(--space-3);
  align-items: start;
}
.message-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  min-width: 0;
  height: var(--mb-card-h); /* 固定高度：长留言不再把整行撑高 */
  padding: var(--space-4);
  border-left: 3px solid var(--color-border);
  overflow: hidden; /* 窄屏脚注折行时兜底，保证卡片高度恒定 */
  cursor: pointer; /* 整卡即「查看详情」入口 */
}
.message-card:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.message-card-top { flex: none; display: flex; align-items: flex-start; gap: var(--space-2); }
.message-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.message-title.is-placeholder { font-weight: 400; color: var(--color-text-muted); }
.message-pin {
  flex: none;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: var(--fs-caption);
  color: var(--color-primary-text);
  background-color: var(--color-primary-soft);
}
.message-content {
  flex: 1 1 auto;
  min-height: 0; /* 固定高度下允许被压缩，配合 line-clamp 才不会顶破卡片 */
  margin: 0;
  font-size: var(--fs-body);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  /* 最多 4 行（≈ 卡片去掉标题/脚注后的可用高度），超出显示省略号；点卡片看全文 */
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}
.message-card-foot {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border);
}
.message-time {
  font-size: var(--fs-caption);
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}
.message-card-hint { font-size: var(--fs-caption); color: var(--color-text-muted); }

/* 色调只派生 token，不写死色值：卡片与弹幕胶囊**共用同一份背景**，切换 accent / 暗色自动跟随 */
.message-card.tone-primary,
.message-marquee-item.tone-primary { background-color: color-mix(in srgb, var(--color-primary) 6%, var(--color-bg-card)); }
.message-card.tone-success,
.message-marquee-item.tone-success { background-color: color-mix(in srgb, var(--color-success) 6%, var(--color-bg-card)); }
.message-card.tone-warning,
.message-marquee-item.tone-warning { background-color: color-mix(in srgb, var(--color-warning) 7%, var(--color-bg-card)); }
.message-card.tone-danger,
.message-marquee-item.tone-danger { background-color: color-mix(in srgb, var(--color-error) 6%, var(--color-bg-card)); }
.message-card.tone-default { border-left-color: var(--color-border-strong); }
.message-marquee-item.tone-default { border-color: var(--color-border); }
.message-card.tone-primary { border-left-color: var(--color-primary); }
.message-card.tone-success { border-left-color: var(--color-success); }
.message-card.tone-warning { border-left-color: var(--color-warning); }
.message-card.tone-danger { border-left-color: var(--color-error); }
.message-marquee-item.tone-primary { border-color: color-mix(in srgb, var(--color-primary) 45%, var(--color-border)); }
.message-marquee-item.tone-success { border-color: color-mix(in srgb, var(--color-success) 45%, var(--color-border)); }
.message-marquee-item.tone-warning { border-color: color-mix(in srgb, var(--color-warning) 45%, var(--color-border)); }
.message-marquee-item.tone-danger { border-color: color-mix(in srgb, var(--color-error) 45%, var(--color-border)); }

/* 取色器的自定义色：同一 --mb-custom 变量注入，背景与卡片保持一致 */
.message-card.is-custom,
.message-marquee-item.is-custom { background-color: color-mix(in srgb, var(--mb-custom) 10%, var(--color-bg-card)); }
.message-card.is-custom { border-left-color: var(--mb-custom); }
.message-marquee-item.is-custom { border-color: color-mix(in srgb, var(--mb-custom) 55%, var(--color-border)); }
.message-card.is-pinned { box-shadow: var(--shadow-md); }

/* ===== 标题跑马灯 =====
   卡面复用 .ui-card、标题按钮复用 .ui-btn--text，这里只做滚动视口与省略排版。
   track 用 translate3d 走合成层；backface-visibility 抑制文字在平移时的闪烁。 */
.message-marquee {
  /* 在原先「一行标题」的高度上再加 200px，撑出多条弹幕轨道 */
  --mb-marquee-extra: 200px;
  position: relative;
  display: flex;
  align-items: stretch;
  min-width: 0;
  min-height: calc(var(--ui-ctrl-h) + var(--space-2) * 2 + var(--mb-marquee-extra));
  padding: var(--space-2) var(--space-3);
  /* 浮动标签要能探出卡片上边缘；弹幕内容由每条 lane 各自裁剪 */
  overflow: visible;
}
/* 「留言速览」浮在卡片左上角上边缘：脱离文档流、不占弹幕宽度、不拦截点击 */
.message-marquee-label {
  position: absolute;
  top: calc(var(--space-2) * -1);
  left: var(--space-3);
  z-index: 2;
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-full);
  background-color: var(--color-bg-card);
  box-shadow: var(--shadow-card);
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--color-primary-text);
  white-space: nowrap;
  pointer-events: none;
}
.message-marquee-viewport {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  gap: var(--space-1);
  padding-top: var(--space-2); /* 给左上角浮动标签让出空间 */
  overflow: hidden;
}
/* 每条轨道固定行高，轨道少时由 space-around 均匀分布在增高后的区域里 */
.message-marquee-lane {
  flex: 0 0 var(--ui-ctrl-h);
  height: var(--ui-ctrl-h);
  min-height: 0;
  display: flex;
  align-items: center;
  overflow: hidden;
}
.message-marquee-track {
  display: flex;
  width: max-content;
  will-change: transform;
  transform: translate3d(0, 0, 0);
  backface-visibility: hidden;
}
.message-marquee-group {
  display: flex;
  flex: none;
  align-items: center;
  gap: var(--space-3);
  /* 组尾留白 = 组间间隔，保证两份拼接处节奏一致，回绕时看不出接缝 */
  padding-right: var(--space-3);
}
.message-marquee-item {
  flex: none;
  max-width: 280px; /* 日期 + 标题同处一颗胶囊 */
  gap: var(--space-1);
  font-size: var(--fs-sm);
  color: var(--color-text); /* 淡色底上用正文字色，保证滚动时可读 */
  /* 弹幕条：淡底胶囊，仍沿用 .ui-btn--text 的文字按钮皮肤，只补一层语义底 */
  background-color: var(--color-bg-hover);
  border-color: var(--color-border);
  border-radius: var(--radius-full);
}
.message-marquee-item:hover { color: var(--color-primary-text); }
/* 组尾空白：只占位不渲染文字，保证一组宽 >= 视口宽，名称无需重复也能无缝回绕 */
.message-marquee-spacer { flex: none; height: 1px; }
.message-marquee-date {
  flex: none;
  font-size: var(--fs-caption);
  color: var(--color-text-secondary);
  font-variant-numeric: tabular-nums;
}
.message-marquee-dot { flex: none; color: var(--color-text-muted); }
.message-marquee-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ===== 留言详情 ===== */
.message-detail { display: flex; flex-direction: column; gap: var(--space-3); }
.message-detail-title {
  margin: 0;
  font-size: var(--fs-lg);
  font-weight: 600;
  color: var(--color-text);
  word-break: break-word;
}
.message-detail-content {
  margin: 0;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background-color: var(--color-bg-hover);
  font-size: var(--fs-body);
  line-height: var(--line-height-relaxed);
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
}
.message-detail-meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 180px), 1fr));
  gap: var(--space-2) var(--space-3);
  margin: 0;
}
.message-detail-meta > div { display: flex; align-items: baseline; gap: var(--space-2); min-width: 0; }
.message-detail-meta dt { flex: none; font-size: var(--fs-caption); color: var(--color-text-muted); }
.message-detail-meta dd {
  min-width: 0;
  margin: 0;
  font-size: var(--fs-caption);
  color: var(--color-text-secondary);
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.message-detail-empty {
  padding: var(--space-4);
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--color-text-secondary);
}

/* 表单：纵向排布，标签与控件间距统一 */
.message-form { display: flex; flex-direction: column; gap: var(--space-3); }
.message-field { display: flex; flex-direction: column; gap: var(--space-1); }
.message-field-label { font-size: var(--fs-sm); font-weight: 600; color: var(--color-text-secondary); }
.message-form :deep(.el-textarea__inner) { line-height: var(--line-height-relaxed); resize: none; }
.message-color-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.message-color-hint { font-size: var(--fs-caption); color: var(--color-text-muted); }

/* 暗色：浅色合成底换成低透明度彩色，避免深色界面上贴一块浅色补丁（卡片与弹幕一致） */
html.dark .message-card.tone-primary,
html.dark .message-card.tone-success,
html.dark .message-card.tone-warning,
html.dark .message-card.tone-danger,
html.dark .message-marquee-item.tone-primary,
html.dark .message-marquee-item.tone-success,
html.dark .message-marquee-item.tone-warning,
html.dark .message-marquee-item.tone-danger {
  background-color: var(--color-bg-card);
}
html.dark .message-card.is-custom,
html.dark .message-marquee-item.is-custom {
  background-color: color-mix(in srgb, var(--mb-custom) 16%, var(--color-bg-card));
}
html.dark .message-toolbar,
html.dark .message-marquee,
html.dark .message-marquee-label { box-shadow: none; }

@media (max-width: 768px) {
  .message-toolbar { padding: var(--space-2); }
  .message-search { flex: 1 1 100%; }
  .message-count { margin-left: 0; }
  .message-grid { grid-template-columns: 1fr; }
  /* 窄屏仍是同一高度：列宽变大后 4 行正文能显示更多字，无需另设一套高度 */
  .message-card { padding: var(--space-3); }
  /* 触屏：操作按钮保持 ≥36px 的全局按钮高度，间隙略放宽避免误触 */
  .message-actions { gap: var(--space-2); }
  .message-marquee { padding: var(--space-2); }
  .message-marquee-label { left: var(--space-2); }
  .message-marquee-item { max-width: 220px; }
}
</style>

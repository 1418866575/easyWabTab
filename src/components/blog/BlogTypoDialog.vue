<script setup lang="ts">
/**
 * 排版主题选择弹框。
 * - 顶部搜索框：按主题名称（颜色名）/ 描述过滤
 * - 「最近使用」分组置顶（localStorage 记录最近 5 个，应用即记录）
 * - 点卡片：应用到本篇**并立即关闭弹框**（选中即完成，无需再点确认）
 * - 点卡片脚「设默认」：改全站默认主题（emit setDefault；再点一次回落 classic，防默认悬空）
 * - 点卡片脚「公众号预览」：弹框内切换到预览视图，用编辑器正在编辑的正文实时渲染该主题的公众号排版
 * - 卡片 = 该主题 token 渲染的迷你示例（非截图，主题扩充自动生成）
 * 壳走 BaseDialog（规范 §2.2：弹框唯一基类，禁止自建 overlay）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/Icon.vue'
import { TYPO_THEMES } from '@/composables/blogTypoCore'
import type { TypoTheme } from '@/composables/blogTypoCore'
import { decorateTypoHtml } from '@/composables/blogTypoDecor'
import { buildWechatContentHtml } from '@/composables/useWechatPublish'
import { useBlogStore } from '@/stores/blog'
import type { BlogTypo } from '@/types'

const props = defineProps<{
  themeId: string
  defaultId: string
  /** 编辑器里正在编辑的正文（markdown，含未保存改动）——公众号预览的唯一内容来源 */
  contentMarkdown?: string
  /** 文章自身的排版覆盖（字号/行高/段距）；预览时只替换 themeId，其余沿用，保证与真实发布一致 */
  typo?: BlogTypo
}>()
const emit = defineEmits<{ apply: [id: string]; setDefault: [id: string]; close: [] }>()

const store = useBlogStore()

/** 「最近使用」：UI 偏好，localStorage 记录最近 5 个主题 id（最新在前、去重） */
const RECENT_KEY = 'blog-typo-recent'
const RECENT_MAX = 5

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string' && TYPO_THEMES.some((t) => t.id === x))
  } catch {
    return []
  }
}

const recentIds = ref<string[]>(loadRecent())

const query = ref('')

function onApply(id: string): void {
  recentIds.value = [id, ...recentIds.value.filter((x) => x !== id)].slice(0, RECENT_MAX)
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds.value))
  } catch {
    /* 隐私模式等场景写不进就算了：分组只是便利，不影响功能 */
  }
  emit('apply', id)
}

/**
 * 应用并关闭：点卡片、预览页「应用该主题」共用。
 * 点卡片即选中——用户点哪个主题就是要用哪个，不必再找确认按钮；
 * 卡片脚的「设默认」「公众号预览」都 stop 了冒泡，不会误触。
 */
function applyAndClose(id: string): void {
  onApply(id)
  emit('close')
}

function onSetDefault(id: string): void {
  emit('setDefault', id === props.defaultId ? 't_classic' : id)
}

// ==================== 公众号预览（弹框内切换视图，不叠新弹层） ====================

/** 正在预览的主题 id；空串 = 常规的主题列表视图 */
const previewThemeId = ref('')
const previewTheme = computed<TypoTheme | null>(
  () => TYPO_THEMES.find((t) => t.id === previewThemeId.value) ?? null
)

function openPreview(id: string): void {
  previewThemeId.value = id
}
function closePreview(): void {
  previewThemeId.value = ''
}

/** 预览用 BlogTypo：沿用文章自身的字号/行高/段距，只替换主题 id（与真实发布参数一致） */
const previewTypo = computed<BlogTypo>(() => ({
  ...(props.typo ?? { themeId: previewThemeId.value }),
  themeId: previewThemeId.value
}))

/** 渲染失败标记：转换过程抛错时给一句可读提示，而不是留一块空白 */
const previewFailed = ref(false)

/**
 * 预览正文 + 失效图片计数（一次计算两件事，避免在 computed 里回写 ref 造成副作用循环）。
 * 图库中已不存在的 `img:ID` 引用必须先剔除：否则 markdown 会渲染出 `src="img:..."`，
 * 浏览器加载非法协议 → 破图占位 + 控制台报错，用户会误以为预览坏了。
 */
const previewSource = computed(() => {
  const raw = props.contentMarkdown ?? ''
  let missing = 0
  const md = raw.replace(/!\[[^\]]*\]\(img:([^)\s]+)\)/g, (whole: string, id: string) => {
    if (store.imageUrlById.get(id)) return whole
    missing += 1
    return ''
  })
  return { md, missing }
})

/**
 * 公众号排版 HTML。
 * 用 computed 而非点击时快照：依赖 props.contentMarkdown，编辑器正文一旦变化（含未保存改动）
 * 预览立即重算，保证「展示 = 当前正在编辑的内容」。
 * 与「发布到公众号 / 编辑器内的效果预览」走同一个 buildWechatContentHtml，排版口径完全一致。
 */
const previewHtml = computed<string>(() => {
  const id = previewThemeId.value
  if (!id) return ''
  previewFailed.value = false
  const md = previewSource.value.md.trim()
  if (!md) return ''
  try {
    return buildWechatContentHtml(
      md,
      (imgId) => store.imageUrlById.get(imgId),
      previewTypo.value,
      store.settings.defaultTypoId
    )
  } catch (err) {
    console.error('[BlogTypoDialog] 公众号预览渲染失败', err)
    previewFailed.value = true
    return ''
  }
})

/** 预览空态文案：区分「正文为空」与「渲染出错」两种边界 */
const previewEmptyText = computed(() =>
  previewFailed.value
    ? '这段内容无法转换为公众号排版，请回到编辑器检查后重试。'
    : '正文还是空的。先在编辑器里写点内容，这里会实时呈现公众号排版效果。'
)

/**
 * 预览态下的 ESC 分两层：先退回主题列表，再按一次才关弹框。
 * BaseDialog 的 ESC 监听在 window 冒泡阶段，这里用 document 捕获阶段先拦下并 stopPropagation，
 * 只有预览态才拦截——列表态的 ESC 行为保持原样（直接关弹框）。
 */
function onDocKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape' || !previewTheme.value) return
  e.preventDefault()
  e.stopPropagation()
  closePreview()
}
onMounted(() => document.addEventListener('keydown', onDocKeydown, true))
onUnmounted(() => document.removeEventListener('keydown', onDocKeydown, true))

/** 过滤：主题名称（颜色名）与描述都参与匹配，空查询 = 全部 */
const q = computed(() => query.value.trim().toLowerCase())

function matchTheme(t: TypoTheme): boolean {
  if (!q.value) return true
  return t.name.toLowerCase().includes(q.value) || t.desc.toLowerCase().includes(q.value)
}

const recentList = computed(() =>
  recentIds.value
    .map((id) => TYPO_THEMES.find((t) => t.id === id))
    .filter((t): t is TypoTheme => !!t && matchTheme(t))
)

const allList = computed(() => TYPO_THEMES.filter((t) => !recentIds.value.includes(t.id) && matchTheme(t)))

/** 渲染分组：最近使用置顶，其余归入「全部主题 / 搜索结果」；空组不显示 */
const sections = computed(() => {
  const out: Array<{ key: string; title: string; count: number; items: TypoTheme[] }> = []
  if (recentList.value.length) out.push({ key: 'recent', title: '最近使用', count: recentList.value.length, items: recentList.value })
  if (allList.value.length) out.push({ key: 'all', title: q.value ? '搜索结果' : '全部主题', count: allList.value.length, items: allList.value })
  return out
})

/** 迷你示例：真实标签渲染（markdown.css + 主题 token + 找Tab 装饰/结构样式原样呈现） */
const SAMPLE_HTML =
  '<h2>小标题样式</h2><p>正文是这样的，<strong>重点内容会被强调</strong>。段落继续补充示例文字，让卡片观感更饱满一些。</p><blockquote>引用长这样</blockquote>'

function miniHtml(t: TypoTheme): string {
  return decorateTypoHtml(SAMPLE_HTML, t)
}

/** 注入该主题 token（字号按缩小后的卡片等比下调，只比结构与配色） */
function miniStyle(t: TypoTheme): Record<string, string> {
  return {
    ...t.tokens,
    '--t-font-size': '11.5px',
    '--t-line-height': '1.65',
    '--t-paragraph-gap': '0.4em'
  }
}
</script>

<template>
  <BaseDialog
    class="btyp-dialog"
    :title="previewTheme ? `公众号预览 · ${previewTheme.name}` : '选择排版主题'"
    :width="previewTheme ? 'min(560px, 94vw)' : 'min(1180px, 92vw)'"
    max-height="86vh"
    body-layout="flex-column"
    @close="emit('close')"
  >
    <!-- ========== 公众号预览视图（弹框内切换，不叠新弹层） ========== -->
    <div v-if="previewTheme" class="tdp" data-testid="blog-typo-preview">
      <div class="tdp-head">
        <button
          type="button"
          class="tdp-back"
          data-testid="blog-typo-preview-back"
          @click="closePreview"
        >← 返回主题列表</button>
        <span class="tdp-live" title="预览内容取自编辑器正在编辑的正文，未保存的改动也会呈现">● 实时同步编辑器正文</span>
      </div>

      <p v-if="previewSource.missing" class="tdp-note" data-testid="blog-typo-preview-missing">
        有 {{ previewSource.missing }} 张图片在图库里已经找不到了，预览已跳过；发公众号前记得先修正。
      </p>

      <div class="tdp-stage">
        <div class="tdp-phone">
          <p v-if="!previewHtml" class="tdp-empty" data-testid="blog-typo-preview-empty">
            {{ previewEmptyText }}
          </p>
          <!-- 预览正文：与发布到公众号同一套转换，样式全部内联，故不挂 md-body -->
          <div
            v-else
            class="tdp-body"
            data-testid="blog-typo-preview-body"
            v-html="previewHtml"
          ></div>
        </div>
      </div>

      <div class="tdp-actions">
        <button type="button" class="tdp-btn" @click="closePreview">继续挑主题</button>
        <button
          type="button"
          class="tdp-btn tdp-btn--primary"
          data-testid="blog-typo-preview-apply"
          @click="applyAndClose(previewTheme.id)"
        >应用该主题</button>
      </div>
    </div>

    <!-- ========== 主题列表视图 ========== -->
    <div v-else class="td">
      <div class="ui-search td-search" role="search">
        <Icon name="search" :size="14" />
        <input
          v-model="query"
          class="ui-search-input"
          type="text"
          placeholder="按颜色名或描述搜索，如：青提 / 藏蓝 / 公众号…"
          data-testid="blog-typo-search"
        />
      </div>

      <div class="td-scroll">
        <section v-for="sec in sections" :key="sec.key" class="td-section">
          <h3 class="td-group-title">
            {{ sec.title }}
            <span class="td-group-count">{{ sec.count }}</span>
          </h3>
          <div class="td-grid" :data-testid="`blog-typo-grid-${sec.key}`">
            <div
              v-for="t in sec.items"
              :key="t.id"
              class="td-card"
              :class="{ 'is-on': t.id === themeId }"
              :title="t.desc"
              :data-testid="`blog-typo-card-${t.id}`"
              role="button"
              tabindex="0"
              @click="applyAndClose(t.id)"
              @keydown.enter="applyAndClose(t.id)"
            >
              <span v-if="t.id === themeId" class="td-check" aria-hidden="true">✓</span>

              <!-- 迷你示例：真实标签渲染（token + 找Tab 装饰/结构样式） -->
              <div
                class="td-mini md-body"
                :style="miniStyle(t)"
                :data-typo="t.id"
                v-html="miniHtml(t)"
              ></div>

              <span class="td-foot">
                <span class="td-name">
                  <span class="td-swatch" :style="{ background: t.swatch }" aria-hidden="true"></span>
                  {{ t.name }}
                </span>
                <span class="td-ops">
                  <span
                    class="td-def"
                    role="button"
                    tabindex="0"
                    :data-testid="`blog-typo-default-${t.id}`"
                    @click.stop="onSetDefault(t.id)"
                    @keydown.enter.stop="onSetDefault(t.id)"
                  >{{ defaultId === t.id ? '已默认' : '设默认' }}</span>
                  <span v-if="defaultId === t.id" class="td-badge">默认</span>
                  <button
                    type="button"
                    class="td-prev"
                    title="用编辑器当前正文预览该主题的公众号排版"
                    :data-testid="`blog-typo-preview-${t.id}`"
                    @click.stop="openPreview(t.id)"
                  >公众号预览</button>
                </span>
              </span>
            </div>
          </div>
        </section>

        <div v-if="sections.length === 0" class="td-empty" data-testid="blog-typo-empty">
          没有匹配「{{ query }}」的主题，换个关键词试试
        </div>
      </div>

      <p class="td-hint">点卡片即应用该主题并关闭；点「公众号预览」用当前正文先看发送效果；点「设默认」把它设为全站新文章的默认主题。</p>
    </div>
  </BaseDialog>
</template>

<style scoped>
/* 弹框内边距：BaseDialog 的 flex-column 会归零 padding，这里补一指宽左右留白（约 16px） */
.td { display: flex; flex-direction: column; gap: var(--space-3); min-height: 0; height: 100%; padding: 0 var(--space-4); }

/* 搜索框：全站 .ui-search 外壳（描边/焦点环在壳上），内层透明 */
.td-search { flex: none; }
.td-search .ui-search-input {
  flex: 1 1 auto;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  color: var(--ds-text);
  font-family: inherit;
  font-size: var(--fs-sm);
}

/* 分组列表区：统一滚动容器（原 3 列网格各自滚动改为整体滚动） */
.td-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding-right: var(--space-1);
}

.td-section { display: flex; flex-direction: column; gap: 10px; }

.td-group-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-sm);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--ds-text);
}

.td-group-count {
  min-width: 18px;
  padding: 0 6px;
  border-radius: var(--ds-radius-pill, 999px);
  background: var(--ds-bg, #f7f8fa);
  color: var(--ds-text-3);
  font-size: var(--fs-caption);
  font-weight: var(--font-weight-medium, 500);
  line-height: 18px;
  text-align: center;
}

/* 4 列小卡（1180px 面板下每卡约 276px）；窄屏逐级降列，不做无限挤压 */
.td-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.td-card {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 186px;
  padding: 14px;
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-card, 10px);
  background: var(--ds-card, #ffffff);
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.td-card:hover { box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08); }
.td-card.is-on {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 4px 16px var(--color-primary-ring, rgba(59, 130, 246, 0.2));
}

/* 选中徽章：右上角圆形 ✓（参考稿样式） */
.td-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary, #3b82f6);
  color: #ffffff;
  font-size: var(--fs-caption);
  line-height: 18px;
  text-align: center;
}

/* 迷你示例容器：真实标签渲染（markdown.css + 主题 token + 找Tab 结构样式/装饰）
   max-height 兜住示例高度：4 列窄卡下只展示「标题 + 一段正文 + 引用」，不做顶部截断式的溢出。 */
.td-mini {
  display: block;
  flex: 1 1 auto;
  min-height: 0;
  max-height: 120px;
  overflow: hidden;
}

.td-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--ds-line, #ececf0);
  font-size: var(--fs-caption);
  color: var(--ds-text-3);
}
.td-name { display: inline-flex; align-items: center; gap: 5px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.td-swatch { width: 7px; height: 7px; border-radius: 50%; flex: none; }
.td-ops { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; flex: none; }
.td-def { border: none; background: transparent; padding: 2px 3px; color: var(--ds-text-3); font-size: var(--fs-caption); cursor: pointer; white-space: nowrap; }
.td-def:hover { color: var(--color-primary-text); }
.td-badge {
  flex: none;
  padding: 1px 5px;
  border-radius: var(--ds-radius-pill, 999px);
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary-text);
  font-size: 10px;
}

/* 「公众号预览」按钮：所有卡片都显示（不必先选中才能看效果） */
.td-prev {
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-ctrl, 7px);
  background: var(--ds-card, #ffffff);
  color: var(--ds-text-2);
  padding: 2px 8px;
  font-family: inherit;
  font-size: var(--fs-caption);
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background-color 0.15s;
}
.td-prev:hover {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary-text);
}

/* ---------- 公众号预览视图 ---------- */
.tdp {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  min-height: 0;
  height: 100%;
  padding: 0 var(--space-4);
}

.tdp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}

.tdp-back {
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-ctrl, 8px);
  background: var(--ds-card, #ffffff);
  color: var(--ds-text-2);
  padding: 4px 10px;
  font-family: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.tdp-back:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary-text); }

.tdp-live {
  margin-left: auto;
  color: var(--color-success-text);
  font-size: var(--fs-caption);
  white-space: nowrap;
}

/* 失效图片提示：仅在有图库引用找不到时出现 */
.tdp-note {
  margin: 0;
  flex: none;
  padding: 6px 10px;
  border-radius: var(--ds-radius-ctrl, 8px);
  background: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning-text, #92400e);
  font-size: var(--fs-caption);
  line-height: 1.6;
}

/* 舞台：手机壳居中，超出内部滚动（长文/大表格不会撑破弹框） */
.tdp-stage {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  justify-content: center;
  overflow: hidden;
}

.tdp-phone {
  width: 100%;
  max-width: 403px; /* 375px 正文 + 左右 14px 内边距 */
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 14px;
  background: #ffffff; /* 公众号正文为浅色内联样式，壳必须固定白底，暗色主题下也一样 */
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-ctrl, 8px);
}

/* 正文：宽度锁定 375px（与真实手机一致），长单词/长链接强制折行，图片等比缩放。
   HTML 来自 buildWechatContentHtml，样式已内联，故这里只做兜底约束。 */
.tdp-body {
  width: 375px;
  max-width: 100%;
  margin: 0 auto;
  font-size: var(--fs-lg);
  line-height: 1.75;
  color: var(--color-text);
  word-wrap: break-word;
  word-break: break-word;
}
.tdp-body :deep(img) { max-width: 100%; height: auto; }
.tdp-body :deep(table) { max-width: 100%; }
.tdp-body :deep(pre) { white-space: pre-wrap; word-break: break-word; overflow-x: auto; }

.tdp-empty {
  margin: 0;
  padding: 40px 12px;
  color: var(--ds-text-3);
  font-size: 12.5px;
  line-height: 1.7;
  text-align: center;
}

.tdp-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  flex: none;
  padding-top: var(--space-1);
}

.tdp-btn {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-ctrl, 8px);
  background: var(--ds-card, #ffffff);
  color: var(--ds-text-2);
  font-family: inherit;
  font-size: var(--fs-caption);
  cursor: pointer;
}
.tdp-btn:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary-text); }
.tdp-btn--primary {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary, #3b82f6);
  color: #ffffff;
}
.tdp-btn--primary:hover { filter: brightness(0.94); }

/* 无匹配：虚线空态（与列表空态同语言） */
.td-empty {
  padding: 48px 16px;
  border: 1px dashed var(--ds-line, #ececf0);
  border-radius: var(--ds-radius-card, 12px);
  background: var(--ds-card, #ffffff);
  color: var(--ds-text-2);
  font-size: var(--fs-sm);
  text-align: center;
}

.td-hint { margin: 0; flex: none; font-size: var(--fs-caption); color: var(--ds-text-3); }

/* 窄屏降列：3 → 2 → 1，保证每张卡不会被压到放不下页脚按钮 */
@media (max-width: 1024px) {
  .td-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 820px) {
  .td-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 640px) {
  .td-grid { grid-template-columns: 1fr; }
  .td-card { min-height: 0; }
  .td { padding: 0 var(--space-3); }
  .tdp { padding: 0 var(--space-3); }
}
</style>

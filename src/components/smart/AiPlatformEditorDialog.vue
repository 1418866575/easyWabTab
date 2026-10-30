<script setup lang="ts">
/**
 * 智能网页端 新增 / 编辑弹框
 * 只记录链接与标识（不存密码/密钥）；网址实时校验，仅允许 https。
 */
import { computed, ref, watch } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Icon from '@/components/Icon.vue'
import IconPickerDialog from '@/components/IconPickerDialog.vue'
import {
  PLATFORM_ACCOUNT_MAX,
  PLATFORM_GROUP_MAX,
  PLATFORM_NAME_MAX,
  PLATFORM_NOTE_MAX,
  PLATFORM_PLAN_MAX,
  PLATFORM_UNGROUPED,
  validatePlatform,
  validatePlatformUrl,
  type PlatformIssue
} from '@/composables/aiPlatformsCore'
import type { AiPlatform } from '@/types'

const props = defineProps<{
  /** null = 新增 */
  platform: AiPlatform | null
  existing: AiPlatform[]
  groups: string[]
}>()

const emit = defineEmits<{
  close: []
  save: [payload: Partial<AiPlatform>]
}>()

const title = computed(() => (props.platform ? '编辑网页' : '新增网页'))

interface Draft {
  name: string
  url: string
  group: string
  accountLabel: string
  plan: string
  note: string
  icon: string
  pinned: boolean
  isFavorite: boolean
}

function toDraft(p: AiPlatform | null): Draft {
  return {
    name: p?.name ?? '',
    url: p?.url ?? '',
    group: p?.group && p.group !== PLATFORM_UNGROUPED ? p.group : '',
    accountLabel: p?.accountLabel ?? '',
    plan: p?.plan ?? '',
    note: p?.note ?? '',
    icon: p?.icon ?? '',
    pinned: p?.pinned ?? false,
    isFavorite: p?.isFavorite ?? false
  }
}

const draft = ref<Draft>(toDraft(props.platform))
const issues = ref<PlatformIssue[]>([])
const touchedUrl = ref(false)
const showIconPicker = ref(false)

watch(
  () => props.platform,
  p => {
    draft.value = toDraft(p)
    issues.value = []
    touchedUrl.value = false
  }
)

/** 网址实时反馈：输入中不报错，失焦或提交后才显示原因 */
const urlCheck = computed(() => validatePlatformUrl(draft.value.url))
const urlHint = computed(() => {
  if (!draft.value.url.trim()) return { kind: 'idle' as const, text: '填写网页地址（仅支持 https）' }
  if (urlCheck.value.ok) return { kind: 'ok' as const, text: '✓ 链接格式正确' }
  return { kind: touchedUrl.value ? ('error' as const) : ('idle' as const), text: touchedUrl.value ? urlCheck.value.error : '填写网页地址（仅支持 https）' }
})

function errorOf(field: string): string {
  return issues.value.find(i => i.field === field)?.message ?? ''
}

/** 分组候选项：已有分组 + 默认三组去重 */
const groupOptions = computed(() => {
  const set = new Set<string>()
  for (const g of props.groups) if (g && g !== PLATFORM_UNGROUPED) set.add(g)
  for (const p of props.existing) if (p.group && p.group !== PLATFORM_UNGROUPED && !p.deletedAt) set.add(p.group)
  return [...set]
})

function submit(): void {
  touchedUrl.value = true
  const payload = {
    name: draft.value.name,
    url: draft.value.url,
    group: draft.value.group || PLATFORM_UNGROUPED,
    accountLabel: draft.value.accountLabel,
    plan: draft.value.plan,
    note: draft.value.note,
    icon: draft.value.icon,
    pinned: draft.value.pinned,
    isFavorite: draft.value.isFavorite
  }
  const found = validatePlatform(payload, props.existing, props.platform?.id ?? null)
  issues.value = found
  if (found.length) return
  // 保存时统一用校验后的规范网址（无协议会自动补 https://）
  const check = validatePlatformUrl(draft.value.url)
  emit('save', { ...payload, url: check.ok ? check.url : draft.value.url.trim() })
}

function onIconSelected(src: string): void {
  draft.value.icon = src
  showIconPicker.value = false
}

const iconPreview = computed(() => {
  const icon = draft.value.icon
  if (!icon) return { kind: 'letter' as const, value: '' }
  if (icon.startsWith('builtin:')) return { kind: 'builtin' as const, value: icon.replace(/^builtin:/, '') }
  return { kind: 'image' as const, value: icon }
})
</script>

<template>
  <BaseDialog :title="title" width="620px" :close-on-overlay="false" :close-on-escape="false" @close="emit('close')">
    <form class="apf" @submit.prevent="submit">
      <section class="apf-sec">
        <h4 class="apf-sec-title">基础信息</h4>

        <label class="apf-field">
          <span class="apf-label">名称<span class="apf-req">*</span></span>
          <el-input
            v-model="draft.name"
            :maxlength="PLATFORM_NAME_MAX"
            placeholder="例如：通义千问"
            data-testid="ai-platform-editor-name"
          />
          <span v-if="errorOf('name')" class="apf-error">{{ errorOf('name') }}</span>
        </label>

        <label class="apf-field">
          <span class="apf-label">网址<span class="apf-req">*</span></span>
          <el-input
            v-model="draft.url"
            placeholder="https://…（不带协议会自动补 https://）"
            data-testid="ai-platform-editor-url"
            @blur="touchedUrl = true"
          />
          <span class="apf-hint" :class="`is-${urlHint.kind}`">{{ errorOf('url') || urlHint.text }}</span>
        </label>

        <label class="apf-field">
          <span class="apf-label">分组</span>
          <el-select
            v-model="draft.group"
            filterable
            allow-create
            default-first-option
            clearable
            :maxlength="PLATFORM_GROUP_MAX"
            placeholder="留空 = 未分组"
            data-testid="ai-platform-editor-group"
          >
            <el-option v-for="g in groupOptions" :key="g" :value="g" :label="g" />
          </el-select>
        </label>
      </section>

      <section class="apf-sec">
        <h4 class="apf-sec-title">
          账号与备注
          <span class="apf-sec-hint">（只存标识，不存密码）</span>
        </h4>

        <div class="apf-row">
          <label class="apf-field">
            <span class="apf-label">账号标识</span>
            <el-input
              v-model="draft.accountLabel"
              :maxlength="PLATFORM_ACCOUNT_MAX"
              placeholder="手机尾号 / 邮箱前缀 / 昵称"
              data-testid="ai-platform-editor-account"
            />
          </label>
          <label class="apf-field">
            <span class="apf-label">套餐</span>
            <el-input
              v-model="draft.plan"
              :maxlength="PLATFORM_PLAN_MAX"
              placeholder="如：免费版 / Plus"
              data-testid="ai-platform-editor-plan"
            />
          </label>
        </div>

        <label class="apf-field">
          <span class="apf-label">备注</span>
          <el-input
            v-model="draft.note"
            type="textarea"
            :rows="2"
            :maxlength="PLATFORM_NOTE_MAX"
            show-word-limit
            resize="vertical"
            placeholder="例如：擅长长文档总结；夜间高峰会排队"
            data-testid="ai-platform-editor-note"
          />
        </label>
      </section>

      <section class="apf-sec">
        <h4 class="apf-sec-title">图标与标记</h4>

        <!-- 图标与两个开关并成一行，减少弹框高度（否则 80vh 下要滚动才能看到开关） -->
        <div class="apf-icon-row">
          <span class="apf-icon-preview" aria-hidden="true">
            <Icon v-if="iconPreview.kind === 'builtin'" :name="iconPreview.value" :size="18" />
            <img v-else-if="iconPreview.kind === 'image'" :src="iconPreview.value" alt="" referrerpolicy="no-referrer" />
            <template v-else>{{ (draft.name || '?').trim().slice(0, 1).toUpperCase() }}</template>
          </span>
          <button type="button" class="ui-btn ui-btn--sm" data-testid="ai-platform-editor-icon" @click="showIconPicker = true">
            选择图标
          </button>
          <button v-if="draft.icon" type="button" class="ui-btn ui-btn--sm" @click="draft.icon = ''">恢复默认</button>

          <span class="apf-divider" aria-hidden="true"></span>

          <label class="apf-switch">
            <el-switch v-model="draft.pinned" data-testid="ai-platform-editor-pinned" />
            <span>置顶</span>
          </label>
          <label class="apf-switch">
            <el-switch v-model="draft.isFavorite" data-testid="ai-platform-editor-fav" />
            <span>收藏</span>
          </label>
        </div>
      </section>
    </form>

    <template #footer>
      <button type="button" class="ui-btn" @click="emit('close')">取消</button>
      <button type="button" class="ui-btn ui-btn--primary" data-testid="ai-platform-editor-save" @click="submit">保存</button>
    </template>
  </BaseDialog>

  <IconPickerDialog
    v-if="showIconPicker"
    title="选择网页图标"
    :current="draft.icon"
    @select="onIconSelected"
    @close="showIconPicker = false"
  />
</template>

<style scoped>
.apf {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.apf-sec {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.apf-sec-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
}
.apf-sec-hint {
  font-weight: 400;
  color: var(--color-text-muted);
  font-size: 12px;
}
.apf-row {
  display: flex;
  gap: 12px;
}
.apf-row > .apf-field {
  flex: 1;
  min-width: 0;
}
.apf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.apf-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
}
.apf-req {
  color: var(--color-error);
  margin-left: 2px;
}
.apf-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted);
}
.apf-hint.is-ok {
  color: var(--color-success);
}
.apf-hint.is-error {
  color: var(--color-error);
}
.apf-error {
  font-size: 12px;
  color: var(--color-error);
}

.apf-icon-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.apf-divider {
  width: 1px;
  height: 18px;
  background: var(--color-border);
  margin: 0 2px;
}
.apf-icon-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-hover);
  color: var(--color-text-secondary);
  font-weight: 600;
  overflow: hidden;
  flex: none;
}
.apf-icon-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.apf-switch {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
  cursor: pointer;
}
</style>

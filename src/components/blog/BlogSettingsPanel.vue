<script setup lang="ts">
/**
 * 博客设置（后台）
 *
 * 这些设置随 blog.json 信封同步到其它设备，因此只放「内容侧」配置；
 * 同时改多条时一次性提交整体 patch，避免反复写盘触发多次同步。
 */
import { computed, ref, watch } from 'vue'
import { useBlogStore } from '@/stores/blog'
import { collectSettingsErrors } from '@/composables/blogCore'
import type { BlogSort } from '@/types'
import { showConfirm, toastAlert } from '@/utils/dialog'

const store = useBlogStore()

const form = ref({ ...store.settings })

/** 远端/其它页面改动了设置（如云同步拉回）时把界面拉回最新 */
watch(
  () => store.settings,
  (v) => { form.value = { ...v } },
  { deep: true }
)

const SORT_OPTIONS: Array<{ value: BlogSort; label: string }> = [
  { value: 'updated-desc', label: '最近更新' },
  { value: 'updated-asc', label: '最早更新' },
  { value: 'created-desc', label: '最新创建' },
  { value: 'published-desc', label: '最近发布' },
  { value: 'views-desc', label: '阅读量' },
  { value: 'title-asc', label: '标题 A→Z' }
]

const errors = computed(() => collectSettingsErrors(form.value))
const dirty = computed(() => JSON.stringify(form.value) !== JSON.stringify(store.settings))

async function handleSave(): Promise<void> {
  const res = await store.updateSettings({ ...form.value })
  if (!res.ok) {
    toastAlert(res.errors?.join('；') ?? '保存失败', 'error')
    return
  }
  toastAlert('设置已保存', 'success')
}

function handleResetForm(): void {
  form.value = { ...store.settings }
}

async function handleRestoreDefaults(): Promise<void> {
  if (!await showConfirm('恢复为默认设置？已保存的内容（文章 / 分类 / 标签）不受影响。', '恢复默认')) return
  await store.resetSettings()
  form.value = { ...store.settings }
  toastAlert('已恢复默认设置', 'success')
}
</script>

<template>
  <section class="bs">
    <div class="bs-block">
      <h3 class="bs-title">站点信息</h3>
      <label class="bs-field">
        <span class="bs-label">博客名称</span>
        <el-input v-model="form.blogName" size="small" maxlength="50" data-testid="blog-settings-name" />
      </label>
      <label class="bs-field">
        <span class="bs-label">博客简介（用于首页头部与 SEO description）</span>
        <textarea v-model="form.blogDescription" rows="2" maxlength="200" class="bs-textarea"></textarea>
      </label>
      <label class="bs-field">
        <span class="bs-label">页脚信息（备案号等，留空不显示）</span>
        <el-input v-model="form.footer" size="small" maxlength="200" />
      </label>
    </div>

    <div class="bs-block">
      <h3 class="bs-title">阅读与列表</h3>
      <div class="bs-grid">
        <label class="bs-field">
          <span class="bs-label">每页文章数（1 ~ 100）</span>
          <el-input-number v-model="form.pageSize" size="small" :min="1" :max="100" :step="1" />
        </label>
        <label class="bs-field">
          <span class="bs-label">默认排序</span>
          <select v-model="form.defaultSort" class="bs-select" data-testid="blog-settings-sort">
            <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </select>
        </label>
        <label class="bs-field">
          <span class="bs-label">置顶上限（0 ~ 20）</span>
          <el-input-number v-model="form.pinLimit" size="small" :min="0" :max="20" :step="1" />
        </label>
        <label class="bs-field">
          <span class="bs-label">自动摘要长度（20 ~ 500）</span>
          <el-input-number v-model="form.excerptLength" size="small" :min="20" :max="500" :step="10" />
        </label>
      </div>
    </div>

    <div class="bs-block">
      <h3 class="bs-title">编辑器与本地会话</h3>
      <div class="bs-grid">
        <label class="bs-field">
          <span class="bs-label">自动保存间隔（1 ~ 60 秒）</span>
          <el-input-number v-model="form.autoSaveSeconds" size="small" :min="1" :max="60" :step="1" />
        </label>
        <label class="bs-field">
          <span class="bs-label">本地会话超时（5 ~ 1440 分钟）</span>
          <el-input-number v-model="form.sessionTimeoutMin" size="small" :min="5" :max="1440" :step="5" />
        </label>
      </div>
      <p class="bs-hint">本地会话超时仅作用于本机后台登录态；本项目无服务端，故它不是服务端会话。</p>
    </div>

    <ul v-if="errors.length" class="bs-errors" data-testid="blog-settings-errors">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>

    <footer class="bs-foot">
      <button type="button" class="ui-btn ui-btn--sm ui-btn--danger" @click="handleRestoreDefaults">恢复默认</button>
      <span class="bs-spacer" />
      <button type="button" class="ui-btn ui-btn--sm" :disabled="!dirty" @click="handleResetForm">放弃改动</button>
      <button
        type="button"
        class="ui-btn ui-btn--sm ui-btn--primary"
        :disabled="errors.length > 0 || !dirty"
        data-testid="blog-settings-save"
        @click="handleSave"
      >
        保存设置
      </button>
    </footer>
  </section>
</template>

<style scoped>
.bs { display: flex; flex-direction: column; gap: 12px; max-width: 720px; }

.bs-block {
  padding: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg, 12px);
  background-color: var(--color-bg-card, #ffffff);
}

.bs-title {
  margin: 0 0 10px;
  font-size: var(--font-size-sm, 13px);
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #0f172a);
}

.bs-field { display: block; margin-bottom: 10px; }

.bs-label { display: block; margin-bottom: 4px; color: var(--color-text-secondary, #64748b); font-size: var(--font-size-xs, 12px); }

.bs-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; }

.bs-select {
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-size: var(--font-size-xs, 12px);
}

.bs-textarea {
  width: 100%;
  padding: 6px 8px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-sm, 6px);
  background-color: var(--color-bg-input, #ffffff);
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  line-height: var(--line-height-relaxed, 1.6);
  resize: vertical;
}

.bs-hint { margin: 0; color: var(--color-text-muted, #94a3b8); font-size: var(--font-size-xs, 12px); }

.bs-errors {
  margin: 0;
  padding: 8px 12px 8px 28px;
  border: 1px solid var(--color-error, #ef4444);
  border-radius: var(--radius-md, 8px);
  background-color: var(--color-error-soft, #fee2e2);
  color: var(--color-error, #ef4444);
  font-size: var(--font-size-xs, 12px);
  line-height: var(--line-height-relaxed, 1.7);
}

.bs-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.bs-spacer { flex: 1 1 auto; }

@media (max-width: 768px) {
  .bs-grid { grid-template-columns: 1fr; }
  .bs-foot .ui-btn { min-height: 44px; }
}
</style>

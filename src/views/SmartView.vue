<script setup lang="ts">
/**
 * 智能工作台主视图（路由 /smart）
 * 与「工作台 / 销售 / 学生 / 老师」平级的一级模块：技能库 + 提示词库。
 * 布局沿用项目既有外壳：顶部返回导航站 + 标题 + Tab 切换，内容区按 Tab 条件渲染。
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Icon from '@/components/Icon.vue'
import SmartOverview from '@/components/smart/SmartOverview.vue'
import SkillManager from '@/components/smart/SkillManager.vue'
import PromptManager from '@/components/smart/PromptManager.vue'
import { useSmartStore } from '@/stores/smart'

const router = useRouter()
const store = useSmartStore()

type TabKey = 'overview' | 'skills' | 'prompts'
const tab = ref<TabKey>('overview')

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: '概览', icon: 'chart' },
  { key: 'skills', label: '技能管理', icon: 'toolbox' },
  { key: 'prompts', label: '提示词管理', icon: 'notes' }
]

const counts = computed(() => ({
  skills: store.skills.length,
  prompts: store.prompts.length
}))

function backHome(): void {
  void router.push({ name: 'home' })
}
</script>

<template>
  <div class="sv-shell">
    <header class="sv-topbar">
      <div class="sv-topbar-left">
        <button type="button" class="sv-back" title="返回导航站" data-testid="smart-back-home" @click="backHome">
          <Icon name="arrow-left" :size="16" />
          <span class="sv-back-text">导航站</span>
        </button>
        <h1 class="sv-title">智能工作台</h1>
        <p class="sv-sub">把反复重写的 AI 技能与提示词，沉淀成可检索、可复用、可搬运的资产库</p>
      </div>
    </header>

    <nav class="sv-tabs" role="tablist" aria-label="智能工作台功能切换">
      <button
        v-for="t in TABS"
        :key="t.key"
        type="button"
        class="sv-tab"
        :class="{ 'is-on': tab === t.key }"
        role="tab"
        :aria-selected="tab === t.key"
        :data-testid="`smart-tab-${t.key}`"
        @click="tab = t.key"
      >
        <Icon :name="t.icon" :size="15" />
        <span>{{ t.label }}</span>
        <span v-if="t.key !== 'overview'" class="sv-tab-count">{{ counts[t.key] }}</span>
      </button>
    </nav>

    <main class="sv-content">
      <SmartOverview v-if="tab === 'overview'" @goto="k => (tab = k)" />
      <SkillManager v-else-if="tab === 'skills'" />
      <PromptManager v-else />
    </main>
  </div>
</template>

<style scoped>
.sv-shell {
  min-height: 100vh;
  padding: 16px clamp(12px, 3vw, 28px) 48px;
  background: var(--color-bg, #f8fafc);
  color: var(--color-text, #111827);
}

.sv-topbar { margin-bottom: 14px; }
.sv-topbar-left { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.sv-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 8px;
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
  cursor: pointer;
}
.sv-back:hover { border-color: var(--color-primary, #3b82f6); color: var(--color-primary, #3b82f6); }
.sv-title {
  margin: 0;
  font-size: clamp(20px, 4vw, 26px);
  font-weight: 700;
  color: var(--color-text, #111827);
}
.sv-sub { margin: 0; font-size: 13px; color: var(--color-text-secondary, #6b7280); }

.sv-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
.sv-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 6px 14px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 999px;
  background: var(--color-bg-card, #fff);
  color: var(--color-text-secondary, #6b7280);
  font-size: 13px;
  cursor: pointer;
}
.sv-tab.is-on {
  border-color: var(--color-primary, #3b82f6);
  background: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
  font-weight: 600;
}
.sv-tab-count {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--color-bg-hover, #f3f4f6);
  font-size: 11px;
  color: var(--color-text-muted, #9ca3af);
}

.sv-content { max-width: 1280px; }

/* 移动端：底部固定 Tab Bar（拇指可达），与业务模块一致的 44px 触控 */
@media (max-width: 768px) {
  .sv-shell { padding-bottom: 96px; }
  .sv-tabs {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    gap: 0;
    margin: 0;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-bg-card, #fff);
    overflow-x: auto;
  }
  .sv-tab {
    flex: 1 1 0;
    justify-content: center;
    min-height: 44px;
    border: none;
    border-radius: 10px;
  }
  .sv-tab.is-on { background: var(--color-primary-soft, #eff6ff); }
  .sv-back-text { display: none; }
}
</style>

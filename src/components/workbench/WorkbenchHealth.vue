<script setup lang="ts">
import { HEALTH_TABS, type HealthModule } from '@/types'
import BaseTabs from '@/components/common/BaseTabs.vue'
import WorkbenchExercise from './WorkbenchExercise.vue'
import WorkbenchDiet from './WorkbenchDiet.vue'
import WorkbenchSleep from './WorkbenchSleep.vue'
import WorkbenchWeight from './WorkbenchWeight.vue'

const TAB_META: Record<HealthModule, { label: string; icon: string }> = {
  exercise: { label: '运动', icon: 'exercise' },
  diet: { label: '饮食', icon: 'diet' },
  sleep: { label: '睡眠', icon: 'sleep' },
  weight: { label: '体重', icon: 'weight' },
  // height 只在独立健康工作台 /health 使用，不进 HEALTH_TABS（个人工作台不渲染该页签）
  height: { label: '身高', icon: 'account-multiple' },
}

const tabItems = HEALTH_TABS.map((t) => ({ value: t, label: TAB_META[t].label, icon: TAB_META[t].icon }))

defineProps<{ activeTab: HealthModule }>()
const emit = defineEmits<{ change: [tab: HealthModule] }>()
</script>

<template>
  <div class="wb-health">
    <BaseTabs
      :model-value="activeTab"
      :items="tabItems"
      testid="hd-tab"
      data-testid="hd-tabs"
      @update:model-value="emit('change', $event as HealthModule)"
    />

    <WorkbenchExercise v-if="activeTab === 'exercise'" />
    <WorkbenchDiet v-else-if="activeTab === 'diet'" />
    <WorkbenchSleep v-else-if="activeTab === 'sleep'" />
    <WorkbenchWeight v-else-if="activeTab === 'weight'" />
  </div>
</template>

<style scoped>
.wb-health {
  width: 100%;
  /* 健康子面板弹框统一层级：变量在此唯一定义，4 个子面板只引用、不再各写 z-index:320。
     取值对齐 BaseDialog 基准层级 300（见 common/BaseDialog.vue .bd-overlay）；
     学生端等独立容器若未套 .wb-health，由子面板的 var() fallback 兜底。 */
  --wb-dialog-z: 300;
}

/* flex 列布局由外壳自己承担（原由 4 个子面板各自用 :global(.wb-health) 重复注入）：
   桌面端让当前激活子面板 flex:1 钉满内容区，移动端保持块级堆叠不变。 */
@media (min-width: 769px) {
  .wb-health {
    display: flex;
    flex-direction: column;
  }
}
</style>

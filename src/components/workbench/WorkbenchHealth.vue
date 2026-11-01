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
}

</style>

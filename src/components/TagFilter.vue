<script setup lang="ts">
import Icon from './Icon.vue'
import { useSitesStore } from '../stores/sites'

const store = useSitesStore()
</script>

<template>
  <div class="tag-filter">
    <div class="tag-list">
      <button
        v-for="tag in store.tagsByCategory"
        :key="tag"
        class="tag"
        :class="{ active: store.selectedTags.includes(tag) }"
        @click="store.toggleTag(tag)"
      >
        {{ tag }}
      </button>
    </div>
    <div class="filter-actions">
      <button
        v-if="store.invalidCount > 0"
        class="invalid-toggle"
        :class="{ active: store.showOnlyInvalid }"
        @click="store.showOnlyInvalid = !store.showOnlyInvalid"
      >
        <Icon name="alert" /> 只看无效 ({{ store.invalidCount }})
      </button>
      <button
        v-if="store.selectedTags.length > 0 || store.showOnlyInvalid"
        class="clear-btn"
        @click="store.showOnlyInvalid = false; store.clearFilters()"
      >
        清除筛选
      </button>
    </div>
  </div>
</template>

<style scoped>
.tag-filter {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

.tag-list {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.tag {
  padding: 6px 14px;
  border: 1px solid var(--ds-line);
  border-radius: 20px;
  background-color: white;
  font-size: var(--fs-sm, 13px);
  color: var(--ds-text-2);
  cursor: pointer;
  transition: all 0.2s;
}

.tag:hover {
  border-color: var(--ds-primary);
  color: var(--ds-primary-text);
}

.tag.active {
  background-color: var(--ds-primary);
  border-color: var(--ds-primary);
  color: white;
}

.filter-actions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.invalid-toggle {
  padding: 6px 14px;
  border: 1px solid var(--ds-warning);
  border-radius: 20px;
  background-color: #fffbeb;
  color: var(--color-warning-text);
  font-size: var(--fs-sm, 13px);
  cursor: pointer;
  transition: all 0.2s;
}

.invalid-toggle:hover {
  background-color: var(--ds-warning-soft);
  border-color: var(--ds-warning);
}

.invalid-toggle.active {
  background-color: var(--ds-warning);
  border-color: var(--ds-warning);
  color: white;
}

.clear-btn {background: none;
  border: none;
  color: var(--ds-text-2);
  font-size: var(--fs-caption, 12px);
  cursor: pointer;
  text-decoration: underline;
  height: 36px;}

.clear-btn:hover {
  color: var(--ds-primary-text);
}
</style>

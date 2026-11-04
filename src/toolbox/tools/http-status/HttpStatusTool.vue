<script setup lang="ts">
/**
 * HTTP 状态码速查：分类浏览 + 关键字搜索
 */
import { computed, ref } from 'vue'
import { CATS, searchStatus, statusColor, type StatusCat } from './httpStatusData'
import TuField from '../../components/tool/TuField.vue'

const q = ref('')
const cat = ref<StatusCat | 'all'>('all')
const list = computed(() => searchStatus(q.value, cat.value))
const total = computed(() => list.value.length)
</script>

<template>
  <div class="tu-t1">
    <div class="tu-row">
      <div class="tu-seg hs-segs">
        <button type="button" :class="{ 'is-on': cat === 'all' }" @click="cat = 'all'">全部</button>
        <button v-for="c in CATS" :key="c.id" type="button" :class="{ 'is-on': cat === c.id }" @click="cat = c.id">{{ c.name }}</button>
      </div>
    </div>

    <TuField label="搜索" hint="支持状态码、英文短语、中文说明与典型场景">
      <input v-model="q" type="text" class="tu-input" placeholder="例如：404 / Not Found / 未找到 / 限流" />
    </TuField>

    <p class="tu-hint hs-count">共 {{ total }} 条</p>

    <div v-if="list.length" class="tu-table-wrap">
      <table class="tu-table">
        <thead>
          <tr><th class="hs-code">状态码</th><th>说明</th><th>典型场景</th></tr>
        </thead>
        <tbody>
          <tr v-for="s in list" :key="s.code">
            <td class="hs-code">
              <span class="hs-badge" :class="'hs-' + statusColor(s.cat)">{{ s.code }}</span>
            </td>
            <td>
              <div class="hs-cn">{{ s.cn }}</div>
              <div class="hs-phrase">{{ s.phrase }}</div>
            </td>
            <td class="hs-scene">{{ s.scene }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="tu-hint">没有匹配的状态码。</p>

    <p class="tu-hint">纯内置数据速查，无需联网；非标准私有状态码（各厂商自定义）不在收录范围。</p>
  </div>
</template>

<style scoped>
.hs-segs { flex-wrap: wrap; }
.hs-count { margin-top: 0; }
.hs-code { width: 92px; }
.hs-badge {
  display: inline-block;
  min-width: 46px;
  text-align: center;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  font-family: var(--font-family-mono);
  font-size: 12.5px;
}
.hs-ok { background: var(--color-success-soft); color: var(--color-success-text); }
.hs-info { background: var(--color-primary-soft); color: var(--color-primary); }
.hs-err { background: var(--color-error-soft); color: var(--color-error-text); }
.hs-cn { font-size: var(--fs-sm); color: var(--color-text); }
.hs-phrase { font-size: var(--fs-caption); color: var(--color-text-muted); font-family: var(--font-family-mono); }
.hs-scene { font-size: var(--fs-caption); color: var(--color-text-secondary); }
</style>

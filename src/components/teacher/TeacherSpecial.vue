<script setup lang="ts">
// 隐私信息：名单 + 逐人档案（过敏原 / 慢性疾病 / 注意事项 / 家长紧急电话）。
// special 标记会同步到花名册与座位表的红色「!」角标；该页仅班主任可见。

import { computed, ref } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import TeacherStatCard from './TeacherStatCard.vue'
import { sortedStudents } from '@/composables/teacherCore'
import { exportExcel, excelFileName } from '@/composables/teacherExcelCore'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))
const specials = computed(() => students.value.filter((s) => s.special))

const addId = ref('')
const candidates = computed(() => students.value.filter((s) => !s.special))

async function onAdd(): Promise<void> {
  if (!addId.value) return
  await store.updateStudent(addId.value, { special: true })
  addId.value = ''
}

async function onField(id: string, field: 'allergy' | 'disease' | 'notes' | 'emergencyPhone', value: string): Promise<void> {
  const s = students.value.find((x) => x.id === id)
  if (!s) return
  await store.updateStudent(id, { health: { ...s.health, [field]: value } })
}

async function onUnmark(id: string): Promise<void> {
  if (!window.confirm('取消该学生的特异体质标记？（档案内容保留）')) return
  await store.updateStudent(id, { special: false })
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const rows = specials.value.map((s) => [
    s.name,
    s.no,
    s.gender,
    s.health.allergy,
    s.health.disease,
    s.health.emergencyPhone,
    s.health.notes
  ])
  await exportExcel(excelFileName('特异体质学生', store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '特异体质学生', headers: ['姓名', '学号', '性别', '过敏原', '慢性疾病', '家长紧急电话', '注意事项'], rows }
  ])
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">隐私信息</h3>
        <p class="tw-subtitle">属隐私敏感信息，仅班主任可见；标记后花名册与座位表会显示红色「!」角标。</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn" @click="exportExcelFile">导出 Excel</button>
      </div>
    </div>

    <section class="tw-stat-grid">
      <TeacherStatCard :value="specials.length" label="特异体质人数" accent="#ef4444" />
      <TeacherStatCard :value="students.length" label="班级总人数" accent="#6da3d8" />
    </section>

    <section class="tw-card tw-no-print">
      <h4 class="tw-card-title">添加特异体质学生</h4>
      <div class="tw-toolbar">
        <select v-model="addId" class="tw-select">
          <option value="">选择学生…</option>
          <option v-for="s in candidates" :key="s.id" :value="s.id">{{ s.no }} {{ s.name }}</option>
        </select>
        <button type="button" class="tw-btn tw-btn-primary" :disabled="!addId" @click="onAdd">标记为特异体质</button>
        <span v-if="!candidates.length" class="tw-label">全部学生已标记</span>
      </div>
    </section>

    <section v-if="specials.length" class="tw-card">
      <h4 class="tw-card-title">学生档案</h4>
      <div class="sp-list">
        <article v-for="s in specials" :key="s.id" class="sp-item">
          <header class="sp-head">
            <span class="sp-name">{{ s.name }}</span>
            <span class="sp-meta">{{ s.no }} · {{ s.gender }}</span>
            <span class="tw-spacer"></span>
            <button type="button" class="tw-btn tw-btn-sm tw-btn-danger tw-no-print" @click="onUnmark(s.id)">取消标记</button>
          </header>
          <div class="sp-grid">
            <label class="tw-label">过敏原<input class="tw-input tw-input-sm" :value="s.health.allergy" @change="onField(s.id, 'allergy', ($event.target as HTMLInputElement).value)" /></label>
            <label class="tw-label">慢性疾病<input class="tw-input tw-input-sm" :value="s.health.disease" @change="onField(s.id, 'disease', ($event.target as HTMLInputElement).value)" /></label>
            <label class="tw-label">家长紧急电话<input class="tw-input tw-input-sm" :value="s.health.emergencyPhone" @change="onField(s.id, 'emergencyPhone', ($event.target as HTMLInputElement).value)" /></label>
          </div>
          <label class="tw-label sp-notes">注意事项
            <textarea class="tw-input sp-textarea" :value="s.health.notes" rows="2" @change="onField(s.id, 'notes', ($event.target as HTMLTextAreaElement).value)"></textarea>
          </label>
        </article>
      </div>
    </section>

    <p v-else class="tw-empty">还没有特异体质学生记录。</p>
  </div>
</template>

<style scoped>
.sp-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sp-item {
  padding: 12px;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-md, 12px);
}

.sp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.sp-name {
  font-weight: var(--font-weight-semibold, 600);
  color: var(--color-text, #0f172a);
}

.sp-meta {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-muted, #94a3b8);
}

.sp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.sp-grid .tw-label {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.sp-notes {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-top: 8px;
}

.sp-textarea {
  width: 100%;
  min-height: 56px;
  padding: 8px;
  line-height: var(--line-height-normal, 1.5);
}
</style>

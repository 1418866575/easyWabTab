<script setup lang="ts">
// 奖励记录：左侧选学生（搜索 + 记录数徽标），右侧时间线（日期/标题/内容/图片）。
// 原「学生成长档案」，归入基础功能并改名，数据结构不变（沿用 growth 桶）。
// 图片上传走 canvas 压缩（宽 800px、JPEG 0.8），base64 存储，单条最多 9 张。

import { computed, ref, watch } from 'vue'
import { useTeacherStore } from '@/stores/teacher'
import { sortedStudents } from '@/composables/teacherCore'
import type { GrowthRecord } from '@/types/teacher'

const store = useTeacherStore()

const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))
const keyword = ref('')
const selectedId = ref('')

const filtered = computed(() => {
  const k = keyword.value.trim()
  return k ? students.value.filter((s) => s.name.includes(k)) : students.value
})

watch(
  () => students.value.map((s) => s.id).join(','),
  () => {
    if (!students.value.some((s) => s.id === selectedId.value)) selectedId.value = students.value[0]?.id ?? ''
  },
  { immediate: true }
)

const records = computed<GrowthRecord[]>(() => {
  const list = b.value?.growth[selectedId.value] ?? []
  return [...list].sort((a, b2) => (a.date < b2.date ? 1 : a.date > b2.date ? -1 : 0))
})

const countOf = (id: string): number => (b.value?.growth[id] ?? []).length

// ---------- 新增 / 编辑 ----------
const editingId = ref('')
const formDate = ref('')
const formTitle = ref('')
const formContent = ref('')
const formPhotos = ref<string[]>([])

function todayStr(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function resetForm(): void {
  editingId.value = ''
  formDate.value = todayStr()
  formTitle.value = ''
  formContent.value = ''
  formPhotos.value = []
}

resetForm()

async function onSubmit(): Promise<void> {
  if (!selectedId.value || !formTitle.value.trim()) return
  const payload = {
    date: formDate.value || todayStr(),
    title: formTitle.value.trim(),
    content: formContent.value.trim(),
    photos: [...formPhotos.value]
  }
  if (editingId.value) {
    await store.updateGrowth(selectedId.value, { ...payload, id: editingId.value })
  } else {
    await store.addGrowth(selectedId.value, payload)
  }
  resetForm()
}

function onEdit(r: GrowthRecord): void {
  editingId.value = r.id
  formDate.value = r.date
  formTitle.value = r.title
  formContent.value = r.content
  formPhotos.value = [...r.photos]
}

async function onRemove(r: GrowthRecord): Promise<void> {
  if (!window.confirm(`删除记录「${r.title}」？`)) return
  await store.removeGrowth(selectedId.value, r.id)
  if (editingId.value === r.id) resetForm()
}

// ---------- 图片：压缩到 800px / JPEG 0.8 ----------
const MAX_PHOTOS = 9
const photoInput = ref<HTMLInputElement | null>(null)

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败'))
      img.onload = () => {
        const maxW = 800
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('画布不可用'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.8))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

async function onPhotos(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return
  try {
    for (const f of files) {
      if (formPhotos.value.length >= MAX_PHOTOS) break
      formPhotos.value.push(await compressImage(f))
    }
  } catch (err) {
    window.alert(err instanceof Error ? err.message : String(err))
  } finally {
    input.value = ''
  }
}

function removePhoto(i: number): void {
  formPhotos.value.splice(i, 1)
}

function exportArchive(): void {
  window.print()
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">奖励记录</h3>
        <p class="tw-subtitle">为每位学生记录奖励与表扬；图片自动压缩后保存，单条最多 {{ MAX_PHOTOS }} 张。</p>
      </div>
      <div class="tw-toolbar tw-no-print">
        <button type="button" class="tw-btn" :disabled="!selectedId" @click="exportArchive">导出记录</button>
      </div>
    </div>

    <div class="gr-layout">
      <aside class="gr-side tw-card">
        <h4 class="tw-card-title">选择学生</h4>
        <el-input v-model="keyword" size="small" class="gr-search" placeholder="搜索姓名" />
        <div class="gr-students">
          <button
            v-for="s in filtered"
            :key="s.id"
            type="button"
            class="gr-student"
            :class="{ active: s.id === selectedId }"
            @click="selectedId = s.id"
          >
            <span class="gr-student-name">{{ s.name }}</span>
            <span class="gr-badge">{{ countOf(s.id) }}</span>
          </button>
          <p v-if="!filtered.length" class="tw-empty">没有匹配的学生。</p>
        </div>
      </aside>

      <section class="gr-main">
        <div class="tw-card">
          <h4 class="tw-card-title">{{ editingId ? '编辑记录' : '添加记录' }}</h4>
          <div class="gr-form">
            <label class="tw-label">日期<el-date-picker v-model="formDate" type="date" size="small" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 100%" /></label>
            <label class="tw-label gr-flex">标题<el-input v-model="formTitle" size="small" placeholder="如 期中进步之星" /></label>
          </div>
          <el-input v-model="formContent" type="textarea" class="gr-textarea" :rows="3" placeholder="记录内容…" />
          <div class="tw-toolbar gr-photo-bar">
            <button type="button" class="tw-btn tw-btn-sm" @click="photoInput?.click()">添加图片</button>
            <input ref="photoInput" type="file" accept="image/*" multiple class="gr-file" @change="onPhotos" />
            <span class="tw-label">{{ formPhotos.length }} / {{ MAX_PHOTOS }}</span>
            <span class="tw-spacer"></span>
            <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" :disabled="!formTitle.trim() || !selectedId" @click="onSubmit">
              {{ editingId ? '保存修改' : '添加记录' }}
            </button>
            <button v-if="editingId" type="button" class="tw-btn tw-btn-sm" @click="resetForm">取消</button>
          </div>
          <div v-if="formPhotos.length" class="gr-photos">
            <div v-for="(p, i) in formPhotos" :key="i" class="gr-photo">
              <img :src="p" alt="记录图片" />
              <button type="button" class="gr-photo-del" @click="removePhoto(i)">×</button>
            </div>
          </div>
        </div>

        <div class="tw-card">
          <h4 class="tw-card-title">奖励时间线</h4>
          <ol v-if="records.length" class="gr-timeline">
            <li v-for="r in records" :key="r.id" class="gr-item">
              <div class="gr-dot"></div>
              <div class="gr-body">
                <div class="gr-item-head">
                  <span class="gr-date">{{ r.date }}</span>
                  <strong class="gr-item-title">{{ r.title }}</strong>
                  <span class="tw-spacer"></span>
                  <button type="button" class="tw-btn tw-btn-sm tw-no-print" @click="onEdit(r)">编辑</button>
                  <button type="button" class="tw-btn tw-btn-sm tw-btn-danger tw-no-print" @click="onRemove(r)">删除</button>
                </div>
                <p v-if="r.content" class="gr-content">{{ r.content }}</p>
                <div v-if="r.photos.length" class="gr-photos">
                  <img v-for="(p, i) in r.photos" :key="i" :src="p" alt="记录图片" class="gr-photo-img" />
                </div>
              </div>
            </li>
          </ol>
          <p v-else class="tw-empty">这位学生还没有奖励记录。</p>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.gr-layout {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: var(--space-4, 16px);
  align-items: start;
}

.gr-side {
  position: sticky;
  top: 8px;
}

.gr-search {
  width: 100%;
  margin-bottom: 8px;
}

.gr-students {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 420px;
  overflow-y: auto;
}

.gr-student {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 8px;
  border: none;
  border-radius: var(--radius-sm, 4px);
  background-color: transparent;
  color: var(--color-text, #0f172a);
  font-family: inherit;
  font-size: var(--font-size-sm, 13px);
  text-align: left;
  cursor: pointer;
}

.gr-student:hover {
  background-color: var(--color-bg-hover, #f1f5f9);
}

.gr-student.active {
  background-color: var(--color-primary-soft, #eff6ff);
  color: var(--color-primary, #3b82f6);
}

.gr-student-name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.gr-badge {
  flex-shrink: 0;
  min-width: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background-color: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-secondary, #64748b);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.gr-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
  min-width: 0;
}

.gr-form {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.gr-form .tw-label {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.gr-flex {
  flex: 1 1 200px;
}

.gr-textarea {
  width: 100%;
  padding: 8px;
  line-height: var(--line-height-normal, 1.5);
}

.gr-photo-bar {
  margin-top: 8px;
}

.gr-file {
  display: none;
}

.gr-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.gr-photo {
  position: relative;
}

.gr-photo img,
.gr-photo-img {
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: var(--radius-sm, 4px);
  border: 1px solid var(--color-border, #e2e8f0);
}

.gr-photo-del {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background-color: var(--color-danger, #ef4444);
  color: #fff;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}

.gr-timeline {
  margin: 0;
  padding: 0;
  list-style: none;
}

.gr-item {
  position: relative;
  display: flex;
  gap: 10px;
  padding-bottom: 14px;
}

.gr-dot {
  flex-shrink: 0;
  width: 10px;
  height: 10px;
  margin-top: 6px;
  border-radius: 50%;
  background-color: var(--color-primary, #3b82f6);
}

.gr-body {
  flex: 1 1 auto;
  min-width: 0;
}

.gr-item-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.gr-date {
  font-size: var(--font-size-xs, 12px);
  color: var(--color-text-muted, #94a3b8);
}

.gr-item-title {
  font-size: var(--font-size-base, 14px);
  color: var(--color-text, #0f172a);
}

.gr-content {
  margin: 4px 0 0;
  font-size: var(--font-size-sm, 13px);
  color: var(--color-text-secondary, #64748b);
  line-height: var(--line-height-normal, 1.5);
  white-space: pre-wrap;
}

@media (max-width: 768px) {
  .gr-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .gr-side {
    position: static;
  }

  .gr-students {
    max-height: 180px;
  }
}
</style>

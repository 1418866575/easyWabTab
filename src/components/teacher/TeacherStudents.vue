<script setup lang="ts">
// 学生信息：统计卡 + 班级花名册（男蓝/女粉、特异体质红色「!」角标）+ 可编辑明细表（含家庭地址）。
// 明细表改动即存（onchange → store → IndexedDB），与项目其它面板「修改后自动保存」一致。
// 「导入学生信息 / 下载模板」复用设置页「导入数据」的既有能力（teacherImportCore + store.importStudents），
// 模板表头与学生名单解析（mapHeaders）共用 teacherExcelCore 的 exportStudentTemplateExcel，避免两处不一致。

import { computed, ref, reactive, watch } from 'vue'
import { usePageSize } from '@/composables/usePageSize'
import { useTeacherStore } from '@/stores/teacher'
import TeacherStatCard from './TeacherStatCard.vue'
import { sortedStudents } from '@/composables/teacherCore'
import { exportExcel, excelFileName, exportStudentTemplateExcel } from '@/composables/teacherExcelCore'
import { fileToRows, rowsToStudents } from '@/composables/teacherImportCore'
import { useToast } from '@/composables/useToast'
import type { Student } from '@/types/teacher'

const store = useTeacherStore()
const toast = useToast()

const keyword = ref('')
const b = computed(() => store.bucket)
const students = computed(() => sortedStudents(b.value?.students ?? []))

const filtered = computed(() => {
  const k = keyword.value.trim().toLowerCase()
  if (!k) return students.value
  return students.value.filter((s) => s.name.toLowerCase().includes(k) || s.no.toLowerCase().includes(k))
})

const maleCount = computed(() => students.value.filter((s) => s.gender === '男').length)
const femaleCount = computed(() => students.value.filter((s) => s.gender === '女').length)
const specialCount = computed(() => students.value.filter((s) => s.special).length)
const parentCount = computed(() => Object.keys(b.value?.parents ?? {}).length)
const boardingCount = computed(() => students.value.filter((s) => s.boarding).length)

const LIST_PAGE_SIZE = 10

// ---------- 明细表组合搜索（学号精确 / 名称精确 / 名称模糊 / 是否班委 / 是否住校；多条件 AND） ----------
const searchNo = ref('')
const searchNameExact = ref('')
const searchNameFuzzy = ref('')
const searchCommittee = ref<'all' | 'yes' | 'no'>('all')
const searchBoarding = ref<'all' | 'yes' | 'no'>('all')

// applied 为「已点击搜索」生效的查询条件；草稿（searchXxx）仅在点击搜索/重置时写入，符合「点击搜索按钮才过滤」
const applied = reactive({
  no: '',
  nameExact: '',
  nameFuzzy: '',
  committee: 'all' as 'all' | 'yes' | 'no',
  boarding: 'all' as 'all' | 'yes' | 'no'
})

function runSearch(): void {
  applied.no = searchNo.value.trim()
  applied.nameExact = searchNameExact.value.trim()
  applied.nameFuzzy = searchNameFuzzy.value.trim().toLowerCase()
  applied.committee = searchCommittee.value
  applied.boarding = searchBoarding.value
}

function resetSearch(): void {
  searchNo.value = ''
  searchNameExact.value = ''
  searchNameFuzzy.value = ''
  searchCommittee.value = 'all'
  searchBoarding.value = 'all'
  runSearch()
}

const detailFiltered = computed(() =>
  students.value.filter((s) => {
    if (applied.no && s.no !== applied.no) return false
    if (applied.nameExact && s.name !== applied.nameExact) return false
    if (applied.nameFuzzy && !s.name.toLowerCase().includes(applied.nameFuzzy)) return false
    if (applied.committee === 'yes' && !s.post.trim()) return false
    if (applied.committee === 'no' && s.post.trim()) return false
    if (applied.boarding === 'yes' && !s.boarding) return false
    if (applied.boarding === 'no' && s.boarding) return false
    return true
  })
)

// ---------- 分页（复用项目 usePageSize + el-pagination 范式） ----------
const { pageSize, PAGE_SIZES } = usePageSize('teacher-students-pager', LIST_PAGE_SIZE)
const currentPage = ref(1)
const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return detailFiltered.value.slice(start, start + pageSize.value)
})
watch(applied, () => { currentPage.value = 1 }, { deep: true })

// ---------- 新增（弹框） ----------
const showAdd = ref(false)
const form = reactive({
  name: '',
  no: '',
  gender: '男' as '男' | '女',
  phone: '',
  address: '',
  boarding: false,
  avatar: ''
})
const avatarInput = ref<HTMLInputElement | null>(null)

const currentClassName = computed(() => (store.cls ? `${store.cls.grade}${store.cls.name}` : '—'))

const MAX_AVATAR_SIZE = 2 * 1024 * 1024
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

function resetAddForm(): void {
  form.name = ''
  form.no = ''
  form.gender = '男'
  form.phone = ''
  form.address = ''
  form.boarding = false
  form.avatar = ''
}

function openAddDialog(): void {
  resetAddForm()
  showAdd.value = true
}

function closeAddDialog(): void {
  showAdd.value = false
  resetAddForm()
}

function onAvatarChange(e: Event): void {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!AVATAR_TYPES.includes(file.type)) {
    toast.error('仅支持 JPG / PNG / GIF / WebP 格式')
    input.value = ''
    return
  }
  if (file.size > MAX_AVATAR_SIZE) {
    toast.error('图片大小不能超过 2MB')
    input.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.avatar = typeof reader.result === 'string' ? reader.result : ''
  }
  reader.onerror = () => toast.error('图片读取失败')
  reader.readAsDataURL(file)
  input.value = ''
}

function clearAvatar(): void {
  form.avatar = ''
}

async function saveAdd(): Promise<void> {
  if (!form.name.trim()) {
    toast.error('请填写姓名')
    return
  }
  await store.addStudent({
    no: form.no,
    name: form.name,
    gender: form.gender,
    boarding: form.boarding,
    address: form.address,
    avatar: form.avatar,
    phone: form.phone
  })
  toast.success('学生已添加')
  closeAddDialog()
}

// ---------- 编辑 ----------
function onStudentField(s: Student, patch: Partial<Student>): void {
  void store.updateStudent(s.id, patch)
}

function onParentField(studentId: string, field: 'parentName' | 'relation' | 'phone', value: string): void {
  const cur = b.value?.parents[studentId] ?? { parentName: '', relation: '', phone: '' }
  void store.setParent(studentId, { ...cur, [field]: value })
}

async function onRemove(s: Student): Promise<void> {
  if (!window.confirm(`删除学生「${s.name}」？其成绩、座位、值日记录会一并清理（奖励记录保留）。`)) return
  await store.removeStudent(s.id)
}

function exportPaper(): void {
  window.print()
}

async function exportExcelFile(): Promise<void> {
  const rows = students.value.map((s) => {
    const p = b.value?.parents[s.id]
    return [s.no, s.name, s.gender, s.post, p?.parentName ?? '', p?.relation ?? '', p?.phone ?? '', s.address ?? '', s.boarding ? '是' : '否']
  })
  await exportExcel(excelFileName('学生名单', store.cls ? `${store.cls.grade}${store.cls.name}` : '班级'), [
    { name: '学生名单', headers: ['学号', '姓名', '性别', '职务', '家长姓名', '关系', '联系电话', '家庭地址', '是否住校'], rows }
  ])
}

// ---------- 导入学生信息 / 下载模板（与设置页「导入数据」同一套能力） ----------
const studentFile = ref<HTMLInputElement | null>(null)

async function onStudentFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const rows = await fileToRows(file)
    const res = rowsToStudents(rows, store.data.current.sem, store.data.current.cls)
    if (res.errors.length) {
      toast.error(`导入失败：${res.errors.join('；')}`)
      return
    }
    await store.importStudents(res.students)
    toast.success(
      `导入 ${res.students.length} 名学生，座位表已同步重排${res.warnings.length ? `（${res.warnings.length} 条提示：${res.warnings.slice(0, 3).join('；')}）` : ''}`
    )
  } catch (err) {
    toast.error(`读取失败：${err instanceof Error ? err.message : String(err)}`)
  } finally {
    input.value = ''
  }
}

async function downloadTemplate(): Promise<void> {
  await exportStudentTemplateExcel(store.cls ? `${store.cls.grade}${store.cls.name}` : '班级')
  toast.success('学生名单 Excel 模板已下载')
}
</script>

<template>
  <div class="tw-page">
    <div class="tw-head">
      <div>
        <h3 class="tw-title">学生信息</h3>
        <p class="tw-subtitle">花名册按学号排序；明细表可直接修改，修改后自动保存。</p>
      </div>
      <div class="tw-toolbar">
        <button type="button" class="tw-btn tw-no-print" @click="studentFile?.click()">导入学生信息</button>
        <button type="button" class="tw-btn tw-no-print" @click="downloadTemplate">下载模板</button>
        <button type="button" class="tw-btn tw-no-print" @click="exportPaper">打印</button>
        <button type="button" class="tw-btn tw-no-print" @click="exportExcelFile">导出 Excel</button>
        <input ref="studentFile" type="file" accept=".xlsx,.xls,.csv" class="stu-file" @change="onStudentFile" />
      </div>
    </div>

    <section class="tw-stat-grid">
      <TeacherStatCard :value="students.length" label="班级总人数" accent="#6da3d8" />
      <TeacherStatCard :value="maleCount" label="男生人数" accent="#6da3d8" />
      <TeacherStatCard :value="femaleCount" label="女生人数" accent="#e989a6" />
      <TeacherStatCard :value="specialCount" label="特异体质人数" accent="#ef4444" />
      <TeacherStatCard :value="parentCount" label="家长已登记" accent="#3fa37c" />
      <TeacherStatCard :value="boardingCount" label="住校人数" accent="#9b6dd8" />
    </section>

    <section class="tw-card">
      <h4 class="tw-card-title">班级花名册</h4>
      <div class="tw-toolbar tw-no-print">
        <input v-model="keyword" class="tw-input" placeholder="搜索姓名 / 学号" />
        <span class="tw-spacer"></span>
        <span class="tw-label">共 {{ filtered.length }} 人</span>
      </div>
      <div v-if="filtered.length" class="tw-roster">
        <div
          v-for="s in filtered"
          :key="s.id"
          class="tw-chip"
          :class="s.gender === '男' ? 'tw-chip-male' : 'tw-chip-female'"
          :title="s.special ? `特异体质：${s.health.notes || s.health.allergy || '需关注'}` : s.name"
        >
          <span class="tw-chip-badge" v-if="s.special">!</span>
          <span>{{ s.name }}</span>
          <span class="tw-chip-no">{{ s.no }}</span>
        </div>
      </div>
      <p v-else class="tw-empty">还没有学生，请在下方添加，或点上方「导入学生信息」导入名单。</p>
    </section>

    <section class="tw-card">
      <div class="tw-card-head">
        <h4 class="tw-card-title">学生明细表</h4>
        <button type="button" class="tw-btn tw-btn-sm tw-btn-primary tw-no-print" @click="openAddDialog">+ 添加学生</button>
      </div>
      <div class="tw-toolbar tw-no-print stu-search">
        <label class="tw-label">学号<input v-model="searchNo" class="tw-input tw-input-sm" placeholder="精确匹配" /></label>
        <label class="tw-label">名称(精确)<input v-model="searchNameExact" class="tw-input tw-input-sm" placeholder="精确匹配" /></label>
        <label class="tw-label">名称(模糊)<input v-model="searchNameFuzzy" class="tw-input tw-input-sm" placeholder="关键字" /></label>
        <label class="tw-label">
          是否班委
          <select v-model="searchCommittee" class="tw-select tw-input-sm">
            <option value="all">全部</option>
            <option value="yes">是</option>
            <option value="no">否</option>
          </select>
        </label>
        <label class="tw-label">
          是否住校
          <select v-model="searchBoarding" class="tw-select tw-input-sm">
            <option value="all">全部</option>
            <option value="yes">是</option>
            <option value="no">否</option>
          </select>
        </label>
        <button type="button" class="tw-btn tw-btn-sm tw-btn-primary" @click="runSearch">搜索</button>
        <button type="button" class="tw-btn tw-btn-sm" @click="resetSearch">重置</button>
        <span class="tw-spacer"></span>
        <span class="tw-label">共 {{ detailFiltered.length }} 人</span>
      </div>

      <div v-if="detailFiltered.length" class="tw-table-wrap">
        <table class="tw-table">
          <thead>
            <tr>
              <th class="tw-col-index">序号</th>
              <th>学号</th>
              <th>姓名</th>
              <th>性别</th>
              <th>职务</th>
              <th>家长姓名</th>
              <th>关系</th>
              <th>联系电话</th>
              <th>家庭地址</th>
              <th>是否住校</th>
              <th class="tw-no-print">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(s, i) in pagedRows" :key="s.id">
              <td class="tw-col-index">{{ (currentPage - 1) * pageSize + i + 1 }}</td>
              <td>
                <input class="tw-input tw-input-sm stu-no" :value="s.no" @change="onStudentField(s, { no: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="s.name" @change="onStudentField(s, { name: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <select
                  class="tw-select tw-input-sm"
                  :value="s.gender"
                  @change="onStudentField(s, { gender: (($event.target as HTMLSelectElement).value as '男' | '女') })"
                >
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="s.post" placeholder="如 班长" @change="onStudentField(s, { post: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="b?.parents[s.id]?.parentName ?? ''" @change="onParentField(s.id, 'parentName', ($event.target as HTMLInputElement).value)" />
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="b?.parents[s.id]?.relation ?? ''" @change="onParentField(s.id, 'relation', ($event.target as HTMLInputElement).value)" />
              </td>
              <td>
                <input class="tw-input tw-input-sm" :value="b?.parents[s.id]?.phone ?? ''" @change="onParentField(s.id, 'phone', ($event.target as HTMLInputElement).value)" />
              </td>
              <td>
                <input class="tw-input tw-input-sm stu-address" :value="s.address" placeholder="家庭地址" @change="onStudentField(s, { address: ($event.target as HTMLInputElement).value })" />
              </td>
              <td>
                <select
                  class="tw-select tw-input-sm"
                  :value="s.boarding ? '是' : '否'"
                  @change="onStudentField(s, { boarding: (($event.target as HTMLSelectElement).value) === '是' })"
                >
                  <option value="否">否</option>
                  <option value="是">是</option>
                </select>
              </td>
              <td class="tw-no-print">
                <button type="button" class="tw-btn tw-btn-sm tw-btn-danger" @click="onRemove(s)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="detailFiltered.length > 0" class="stu-list-pager ewt-pager">
        <el-pagination
          v-model:current-page="currentPage"
          @size-change="currentPage = 1"
          v-model:page-size="pageSize"
          :page-sizes="PAGE_SIZES"
          layout="total, prev, pager, next, jumper"
          :total="detailFiltered.length"
          background
          prev-text="上一页"
          next-text="下一页"
        />
      </div>
      <p v-else class="tw-empty">暂无学生记录。</p>
    </section>

    <!-- 添加学生弹框 -->
    <el-dialog v-model="showAdd" title="添加学生" width="520px" destroy-on-close @close="closeAddDialog">
      <div class="stu-add-form">
        <div class="stu-form-row">
          <label class="stu-form-label">姓名 <span class="stu-req">*</span></label>
          <el-input v-model="form.name" maxlength="20" placeholder="必填" data-testid="stu-add-name" />
        </div>
        <div class="stu-form-row">
          <label class="stu-form-label">学号</label>
          <el-input v-model="form.no" maxlength="20" placeholder="留空自动生成" data-testid="stu-add-no" />
        </div>
        <div class="stu-form-row">
          <label class="stu-form-label">性别</label>
          <el-radio-group v-model="form.gender" data-testid="stu-add-gender">
            <el-radio value="男">男</el-radio>
            <el-radio value="女">女</el-radio>
          </el-radio-group>
        </div>
        <div class="stu-form-row">
          <label class="stu-form-label">班级</label>
          <div class="stu-form-static">{{ currentClassName }}</div>
        </div>
        <div class="stu-form-row">
          <label class="stu-form-label">联系电话</label>
          <el-input v-model="form.phone" maxlength="20" placeholder="学生 / 家长联系电话" data-testid="stu-add-phone" />
        </div>
        <div class="stu-form-row">
          <label class="stu-form-label">家庭地址</label>
          <el-input v-model="form.address" maxlength="80" placeholder="如 某某小区" data-testid="stu-add-address" />
        </div>
        <div class="stu-form-row">
          <label class="stu-form-label">是否住校</label>
          <el-switch v-model="form.boarding" />
        </div>
        <div class="stu-form-row">
          <label class="stu-form-label">头像</label>
          <div class="stu-avatar-box">
            <div v-if="form.avatar" class="stu-avatar-preview">
              <img :src="form.avatar" alt="头像预览" />
            </div>
            <div v-else class="stu-avatar-empty">未选择</div>
            <div class="stu-avatar-actions">
              <button type="button" class="tw-btn tw-btn-sm" @click="avatarInput?.click()">选择图片</button>
              <button type="button" class="tw-btn tw-btn-sm" v-if="form.avatar" @click="clearAvatar">清除</button>
            </div>
            <input ref="avatarInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" class="stu-file" @change="onAvatarChange" />
            <p class="stu-avatar-tip">支持 JPG / PNG / GIF / WebP，大小不超过 2MB</p>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="ewt-dialog-footer">
          <el-button @click="closeAddDialog">取消</el-button>
          <el-button type="primary" :disabled="!form.name.trim()" data-testid="stu-add-save" @click="saveAdd">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.stu-no {
  width: 64px;
}

/* 隐藏的「导入学生信息」文件选择框（由按钮代理点击） */
.stu-file {
  display: none;
}

.stu-address {
  min-width: 180px;
}

/* 明细表卡片头部：标题 + 添加按钮同行 */
.tw-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

/* 添加学生弹框表单 */
.stu-add-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.stu-form-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.stu-form-label {
  flex: 0 0 72px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-secondary, #475569);
}
.stu-req {
  color: #ef4444;
}
.stu-form-static {
  font-size: 14px;
  color: var(--color-text, #334155);
}
.stu-avatar-box {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.stu-avatar-preview,
.stu-avatar-empty {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  border: 1px dashed var(--color-border, #cbd5e1);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-hover, #f1f5f9);
  color: var(--color-text-muted, #94a3b8);
  font-size: 12px;
}
.stu-avatar-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.stu-avatar-actions {
  display: flex;
  gap: 8px;
}
.stu-avatar-tip {
  flex-basis: 100%;
  margin: 0;
  font-size: 12px;
  color: var(--color-text-muted, #94a3b8);
}

/* 明细表组合搜索区：允许换行，避免控件挤压 */
.stu-search {
  flex-wrap: wrap;
  row-gap: 8px;
}

.stu-list-pager {
  margin-top: 12px;
}

@media (max-width: 768px) {
  .stu-no {
    width: 56px;
  }
}
</style>

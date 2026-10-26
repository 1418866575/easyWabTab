<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { showConfirm } from '@/utils/dialog'
import { useViewMode } from '@/composables/useViewMode'
import ViewModeToggle from '@/components/common/ViewModeToggle.vue'
import RecordsCard from '@/components/common/RecordsCard.vue'
import GenealogyTreeNode from '@/components/workbench/GenealogyTreeNode.vue'
import { useToast } from '@/composables/useToast'
import { useGenealogyStore } from '@/stores/genealogy'
import {
  buildTree,
  getChildren,
  calcAge,
  calcZodiac,
  parseIdCardInfo,
  maskIdCard,
  filterParentCandidates,
  filterSpouseCandidates,
  genealogyStats,
  AGE_GROUPS,
  GENEALOGY_EXPORT_FILENAME
} from '@/composables/genealogyCore'
import type { AgeGroupKey } from '@/composables/genealogyCore'
import { filterNameRecords, validateNameForm } from '@/composables/namingCore'
import type { FamilyMember, FamilyNameRecord } from '@/types'
import { usePageSize } from '@/composables/usePageSize'

const store = useGenealogyStore()
const vm = useViewMode()
const toast = useToast()

const GENDER_LABEL: Record<string, string> = { male: '男', female: '女', '': '未知' }
/** 取名记录语境：'' 表示"通用 / 不限"（区别于家谱成员的"未知"） */
const NAME_GENDER_LABEL: Record<string, string> = { male: '男', female: '女', '': '通用' }

// ===== Tab：成员管理 / 家谱树 / 取名记录 =====
type TabKey = 'members' | 'tree' | 'names'
const activeTab = ref<TabKey>('members')

// ===== 搜索（按姓名）=====
const searchName = ref('')

// ===== 分页（固定 10 条/页）=====
const LIST_PAGE_SIZE = 10
const { pageSize, PAGE_SIZES } = usePageSize('fg-list-pager', LIST_PAGE_SIZE)
const listPage = ref(1)

const filteredMembers = computed<FamilyMember[]>(() => {
  const q = searchName.value.trim().toLowerCase()
  if (!q) return store.activeMembers
  return store.activeMembers.filter((m) => m.name.toLowerCase().includes(q))
})

const pageMembers = computed<FamilyMember[]>(() => {
  const start = (listPage.value - 1) * pageSize.value
  return filteredMembers.value.slice(start, start + pageSize.value)
})

watch(
  () => filteredMembers.value.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / pageSize.value))
    if (listPage.value > maxPage) listPage.value = maxPage
  }
)

// ===== 取名记录：搜索 / 筛选 / 排序 / 分页 =====
const NAME_PAGE_SIZE = 10
const { pageSize: namePageSize, PAGE_SIZES: NAME_PAGE_SIZES } = usePageSize('fg-names-pager', NAME_PAGE_SIZE)
const namePage = ref(1)
const nameSearch = ref('')
const nameGenderFilter = ref<'all' | 'male' | 'female' | ''>('all')
const nameSort = ref<'namingDate' | 'updatedAt' | 'name'>('namingDate')

const filteredNames = computed<FamilyNameRecord[]>(() =>
  filterNameRecords(store.activeNames, nameSearch.value, nameGenderFilter.value, nameSort.value)
)

const pageNames = computed<FamilyNameRecord[]>(() => {
  const start = (namePage.value - 1) * namePageSize.value
  return filteredNames.value.slice(start, start + namePageSize.value)
})

watch(
  () => filteredNames.value.length,
  (n) => {
    const maxPage = Math.max(1, Math.ceil(n / namePageSize.value))
    if (namePage.value > maxPage) namePage.value = maxPage
  }
)

/** 列表「更新时间」展示：ISO → YYYY-MM-DD */
function formatDateOnly(iso?: string): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? m[1] + '-' + m[2] + '-' + m[3] : iso.slice(0, 10)
}

function nameMemberText(n: FamilyNameRecord): string {
  if (!n.memberId) return '—'
  const m = store.activeMembers.find((x) => x.id === n.memberId)
  return m ? m.name : '—'
}

function nameCardFields(n: FamilyNameRecord) {
  return [
    { label: '名字', value: n.name, emphasis: true },
    { label: '适用性别', value: NAME_GENDER_LABEL[n.gender ?? ''] ?? '通用' },
    { label: '取名日期', value: n.namingDate || '—' },
    { label: '寓意/出处', value: n.meaning || '—' },
    { label: '关联成员', value: nameMemberText(n) }
  ]
}

// ===== 取名记录 新增/编辑弹框 =====
const showNameDialog = ref(false)
const nameEditingId = ref<string | null>(null)
const fnName = ref('')
const fnGender = ref<'male' | 'female' | ''>('')
const fnMeaning = ref('')
const fnNamingDate = ref('')
const fnMemberId = ref('')
const fnNote = ref('')

const isNameFormValid = computed(() => {
  const n = fnName.value.trim().length
  return n > 0 && n <= 50
})

/** 取名日期选择禁用未来日期（需求 §6：取名是过去/当日动作） */
function namingDateDisabledDate(time: Date): boolean {
  return time.getTime() > Date.now()
}

function startAddName(): void {
  nameEditingId.value = null
  fnName.value = ''
  fnGender.value = ''
  fnMeaning.value = ''
  fnNamingDate.value = ''
  fnMemberId.value = ''
  fnNote.value = ''
  showNameDialog.value = true
}

function startEditName(n: FamilyNameRecord): void {
  nameEditingId.value = n.id
  fnName.value = n.name
  fnGender.value = n.gender ?? ''
  fnMeaning.value = n.meaning ?? ''
  fnNamingDate.value = n.namingDate ?? ''
  fnMemberId.value = n.memberId ?? ''
  fnNote.value = n.note ?? ''
  showNameDialog.value = true
}

function cancelName(): void {
  showNameDialog.value = false
  nameEditingId.value = null
}

async function handleSaveName(): Promise<void> {
  const name = fnName.value.trim()
  const v = validateNameForm({ name, namingDate: fnNamingDate.value || null })
  if (!v.ok) {
    toast.error(v.error ?? '表单校验未通过')
    return
  }
  const input = {
    name,
    gender: fnGender.value,
    meaning: fnMeaning.value.trim() || undefined,
    namingDate: fnNamingDate.value || null,
    memberId: fnMemberId.value || null,
    note: fnNote.value.trim() || undefined
  }
  if (nameEditingId.value) {
    await store.updateNameRecord(nameEditingId.value, input)
    toast.success('已保存修改')
  } else {
    await store.addNameRecord(input)
    namePage.value = 1
    toast.success('已新增取名记录')
  }
  cancelName()
}

async function handleDeleteName(id: string): Promise<void> {
  const rec = store.activeNames.find((x) => x.id === id)
  if (!rec) return
  if (await showConfirm(`确定删除取名记录「${rec.name}」吗？\n（仅删除该记录，不影响关联的家谱成员。）`)) {
    await store.deleteNameRecord(id)
    toast.success('已删除')
    cancelName()
  }
}

// ===== 取名记录 导入 / 导出 =====
const nameImportInput = ref<HTMLInputElement | null>(null)

function handleExportNames(): void {
  if (!store.activeNames.length) {
    toast.info('暂无取名记录，无法导出')
    return
  }
  const d = new Date()
  const dateStr = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const json = store.exportNames()
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `family-names-${dateStr}.json`
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`已导出 ${store.activeNames.length} 条取名记录`)
}

async function handleImportNamesFile(e: Event): Promise<void> {
  const inputEl = e.target as HTMLInputElement
  const f = inputEl.files?.[0]
  if (!f) return
  try {
    const text = await f.text()
    let mode: 'replace' | 'merge' = 'replace'
    if (store.activeNames.length > 0) {
      const ok = await showConfirm(
        `当前已有 ${store.activeNames.length} 条取名记录。\n\n` +
        `点「确定」用文件**覆盖**现有记录；点「取消」则**合并**进现有记录（同 id 以较新修改时间为准）。`
      )
      mode = ok ? 'replace' : 'merge'
    }
    const res = await store.importNamesFromJSON(text, mode)
    if (res.valid === 0 && res.skipped === 0) {
      const msg = res.warnings[0] ?? '文件中没有可导入的取名记录'
      toast.error('导入失败：' + msg)
      return
    }
    namePage.value = 1
    const tips: string[] = [`导入 ${res.valid} 条取名记录`]
    if (res.skipped) tips.push(`跳过 ${res.skipped} 条无效记录`)
    toast.success(tips.join('，'))
    for (const w of res.warnings) toast.info(w)
  } catch (err) {
    toast.error('导入失败：' + (err as Error).message)
  } finally {
    const el = (nameImportInput.value ?? e.target) as HTMLInputElement | null
    if (el) el.value = ''
  }
}

// ===== 族谱排辈（字辈歌，只读参考）=====
const PAIBEI_TITLE = '族谱排辈'
// 每行以 " 分隔左右两支字辈（各 5 字为一代），原文照搬；末行 "羲夏景泰" 含一处疑似乱码字符，由用户自行校正
const PAIBEI_LINES: string[] = [
  '文卿儒国朝"为孔正开显',
  '福泽隆厚兴"登礼慧行仁',
  '承先尊汉籍"沿晋绍家声',
  '丕炽修明盛"建华振乾坤',
  '宏瑞溯远庆"寰宇旭光屏',
  '智雄科甲第"道义熹群臻',
  '纲典章毓孝"创业更芳辉',
  '普教博造化"书墨功贤能',
  '耕读传其本"绵延安鹤龄',
  '羲夏景泰"舒仲耀庭经'
]
const PAIBEI_ROWS = PAIBEI_LINES.map((line) => {
  const idx = line.indexOf('"')
  if (idx < 0) return { left: line, right: '' }
  return { left: line.slice(0, idx).trim(), right: line.slice(idx + 1).trim() }
})

const showPaibeiDialog = ref(false)
function openPaibei(): void {
  showPaibeiDialog.value = true
}

function relationSummary(m: FamilyMember): string {
  const children = getChildren(store.activeMembers, m.id).length
  return `父${m.parents.length} · 子${children} · 偶${m.spouses.length}`
}

/**
 * 年龄文本：在世按今天算周岁，已故按去世日期算「享年 N」。
 * 出生日期缺失或非法 → '—'（不臆造年龄）；死亡在出生之前同样按 '—' 处理。
 */
function ageText(m: FamilyMember): string {
  const age = calcAge(m.birthDate, m.deathDate)
  if (age === null) return '—'
  return m.deathDate ? `享年 ${age}` : `${age}`
}

function zodiacText(m: FamilyMember): string {
  return calcZodiac(m.birthDate) ?? '—'
}

function memberName(id: string): string {
  return store.activeMembers.find((m) => m.id === id)?.name ?? '(已删除)'
}

function cardFields(m: FamilyMember): Array<{ label: string; value: string; emphasis?: boolean }> {
  const rows: Array<{ label: string; value: string; emphasis?: boolean }> = [
    { label: '姓名', value: m.name, emphasis: true },
    { label: '性别', value: GENDER_LABEL[m.gender ?? ''] ?? '未知' },
    { label: '出生日期', value: m.birthDate || '—' },
    { label: '生肖', value: zodiacText(m) },
    { label: '年龄', value: ageText(m) },
    { label: '关系', value: relationSummary(m) }
  ]
  // 身份证号只做脱敏展示（保留地区码前 6 位与后 4 位），不把完整号码铺在卡片上
  if (m.idCard) rows.push({ label: '身份证号', value: maskIdCard(m.idCard) })
  return rows
}

// ===== 人口统计（总数 / 男女 / 年龄段）=====
// 依赖 store.activeMembers，成员或出生日期变化自动重算；纯函数 genealogyStats 出结果，组件不做计算。
const stats = computed(() => genealogyStats(store.activeMembers))
const ageStatRows = computed(() =>
  AGE_GROUPS.map((g) => ({
    key: g.key as AgeGroupKey,
    label: g.label,
    basis: g.basis,
    count: stats.value.groups[g.key]
  }))
)

// ===== 成员新增/编辑弹框 =====
const showMemberDialog = ref(false)
const editingId = ref<string | null>(null)
const formName = ref('')
const formGender = ref<'male' | 'female' | ''>('')
const formBirth = ref('')
const formDeath = ref('')
const formPhone = ref('')
const formNote = ref('')
const formAvatar = ref('')
const formIdCard = ref('')
const avatarInput = ref<HTMLInputElement | null>(null)

/** 读取图片文件 → 压缩为 ≤256px 的 JPEG base64 data URL（头像存储用，避免原图体积过大撑爆云同步信封） */
function readImageAsDataURL(file: File, maxSize = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error)
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('图片解析失败'))
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const w = Math.max(1, Math.round(img.width * scale))
        const h = Math.max(1, Math.round(img.height * scale))
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('canvas 不可用'))
          return
        }
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

async function onAvatarChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    toast.error('请选择图片文件')
    input.value = ''
    return
  }
  if (file.size > 8 * 1024 * 1024) {
    toast.error('图片过大（上限 8MB）')
    input.value = ''
    return
  }
  try {
    formAvatar.value = await readImageAsDataURL(file)
  } catch {
    toast.error('头像读取失败')
  } finally {
    input.value = ''
  }
}

function clearAvatar(): void {
  formAvatar.value = ''
}

function triggerAvatarInput(): void {
  avatarInput.value?.click()
}

const isMemberFormValid = computed(() => {
  const n = formName.value.trim().length
  return n > 0 && n <= 50
})

/** 表单内年龄预览：随出生/去世日期实时计算（在世算周岁，已故算享年），无需手填 */
const formAgeText = computed(() => {
  const age = calcAge(formBirth.value || undefined, formDeath.value || undefined)
  if (age === null) return formBirth.value ? '—' : '填写出生日期后自动计算'
  return formDeath.value ? `享年 ${age} 岁` : `${age} 岁`
})

/** 表单内生肖预览：随出生日期实时推导（无需手填） */
const formZodiacText = computed(() => {
  const z = calcZodiac(formBirth.value || undefined)
  return z ? `属 ${z}` : (formBirth.value ? '—' : '填写出生日期后自动计算')
})

/** 当前输入解析结果（null = 尚未成形 / 非法）；hint 与告警色共用，避免重复解析 */
const formIdCardInfo = computed(() => parseIdCardInfo(formIdCard.value))

/**
 * 身份证号输入提示：已推导（性别 · 出生日期）/ 校验位不通过 / 格式不正确。
 *
 * 输入过程中不早早报错：只有去掉空格后已满 15 位（15/18 位号码的最小长度）才提示格式问题，
 * 否则刚敲两三位就飘红会很烦。
 */
const formIdCardHint = computed(() => {
  const raw = formIdCard.value.trim()
  if (!raw) return ''
  const info = formIdCardInfo.value
  if (!info) {
    return raw.replace(/\s+/g, '').length >= 15 ? '身份证号格式不正确，请检查号码' : '继续输入完整号码后自动推算'
  }
  const genderLabel = info.gender === 'male' ? '男' : '女'
  const base = `已按身份证推算：${genderLabel} · ${info.birthDate}`
  return info.checksumOk === false ? `${base}（校验位不通过，号码可能有误）` : base
})

/** 提示是否需要黄色告警（格式错 / 校验位错）；正常推导成功不告警 */
const formIdCardWarn = computed(() => {
  const raw = formIdCard.value.trim()
  if (!raw) return false
  const info = formIdCardInfo.value
  if (!info) return raw.replace(/\s+/g, '').length >= 15
  return info.checksumOk === false
})

/**
 * 身份证号变化 → 自动回填性别与出生日期。
 * 用事件回调而不是 watch：编辑既有成员时回填表单不应触发覆盖（否则用户手改过的性别会被号码重置）。
 */
function applyIdCard(raw: string): void {
  const info = parseIdCardInfo(raw)
  if (!info) return
  formGender.value = info.gender
  formBirth.value = info.birthDate
}

/** 保存时只接受形状正确的号码（避免把半截输入写进成员档案） */
function normalizedIdCard(): string | undefined {
  const s = formIdCard.value.replace(/\s+/g, '').toUpperCase()
  return /^\d{15}$|^\d{17}[\dX]$/.test(s) ? s : undefined
}

function startAdd(): void {
  editingId.value = null
  formName.value = ''
  formGender.value = ''
  formBirth.value = ''
  formDeath.value = ''
  formPhone.value = ''
  formNote.value = ''
  formAvatar.value = ''
  formIdCard.value = ''
  showMemberDialog.value = true
}

function startEdit(m: FamilyMember): void {
  editingId.value = m.id
  formName.value = m.name
  formGender.value = (m.gender ?? '') as 'male' | 'female' | ''
  formBirth.value = m.birthDate ?? ''
  formDeath.value = m.deathDate ?? ''
  formPhone.value = m.phone ?? ''
  formNote.value = m.note ?? ''
  formIdCard.value = m.idCard ?? ''
  // 回填已有头像：否则保存时会把 avatar 传成空串，等于「静默删除头像」
  formAvatar.value = m.avatar ?? ''
  showMemberDialog.value = true
}

function cancelMember(): void {
  showMemberDialog.value = false
  editingId.value = null
}

async function handleSaveMember(): Promise<void> {
  const name = formName.value.trim()
  if (name.length === 0 || name.length > 50) return
  const input = {
    name,
    gender: formGender.value,
    birthDate: formBirth.value || undefined,
    deathDate: formDeath.value || undefined,
    idCard: normalizedIdCard(),
    phone: formPhone.value.trim() || undefined,
    note: formNote.value.trim() || undefined,
    // 传原值而不是 `|| undefined`：空串代表「用户点了移除」，store 里按「明确移除」处理；
    // 若折叠成 undefined，就会被当成「本次不改」，头像删不掉。
    avatar: formAvatar.value
  }
  if (editingId.value) {
    await store.updateMember(editingId.value, input)
    toast.success('已保存修改')
  } else {
    await store.addMember(input)
    listPage.value = 1
    toast.success('已新增成员')
  }
  cancelMember()
}

// ===== 导入 / 导出（家庭成员间分享）=====
const importInput = ref<HTMLInputElement | null>(null)

/** 导出：生成 JSON 文件并触发下载（纯本地，不上传） */
function handleExport(): void {
  if (!store.activeMembers.length) {
    toast.info('家谱暂无成员，无法导出')
    return
  }
  const json = store.exportData()
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = GENEALOGY_EXPORT_FILENAME
  a.click()
  URL.revokeObjectURL(url)
  toast.success(`已导出 ${store.activeMembers.length} 位成员，可发给家人导入`)
}

/** 导入：选文件 → 询问覆盖/合并 → 清洗写入 → 反馈统计 */
async function handleImportFile(e: Event): Promise<void> {
  const inputEl = e.target as HTMLInputElement
  const f = inputEl.files?.[0]
  if (!f) return
  try {
    const text = await f.text()
    // 有数据时先问：覆盖 or 合并（分享来的完整家谱通常选覆盖）
    let mode: 'replace' | 'merge' = 'replace'
    if (store.activeMembers.length > 0) {
      const hasLocal = store.activeMembers.length
      const ok = await showConfirm(
        `当前家谱已有 ${hasLocal} 位成员。\n\n` +
        `点「确定」用文件**覆盖**现有家谱；点「取消」则**合并**进现有家谱（同 id 以较新修改时间为准）。`
      )
      mode = ok ? 'replace' : 'merge'
    }
    const res = await store.importFromJSON(text, mode)
    if (res.valid === 0) {
      toast.error('导入失败：' + (res.warnings[0] ?? '文件内容为空或格式不正确'))
      return
    }
    listPage.value = 1
    const tips: string[] = [`导入 ${res.valid} 位成员`]
    if (res.skipped) tips.push(`跳过 ${res.skipped} 条无效记录`)
    if (res.danglingRefs) tips.push(`清理 ${res.danglingRefs} 个失效关系引用`)
    toast.success(tips.join('，'))
    for (const w of res.warnings) toast.info(w)
  } catch (err) {
    toast.error('导入失败：' + (err as Error).message)
  } finally {
    // 复位文件输入：importInput 是模板 ref（存 DOM 元素），不能赋字符串；
    // 正确做法是通过 ref 拿元素清 value，这样下次能再次选择同一文件。
    const el = (importInput.value ?? e.target) as HTMLInputElement | null
    if (el) el.value = ''
  }
}

async function handleDelete(m: FamilyMember): Promise<void> {
  const children = getChildren(store.activeMembers, m.id)
  const childTip = children.length > 0 ? `其子/女（${children.map((c) => c.name).join('、')}）将保留为孤儿。` : ''
  if (await showConfirm(`确定删除「${m.name}」吗？\n${childTip}\n（仅删除该成员，并清理他人对其的父母/配偶引用，不做级联删除。）`)) {
    await store.deleteMember(m.id)
    toast.success('已删除')
  }
}

// ===== 关系管理弹框 =====
const showRelDialog = ref(false)
const relMember = ref<FamilyMember | null>(null)
const parentPick = ref('')
const spousePick = ref('')

// 可选父母：过滤不合理候选（自己/已有父母/后代防环/年龄小于被关联人/性别角色冲突）
const parentOptions = computed<FamilyMember[]>(() =>
  relMember.value ? filterParentCandidates(store.activeMembers, relMember.value.id) : []
)

// 可选配偶：过滤不合理候选（自己/已有配偶/关系互斥的血亲/同性不匹配）
const spouseOptions = computed<FamilyMember[]>(() =>
  relMember.value ? filterSpouseCandidates(store.activeMembers, relMember.value.id) : []
)

function openRel(m: FamilyMember): void {
  relMember.value = m
  parentPick.value = ''
  spousePick.value = ''
  showRelDialog.value = true
}

function closeRel(): void {
  showRelDialog.value = false
  relMember.value = null
}

async function addParent(): Promise<void> {
  const m = relMember.value
  if (!m || !parentPick.value) return
  const ok = await store.setParent(m.id, parentPick.value)
  if (!ok) {
    toast.error('添加后会产生血缘环，已阻止')
    return
  }
  toast.success('已添加父母关系')
  parentPick.value = ''
}

async function addSpouse(): Promise<void> {
  const m = relMember.value
  if (!m || !spousePick.value || m.spouses.length > 0) return
  const ok = await store.setSpouse(m.id, spousePick.value)
  if (!ok) {
    toast.error('无法设置配偶关系')
    return
  }
  toast.success('已设置配偶关系')
  spousePick.value = ''
}

async function removeParentOf(pId: string): Promise<void> {
  const m = relMember.value
  if (!m) return
  await store.removeParent(m.id, pId)
}

async function removeSpouseOf(sId: string): Promise<void> {
  const m = relMember.value
  if (!m) return
  await store.removeSpouse(m.id, sId)
}

// ===== 主根 =====
async function setRoot(m: FamilyMember): Promise<void> {
  await store.setRoot(m.id)
  toast.success(`已将「${m.name}」设为主根`)
}

async function clearRoot(): Promise<void> {
  await store.clearRoot()
  toast.info('已取消主根')
}

// 移动端编辑弹框内快捷入口：打开关系管理 / 设为主根
function openRelFromEdit(): void {
  if (!editingId.value) return
  const m = store.activeMembers.find((x) => x.id === editingId.value)
  if (!m) return
  cancelMember()
  openRel(m)
}

async function setRootFromEdit(): Promise<void> {
  if (!editingId.value) return
  const m = store.activeMembers.find((x) => x.id === editingId.value)
  if (!m) return
  await setRoot(m)
  cancelMember()
}

// ===== 家谱树（递归思维导图组件，折叠态由各节点内部维护）=====
const treeRoots = computed(() => buildTree(store.activeMembers, store.rootId))
const hasRoot = computed(() => store.rootId !== null && store.activeMembers.some((m) => m.id === store.rootId))

function rootName(): string {
  const r = store.activeMembers.find((m) => m.id === store.rootId)
  return r ? r.name : ''
}

// ===== 键盘：ESC 关闭弹框 =====
function handleKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  if (showNameDialog.value) {
    e.preventDefault()
    cancelName()
  } else if (showMemberDialog.value) {
    e.preventDefault()
    cancelMember()
  } else if (showRelDialog.value) {
    e.preventDefault()
    closeRel()
  }
}

onMounted(async () => {
  await store.load()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div class="wb-genealogy">
    <!-- Tab 切换：成员管理 / 家谱树 -->
    <div class="fg-tabs" role="tablist">
      <button
        class="fg-tab"
        :class="{ active: activeTab === 'members' }"
        role="tab"
        :aria-selected="activeTab === 'members'"
        data-testid="fg-tab-members"
        @click="activeTab = 'members'"
      >成员管理</button>
      <button
        class="fg-tab"
        :class="{ active: activeTab === 'tree' }"
        role="tab"
        :aria-selected="activeTab === 'tree'"
        data-testid="fg-tab-tree"
        @click="activeTab = 'tree'"
      >家谱树</button>
      <button
        class="fg-tab"
        :class="{ active: activeTab === 'names' }"
        role="tab"
        :aria-selected="activeTab === 'names'"
        data-testid="fg-tab-names"
        @click="activeTab = 'names'"
      >取名记录</button>
    </div>

    <!-- ========== 成员管理 ========== -->
    <template v-if="activeTab === 'members'">
      <div class="ewt-table-toolbar is-split">
        <div class="td-toolbar-left">
          <el-button type="primary" size="small" class="btn-add" data-testid="fg-add-button" @click="startAdd">＋ 新增成员</el-button>
          <el-input
            v-model="searchName"
            size="small"
            class="fg-search"
            placeholder="按姓名搜索…"
            clearable
            data-testid="fg-search"
            @keyup.enter="listPage = 1"
            @clear="listPage = 1"
          />
        </div>
        <!-- 右侧：导入 / 导出 紧贴视图切换（卡片）按钮，小屏自动换行 -->
        <div class="td-toolbar-right">
          <el-button size="small" class="btn-cancel" data-testid="fg-export-button" @click="handleExport">
            导出
          </el-button>
          <el-button size="small" class="btn-cancel" data-testid="fg-import-button" @click="importInput?.click()">
            导入
          </el-button>
          <input
            ref="importInput"
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="fg-import-input"
            @change="handleImportFile"
          />
          <ViewModeToggle v-if="filteredMembers.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
        </div>
      </div>

      <div v-if="store.activeMembers.length === 0" class="empty-state empty-invite" data-testid="fg-empty" @click="startAdd">
        ＋ 新增第一个家庭成员
      </div>

      <div v-else-if="filteredMembers.length === 0" class="empty-state filter-empty" data-testid="fg-filter-empty">
        <span>没有符合搜索条件的成员</span>
        <button class="btn-cancel" @click="searchName = ''; listPage = 1">清除搜索</button>
      </div>

      <template v-else>
        <div class="fg-table-wrap">
          <el-table
            v-if="vm.mode === 'list'"
            class="ewt-table"
            :data="pageMembers"
            data-testid="fg-table"
            @row-click="(row: FamilyMember) => startEdit(row)"
            stripe
            border
            size="default"
            style="width: 100%"
            height="100%"
            empty-text="没有符合搜索条件的成员"
          >
            <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (listPage - 1) * pageSize + i + 1" />
            <el-table-column label="姓名" min-width="160" align="center" show-overflow-tooltip>
              <template #default="{ row }">
                <div class="fg-name">
                  <img v-if="row.avatar" :src="row.avatar" class="fg-name-avatar" :alt="row.name" />
                  <span v-else class="fg-name-initial">{{ (row.name || '?').slice(0, 1) }}</span>
                  {{ row.name }}
                  <span v-if="store.rootId === row.id" class="fg-root-badge">主根</span>
                </div>
              </template>
            </el-table-column>
            <el-table-column label="性别" width="90" align="center">
              <template #default="{ row }">{{ GENDER_LABEL[row.gender ?? ''] ?? '未知' }}</template>
            </el-table-column>
            <el-table-column label="出生日期" width="140" align="center">
              <template #default="{ row }">
                <span v-if="row.birthDate">{{ row.birthDate }}</span>
                <span v-else class="td-col-empty">—</span>
              </template>
            </el-table-column>
            <el-table-column label="生肖" width="90" align="center">
              <template #default="{ row }">
                <span v-if="zodiacText(row) !== '—'" :data-testid="`fg-zodiac-${row.id}`">{{ zodiacText(row) }}</span>
                <span v-else class="td-col-empty">—</span>
              </template>
            </el-table-column>
            <el-table-column label="年龄" width="110" align="center">
              <template #default="{ row }">
                <span v-if="ageText(row) !== '—'" :data-testid="`fg-age-${row.id}`">{{ ageText(row) }}</span>
                <span v-else class="td-col-empty">—</span>
              </template>
            </el-table-column>
            <el-table-column label="关系" min-width="160" align="center">
              <template #default="{ row }">
                <span class="fg-rel">{{ relationSummary(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="280" align="center" fixed="right">
              <template #default="{ row }">
                <div class="td-actions" @click.stop>
                  <el-button size="small" :data-testid="`fg-rel-${row.id}`" @click="openRel(row)">关系</el-button>
                  <el-button size="small" :data-testid="`fg-edit-${row.id}`" @click="startEdit(row)">编辑</el-button>
                  <el-button
                    v-if="store.rootId !== row.id"
                    size="small"
                    :data-testid="`fg-root-${row.id}`"
                    @click="setRoot(row)"
                  >设主根</el-button>
                  <el-button size="small" class="btn-delete" :data-testid="`fg-delete-${row.id}`" @click="handleDelete(row)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div v-else class="ewt-card-grid">
            <RecordsCard
              v-for="m in pageMembers"
              :key="m.id"
              :fields="cardFields(m)"
              @edit="startEdit(m)"
            />
          </div>
        </div>

        <div class="fg-list-pager ewt-pager">
          <el-pagination
            v-model:current-page="listPage"
            @size-change="listPage = 1"
            v-model:page-size="pageSize"
            :page-sizes="PAGE_SIZES"
            layout="total, prev, pager, next, jumper"
            :total="filteredMembers.length"
            background
            small
            prev-text="上一页"
            next-text="下一页"
            data-testid="fg-pagination"
          />
        </div>
      </template>
    </template>

    <!-- ========== 取名记录 ========== -->
    <template v-else-if="activeTab === 'names'">
      <div class="ewt-table-toolbar is-split">
        <div class="td-toolbar-left">
          <el-button type="primary" size="small" class="btn-add" data-testid="fn-add-button" @click="startAddName">＋ 新增取名记录</el-button>
          <el-input
            v-model="nameSearch"
            size="small"
            class="fg-search"
            placeholder="搜索名字/寓意/备注…"
            clearable
            data-testid="fn-search"
            @keyup.enter="namePage = 1"
            @clear="namePage = 1"
          />
          <el-select v-model="nameGenderFilter" size="small" class="fn-gender-filter" data-testid="fn-gender-filter" @change="namePage = 1">
            <el-option value="all" label="全部性别" />
            <el-option value="" label="通用" />
            <el-option value="male" label="男" />
            <el-option value="female" label="女" />
          </el-select>
          <el-select v-model="nameSort" size="small" class="fn-sort" data-testid="fn-sort" @change="namePage = 1">
            <el-option value="namingDate" label="按取名日期" />
            <el-option value="updatedAt" label="按更新时间" />
            <el-option value="name" label="按名字" />
          </el-select>
        </div>
        <div class="td-toolbar-right">
          <el-button size="small" class="btn-cancel" data-testid="fn-export-button" @click="handleExportNames">导出</el-button>
          <el-button size="small" class="btn-cancel" data-testid="fn-import-button" @click="nameImportInput?.click()">导入</el-button>
          <el-button size="small" class="btn-cancel" data-testid="fn-paibei-button" @click="openPaibei">族谱排辈</el-button>
          <input
            ref="nameImportInput"
            type="file"
            accept="application/json,.json"
            hidden
            data-testid="fn-import-input"
            @change="handleImportNamesFile"
          />
          <ViewModeToggle v-if="filteredNames.length > 0" :mode="vm.mode" @toggle="vm.toggle" />
        </div>
      </div>

      <div v-if="store.activeNames.length === 0" class="empty-state empty-invite" data-testid="fn-empty" @click="startAddName">
        ＋ 新增第一条取名记录
      </div>

      <div v-else-if="filteredNames.length === 0" class="empty-state filter-empty" data-testid="fn-filter-empty">
        <span>没有符合搜索/筛选条件的取名记录</span>
        <button class="btn-cancel" @click="nameSearch = ''; nameGenderFilter = 'all'; namePage = 1">清除筛选</button>
      </div>

      <template v-else>
        <div class="fg-table-wrap">
          <el-table
            v-if="vm.mode === 'list'"
            class="ewt-table"
            :data="pageNames"
            data-testid="fn-table"
            @row-click="(row: FamilyNameRecord) => startEditName(row)"
            stripe
            border
            size="default"
            style="width: 100%"
            height="100%"
            empty-text="没有符合搜索条件的取名记录"
          >
            <el-table-column type="index" label="序号" width="70" align="center" class-name="ewt-index-col" :index="(i: number) => (namePage - 1) * namePageSize + i + 1" />
            <el-table-column label="名字" min-width="140" align="center" show-overflow-tooltip>
              <template #default="{ row }">
                <span class="fn-name">{{ row.name }}</span>
              </template>
            </el-table-column>
            <el-table-column label="适用性别" width="100" align="center">
              <template #default="{ row }">{{ NAME_GENDER_LABEL[row.gender ?? ''] ?? '通用' }}</template>
            </el-table-column>
            <el-table-column label="寓意/出处" min-width="200" align="center" show-overflow-tooltip>
              <template #default="{ row }">
                <span v-if="row.meaning">{{ row.meaning }}</span>
                <span v-else class="td-col-empty">—</span>
              </template>
            </el-table-column>
            <el-table-column label="取名日期" width="130" align="center">
              <template #default="{ row }">
                <span v-if="row.namingDate">{{ row.namingDate }}</span>
                <span v-else class="td-col-empty">—</span>
              </template>
            </el-table-column>
            <el-table-column label="关联成员" min-width="120" align="center">
              <template #default="{ row }">{{ nameMemberText(row) }}</template>
            </el-table-column>
            <el-table-column label="更新时间" width="130" align="center">
              <template #default="{ row }">{{ formatDateOnly(row.updatedAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" class-name="ewt-op-col" width="180" align="center" fixed="right">
              <template #default="{ row }">
                <div class="td-actions" @click.stop>
                  <el-button size="small" :data-testid="`fn-edit-${row.id}`" @click="startEditName(row)">编辑</el-button>
                  <el-button size="small" class="btn-delete" :data-testid="`fn-delete-${row.id}`" @click="handleDeleteName(row.id)">删除</el-button>
                </div>
              </template>
            </el-table-column>
          </el-table>

          <div v-else class="ewt-card-grid">
            <RecordsCard
              v-for="n in pageNames"
              :key="n.id"
              :fields="nameCardFields(n)"
              @edit="startEditName(n)"
            />
          </div>
        </div>

        <div class="fg-names-pager ewt-pager">
          <el-pagination
            v-model:current-page="namePage"
            @size-change="namePage = 1"
            v-model:page-size="namePageSize"
            :page-sizes="NAME_PAGE_SIZES"
            layout="total, prev, pager, next, jumper"
            :total="filteredNames.length"
            background
            small
            prev-text="上一页"
            next-text="下一页"
            data-testid="fn-pagination"
          />
        </div>
      </template>
    </template>

    <!-- ========== 家谱树（思维导图式递归）========== -->
    <template v-else>
      <div class="fg-tree-bar">
        <template v-if="hasRoot">
          <span class="fg-tree-info">主根：<b>{{ rootName() }}</b></span>
          <el-button size="small" class="btn-cancel" data-testid="fg-clear-root" @click="clearRoot">取消主根</el-button>
        </template>
        <span v-else class="fg-tree-info fg-tree-muted">未设主根，按「无父母的成员」展示为多棵根树</span>
      </div>

      <!-- 人口统计：总数 / 男女 / 年龄段（年龄段按国家规定口径，悬停看判定依据） -->
      <div class="fg-stats" data-testid="fg-stats">
        <div class="fg-stats-row">
          <span class="fg-stat-chip fg-stat-total">
            成员总数 <b data-testid="fg-stat-total">{{ stats.total }}</b>
          </span>
          <span class="fg-stat-chip">
            男 <b class="is-male" data-testid="fg-stat-male">{{ stats.male }}</b>
          </span>
          <span class="fg-stat-chip">
            女 <b class="is-female" data-testid="fg-stat-female">{{ stats.female }}</b>
          </span>
          <span v-if="stats.unknownGender > 0" class="fg-stat-chip">
            性别未知 <b>{{ stats.unknownGender }}</b>
          </span>
        </div>
        <div class="fg-stats-row fg-stats-row-age">
          <span
            v-for="g in ageStatRows"
            :key="g.key"
            class="fg-stat-chip"
            :title="g.basis"
            :data-testid="`fg-stat-${g.key}`"
          >{{ g.label }} <b>{{ g.count }}</b></span>
          <span
            v-if="stats.unknownAge > 0"
            class="fg-stat-chip fg-stat-unknown"
            title="未填写出生日期，无法判定年龄段"
          >年龄未知 <b>{{ stats.unknownAge }}</b></span>
        </div>
      </div>

      <div v-if="treeRoots.length === 0" class="empty-state" data-testid="fg-tree-empty">
        暂无家谱数据，请先在「成员管理」中新增成员并建立关系
      </div>

      <div v-else class="fg-mindmap">
        <GenealogyTreeNode
          v-for="root in treeRoots"
          :key="root.member.id"
          :node="root"
          data-testid="fg-tree-root-node"
        />
      </div>
    </template>

    <!-- 成员新增/编辑弹框 -->
    <el-dialog
      :model-value="showMemberDialog"
      :title="editingId ? '编辑成员' : '新增成员'"
      width="80%"
      data-testid="fg-member-dialog"
      @close="cancelMember"
      @update:model-value="(v: boolean) => { if (!v) cancelMember() }"
    >
      <form class="dialog-body" @submit.prevent="handleSaveMember">
        <div class="fg-form-grid">
          <div class="form-group">
            <label>姓名 *</label>
            <el-input
              v-model="formName"
              placeholder="例如：张三"
              maxlength="50"
              data-testid="fg-name-input"
              @keyup.enter="handleSaveMember"
            />
          </div>
          <div class="form-group form-group--full">
            <label>身份证号（可选 · 自动推算性别与出生日期）</label>
            <el-input
              v-model="formIdCard"
              placeholder="18 位（或 15 位老号码），输入后自动填入下方性别与出生日期"
              maxlength="18"
              clearable
              data-testid="fg-idcard"
              @input="applyIdCard"
            />
            <div
              v-if="formIdCardHint"
              class="fg-idcard-hint"
              :class="{ 'is-warn': formIdCardWarn }"
              data-testid="fg-idcard-hint"
            >
              {{ formIdCardHint }}
            </div>
          </div>
          <div class="form-group">
            <label>性别</label>
            <el-select v-model="formGender" data-testid="fg-gender">
              <el-option value="" label="未知" />
              <el-option value="male" label="男" />
              <el-option value="female" label="女" />
            </el-select>
          </div>

          <div class="form-group">
            <label>出生日期</label>
            <el-date-picker
              v-model="formBirth"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              data-testid="fg-birth"
            />
          </div>
          <div class="form-group">
            <label>去世日期（可选）</label>
            <el-date-picker
              v-model="formDeath"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              data-testid="fg-death"
            />
          </div>

          <div class="form-group">
            <label>年龄（自动计算）</label>
            <div class="fg-age-preview" data-testid="fg-form-age">{{ formAgeText }}</div>
          </div>
          <div class="form-group">
            <label>生肖（自动计算）</label>
            <div class="fg-age-preview" data-testid="fg-form-zodiac">{{ formZodiacText }}</div>
          </div>

          <div class="form-group">
            <label>联系电话（可选）</label>
            <el-input v-model="formPhone" placeholder="选填" data-testid="fg-phone" />
          </div>
          <div class="form-group">
            <label>头像（可选）</label>
            <div class="avatar-uploader">
              <div class="avatar-preview" :class="{ empty: !formAvatar }">
                <img v-if="formAvatar" :src="formAvatar" alt="头像预览" />
                <span v-else class="avatar-placeholder">无</span>
              </div>
              <div class="avatar-actions">
                <input ref="avatarInput" type="file" accept="image/*" class="avatar-file" data-testid="fg-avatar-input" @change="onAvatarChange" />
                <el-button size="small" data-testid="fg-avatar-upload" @click="triggerAvatarInput">上传头像</el-button>
                <el-button v-if="formAvatar" size="small" class="btn-cancel" data-testid="fg-avatar-clear" @click="clearAvatar">移除</el-button>
              </div>
            </div>
          </div>
        </div>

        <div class="form-group">
          <label>备注（可选）</label>
          <el-input v-model="formNote" type="textarea" :rows="2" placeholder="补充说明…" data-testid="fg-note" />
        </div>
        <div class="form-actions ewt-dialog-footer">
          <el-button size="small" data-testid="fg-cancel-button" @click="cancelMember">取消</el-button>
          <el-button type="primary" size="small" :disabled="!isMemberFormValid" data-testid="fg-save-button" @click="handleSaveMember">
            {{ editingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="editingId" type="danger" size="small" native-type="button" data-testid="fg-record-delete" @click="handleDelete({ id: editingId, name: formName } as FamilyMember)">删除</el-button>
          <!-- 移动端独占：编辑页快捷入口，PC 端隐藏 -->
          <el-button v-if="editingId" size="small" class="mobile-only-action" data-testid="fg-edit-rel-button" @click="openRelFromEdit">关系</el-button>
          <el-button v-if="editingId && store.rootId !== editingId" size="small" type="warning" class="mobile-only-action" data-testid="fg-edit-root-button" @click="setRootFromEdit">设主根</el-button>
        </div>
      </form>
    </el-dialog>

    <!-- 关系管理弹框 -->
    <el-dialog
      :model-value="showRelDialog"
      :title="relMember ? `关系管理 · ${relMember.name}` : '关系管理'"
      width="480px"
      data-testid="fg-rel-dialog"
      @close="closeRel"
      @update:model-value="(v: boolean) => { if (!v) closeRel() }"
    >
      <div v-if="relMember" class="fg-rel-body">
        <div class="fg-rel-section">
          <div class="fg-rel-title">父母（{{ relMember.parents.length }}）</div>
          <div v-if="relMember.parents.length === 0" class="fg-rel-empty">尚未设置父母</div>
          <div v-for="p in relMember.parents" :key="p" class="fg-rel-item">
            <span>{{ memberName(p) }}</span>
            <el-button size="small" class="btn-delete" @click="removeParentOf(p)">解除</el-button>
          </div>
          <div class="fg-rel-add">
            <el-select v-model="parentPick" placeholder="选择要添加的父母" size="small" class="fg-rel-select" :disabled="parentOptions.length === 0">
              <el-option v-for="o in parentOptions" :key="o.id" :value="o.id" :label="o.name" />
            </el-select>
            <el-button size="small" type="primary" :disabled="!parentPick" @click="addParent">添加</el-button>
          </div>
          <div v-if="parentOptions.length === 0" class="fg-rel-hint">已无可添加的父母候选（已排除自己、现有父母、后代、年龄更小或性别冲突者）</div>
        </div>

        <div class="fg-rel-section">
          <div class="fg-rel-title">配偶（一对一）</div>
          <div v-if="relMember.spouses.length === 0" class="fg-rel-empty">尚未设置配偶</div>
          <div v-for="s in relMember.spouses" :key="s" class="fg-rel-item">
            <span>{{ memberName(s) }}</span>
            <el-button size="small" class="btn-delete" @click="removeSpouseOf(s)">解除</el-button>
          </div>
          <div v-if="relMember.spouses.length === 0">
            <div class="fg-rel-add">
              <el-select v-model="spousePick" placeholder="选择配偶" size="small" class="fg-rel-select" :disabled="spouseOptions.length === 0">
                <el-option v-for="o in spouseOptions" :key="o.id" :value="o.id" :label="o.name" />
              </el-select>
              <el-button size="small" type="primary" :disabled="!spousePick" @click="addSpouse">设置</el-button>
            </div>
            <div v-if="spouseOptions.length === 0" class="fg-rel-hint">已无可添加的配偶候选（已排除自己、现有配偶、父母/子女/兄弟姐妹等亲属及同性者）</div>
          </div>
          <div v-else class="fg-rel-hint">配偶为一对一，请先解除现有配偶再设置</div>
        </div>
      </div>
      <div class="form-actions ewt-dialog-footer">
        <el-button size="small" @click="closeRel">关闭</el-button>
      </div>
    </el-dialog>

    <!-- 取名记录新增/编辑弹框 -->
    <el-dialog
      :model-value="showNameDialog"
      :title="nameEditingId ? '编辑取名记录' : '新增取名记录'"
      width="80%"
      data-testid="fn-name-dialog"
      @close="cancelName"
      @update:model-value="(v: boolean) => { if (!v) cancelName() }"
    >
      <form class="dialog-body" @submit.prevent="handleSaveName">
        <div class="fg-form-grid">
          <div class="form-group">
            <label>名字 *</label>
            <el-input
              v-model="fnName"
              placeholder="例如：沐宸"
              maxlength="50"
              data-testid="fn-name-input"
              @keyup.enter="handleSaveName"
            />
          </div>
          <div class="form-group">
            <label>适用性别</label>
            <el-select v-model="fnGender" data-testid="fn-gender">
              <el-option value="" label="通用" />
              <el-option value="male" label="男" />
              <el-option value="female" label="女" />
            </el-select>
          </div>

          <div class="form-group">
            <label>取名日期</label>
            <el-date-picker
              v-model="fnNamingDate"
              type="date"
              value-format="YYYY-MM-DD"
              placeholder="选择日期"
              :disabled-date="namingDateDisabledDate"
              data-testid="fn-naming-date"
            />
          </div>
          <div class="form-group">
            <label>关联成员（选填）</label>
            <el-select v-model="fnMemberId" clearable filterable placeholder="选择家谱成员" size="small" class="fn-member-select" data-testid="fn-member">
              <el-option v-for="m in store.activeMembers" :key="m.id" :value="m.id" :label="m.name" />
            </el-select>
          </div>
        </div>

        <div class="form-group">
          <label>寓意 / 出处（选填）</label>
          <el-input v-model="fnMeaning" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="一字多义的字解、诗词典故出处、字辈说明等…" data-testid="fn-meaning" />
        </div>
        <div class="form-group">
          <label>备注（选填）</label>
          <el-input v-model="fnNote" type="textarea" :rows="2" maxlength="500" show-word-limit placeholder="补充说明…" data-testid="fn-note" />
        </div>
        <div class="form-actions ewt-dialog-footer">
          <el-button size="small" data-testid="fn-cancel-button" @click="cancelName">取消</el-button>
          <el-button type="primary" size="small" :disabled="!isNameFormValid" data-testid="fn-save-button" @click="handleSaveName">
            {{ nameEditingId ? '保存' : '添加' }}
          </el-button>
          <el-button v-if="nameEditingId" type="danger" size="small" native-type="button" data-testid="fn-record-delete" @click="handleDeleteName(nameEditingId)">删除</el-button>
        </div>
      </form>
    </el-dialog>

    <!-- 族谱排辈（字辈歌，只读参考）-->
    <el-dialog
      :model-value="showPaibeiDialog"
      :title="PAIBEI_TITLE"
      width="560px"
      data-testid="fn-paibei-dialog"
      @close="showPaibeiDialog = false"
      @update:model-value="(v: boolean) => { if (!v) showPaibeiDialog = false }"
    >
      <div class="fn-paibei" data-testid="fn-paibei-body">
        <div v-for="(row, i) in PAIBEI_ROWS" :key="i" class="fn-paibei-row">
          <span class="fn-paibei-half">{{ row.left }}</span>
          <span class="fn-paibei-sep">│</span>
          <span class="fn-paibei-half">{{ row.right }}</span>
        </div>
      </div>
      <div class="form-actions ewt-dialog-footer">
        <el-button size="small" data-testid="fn-paibei-close" @click="showPaibeiDialog = false">关闭</el-button>
      </div>
    </el-dialog>

  </div>
</template>

<style scoped>
.wb-genealogy {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== Tab ===== */
.fg-tabs {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid var(--color-border, #e5e7eb);
}
.fg-tab {
  padding: 8px 18px;
  font-size: 14px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--color-text-secondary, #64748b);
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
}
.fg-tab:hover { color: var(--color-primary, #3b82f6); }
.fg-tab.active {
  color: var(--color-primary, #3b82f6);
  border-bottom-color: var(--color-primary, #3b82f6);
  font-weight: 600;
}

/* ===== 搜索 / 工具栏 ===== */
.fg-search { width: 200px; }
.fn-gender-filter, .fn-sort { width: 120px; }
.fn-member-select { width: 100%; }
.fn-name { font-size: 13px; font-weight: 600; color: var(--color-text, #111827); }

/* ===== 族谱排辈 字辈歌 ===== */
.fn-paibei {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 4px;
}
.fn-paibei-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 22px;
  font-size: 19px;
  line-height: 1.6;
  letter-spacing: 8px;
  color: var(--color-text, #111827);
}
.fn-paibei-half { white-space: nowrap; }
.fn-paibei-sep {
  letter-spacing: 0;
  color: var(--color-border, #d1d5db);
  font-size: 16px;
}
html.dark .fn-paibei-row { color: var(--color-text, #f9fafb); }
html.dark .fn-paibei-sep { color: var(--color-border, #374151); }
.td-toolbar-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* 工具栏右侧组：导入 / 导出 紧贴视图切换（卡片）按钮，is-split 下贴右侧、小屏自动换行 */
.td-toolbar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }

/* ===== 表格容器 ===== */
.fg-table-wrap {
  flex: 1 1 auto;
  min-height: 240px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}
.fg-table-wrap > :global(.el-table) {
  flex: 1 1 auto;
  min-height: 220px;
  width: 100% !important;
  font-size: 13px;
  border-radius: 10px;
  overflow: hidden;
}
.fg-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #f3f4f6) !important;
  color: var(--color-text-secondary, #6b7280);
  font-weight: 600;
  user-select: none;
}
.fg-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #111827);
}
:global(html.dark) .fg-table-wrap > :global(.el-table th.el-table__cell) {
  background-color: var(--color-bg-hover, #111827) !important;
  color: var(--color-text-secondary, #d1d5db);
}
:global(html.dark) .fg-table-wrap > :global(.el-table td.el-table__cell) {
  color: var(--color-text, #f9fafb);
}

/* ===== 分页条（沿用双视图面板惯例 + 显式上色覆盖）===== */
.fg-list-pager {
  flex: 0 0 auto;
  padding: 14px 16px 18px;
  border-top: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-input, #f9fafb);
  border-radius: 0 0 14px 14px;
  margin: 0 0 8px;
  display: flex;
  justify-content: center;
  align-items: center;
}
:global(html.dark) .fg-list-pager {
  border-top-color: var(--color-border, #374151);
  background: var(--color-bg-hover, #111827);
}

/* ===== 表格内元素 ===== */
.fg-name {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text, #111827);
}
.fg-root-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  color: #fff;
  background: var(--color-primary, #3b82f6);
}
.fg-rel { font-size: 12px; color: var(--color-text-secondary, #6b7280); }
.td-col-empty { color: var(--color-text-muted, #9ca3af); font-size: 12px; }

.td-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: auto;
}
/* .btn-delete 视觉已统一到全局 .ui-btn--danger（style.css） */

/* ===== 空态 ===== */
.empty-state {
  text-align: center;
  color: var(--color-text-muted, #9ca3af);
  font-size: 14px;
  padding: 40px 20px;
  background: var(--color-bg-card, #fff);
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: 10px;
}
.empty-invite {
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary, #64748b);
  transition: color 0.15s ease, border-color 0.15s ease;
}
.empty-invite:hover { color: var(--color-primary, #3b82f6); border-color: var(--color-primary, #3b82f6); }
.filter-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; }
/* .btn-cancel 视觉已统一到全局 .ui-btn（style.css） */

/* ===== 家谱树 ===== */
.fg-tree-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
}
/* ===== 家谱树：人口统计 ===== */
.fg-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  background: var(--color-bg-card, #fff);
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
}
.fg-stats-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fg-stat-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--color-text-secondary, #64748b);
  background: var(--color-bg-hover, #f1f5f9);
  border-radius: 999px;
  white-space: nowrap;
}
.fg-stat-chip b { font-size: 14px; color: var(--color-text, #111827); }
.fg-stat-chip b.is-male { color: #3b82f6; }
.fg-stat-chip b.is-female { color: #ec4899; }
.fg-stat-total { background: var(--color-primary-light, #eff6ff); }
.fg-stat-unknown { opacity: 0.85; }
/* 年龄预览（编辑弹框只读） */
.fg-age-preview {
  font-size: 14px;
  color: var(--color-text-secondary, #64748b);
  padding: 6px 10px;
  border: 1px dashed var(--color-border, #e5e7eb);
  border-radius: 6px;
}
html.dark .fg-stats { background-color: var(--color-bg-card, #1f2937); border-color: var(--color-border, #374151); }
html.dark .fg-stat-chip { background-color: var(--color-bg-hover, #374151); }
html.dark .fg-stat-chip b { color: var(--color-text, #f9fafb); }
html.dark .fg-age-preview { border-color: var(--color-border, #374151); }

.fg-tree-info { font-size: 13px; color: var(--color-text-secondary, #64748b); }
.fg-tree-muted { color: var(--color-text-muted, #9ca3af); }
.fg-mindmap { display: flex; flex-direction: column; gap: 6px; padding: 4px 0; flex: 0 0 auto; min-height: 0;  }
.fg-rel { font-size: 12px; color: var(--color-text-secondary, #6b7280); }

/* ===== 关系弹框 ===== */
.fg-rel-body { display: flex; flex-direction: column; gap: 18px; }
.fg-rel-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--color-border, #e5e7eb);
  border-radius: 10px;
}
.fg-rel-title { font-size: 13px; font-weight: 600; color: var(--color-text, #111827); }
.fg-rel-empty { font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.fg-rel-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--color-text, #111827); }
.fg-rel-add { display: flex; gap: 8px; }
.fg-rel-select { flex: 1; }
.fg-rel-hint { font-size: 12px; color: var(--color-text-muted, #9ca3af); }

/* ===== 弹框通用 ===== */
.dialog-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; }
/* 新增/编辑弹框：两列网格（除备注整行），降低弹框高度 */
.fg-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
.fg-form-grid :deep(.el-input),
.fg-form-grid :deep(.el-select),
.fg-form-grid :deep(.el-date-picker) { width: 100%; }
.form-group { display: flex; flex-direction: column; gap: 6px; }
/* 占满整行（身份证号这类长字段用） */
.fg-form-grid .form-group--full { grid-column: 1 / -1; }
.fg-idcard-hint { font-size: 12px; line-height: 1.5; color: var(--color-text-secondary, #64748b); }
.fg-idcard-hint.is-warn { color: var(--color-warning, #d97706); }
.form-group > label { font-size: 13px; color: var(--color-text-secondary, #64748b); }
.form-row-fields { display: flex; gap: 10px; flex-wrap: wrap; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 13px; color: var(--color-text-secondary, #64748b); }
.field-gender { width: 140px; }
.field-date { width: 170px; }
.form-actions { display: flex; gap: 8px; justify-content: flex-end; }

/* PC 端隐藏移动端独占按钮 */
.mobile-only-action { display: none !important; }

/* 移动端：编辑弹框底部按钮允许换行，避免「取消/保存/删除/关系/设主根」挤爆 */
@media (max-width: 768px) {
  .form-actions { flex-wrap: wrap; justify-content: stretch; }
  .form-actions .el-button { flex: 1 1 calc(33.333% - 6px); min-width: 0; }
  .form-actions .el-button + .el-button { margin-left: 0 !important; }
  .mobile-only-action { display: inline-flex !important; }
  .fg-form-grid { grid-template-columns: 1fr; }
}

/* ===== 头像上传 ===== */
.avatar-uploader { display: flex; align-items: center; gap: 14px; }
.avatar-preview {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid var(--color-border, #e5e7eb);
  background: var(--color-bg-card, #fff);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.avatar-preview img { width: 100%; height: 100%; object-fit: cover; }
.avatar-placeholder { font-size: 12px; color: var(--color-text-muted, #9ca3af); }
.avatar-actions { display: flex; align-items: center; gap: 8px; }
.avatar-file { display: none; }
.fg-name-avatar { width: 22px; height: 22px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
.fg-name-initial {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary, #3b82f6);
}
html.dark .avatar-preview { background: var(--color-bg-card, #1f2937); }

/* ===== 暗色覆盖 ===== */
html.dark .fg-tab { color: var(--color-text-secondary, #d1d5db); }
html.dark .fg-tab:hover, html.dark .fg-tab.active { color: var(--color-primary, #60a5fa); border-bottom-color: var(--color-primary, #3b82f6); }
html.dark .empty-state { background-color: var(--color-bg-card, #1f2937); }
html.dark .fg-name { color: var(--color-text, #f9fafb); }
html.dark .fn-name { color: var(--color-text, #f9fafb); }
html.dark .fg-tree-bar { background-color: var(--color-bg-card, #1f2937); }
html.dark .fg-rel-section { background-color: var(--color-bg-card, #1f2937); border-color: var(--color-border, #374151); }
html.dark .fg-rel-title { color: var(--color-text, #f9fafb); }
html.dark .fg-rel-item { color: var(--color-text, #f9fafb); }
html.dark .form-group > label, html.dark .field-label { color: var(--color-text-secondary, #d1d5db); }
/* html.dark .btn-cancel 视觉已统一到全局 .ui-btn（style.css） */
</style>

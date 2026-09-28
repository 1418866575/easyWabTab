// 教师工作台 store（数据存 IndexedDB store 'teacher_workbench' 单对象）
// 薄委托 teacherCore / teacherImportCore：所有计算与解析均为纯函数，store 只负责读档→调用→存档。
// 当前分组由 data.current 指向 (sem, cls)；一切写入都落在对应桶，切换分组不搬动记录。

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { idbGet, idbPut } from '@/composables/useIdb'
import { markDirty } from '@/composables/useCloudSync'
import {
  arrangeByRoster,
  arrangeRandom,
  autoArrangeDuty,
  classTitle,
  currentBucket,
  currentClass,
  currentRole,
  emptyBucket,
  emptyTeacherData,
  guardPage,
  initMissesFromRoster,
  leaveStats,
  makeStudentId,
  normalizeTeacherData,
  normalizeTerm,
  removeStudentCascade,
  resizeSeats,
  resolveCurrent,
  resolveDefaultSelection,
  swapSeats,
  todayStr,
  uid
} from '@/composables/teacherCore'
import {
  defaultTeacherMenu,
  groupTeacherMenuItems,
  moveTeacherMenuItem,
  normalizeTeacherMenu,
  renameTeacherMenuLabel,
  resolveTeacherMenuItems
} from '@/composables/teacherMenuCore'
import {
  emptyTimetableData,
  emptyTiming,
  computePeriodTime,
  cellKey
} from '@/composables/studentTimetableCore'
import { exportHomeworkMissesExcel, exportTalksExcel as exportTalksExcelFile } from '@/composables/teacherExcelCore'
import {
  type ClassBucket,
  type ClassGroup,
  type CommitteeMember,
  type GrowthRecord,
  type LeaveRecord,
  type LeaveStatus,
  type ParentInfo,
  type Student,
  type StudentTimetableData,
  type StudentTimetableSchedule,
  type TeacherData,
  type TeacherHomework,
  type HomeSchoolTalkRecord,
  type TeacherPageKey,
  type TeacherRole,
  type TeacherStage,
  type TeacherTerm
} from '@/types/teacher'

/** 班委 → 学生职务 同步：按 committee 汇总每个学生职务（多职务用「、」连接），返回新 students（仅变更者重建） */
function syncStudentPosts(b: ClassBucket): Student[] {
  const postMap = new Map<string, string[]>()
  for (const c of b.committee) {
    if (!c.studentId || !c.role) continue
    const arr = postMap.get(c.studentId) ?? []
    arr.push(c.role)
    postMap.set(c.studentId, arr)
  }
  return b.students.map((s) => {
    const roles = postMap.get(s.id)
    const post = roles && roles.length ? roles.join('、') : ''
    return s.post === post ? s : { ...s, post }
  })
}

export const useTeacherStore = defineStore('teacher', () => {
  const data = ref<TeacherData>(emptyTeacherData())
  const activePage = ref<TeacherPageKey>('students')

  // ---------- 持久化 ----------

  async function loadTeacher(): Promise<void> {
    try {
      data.value = normalizeTeacherData(await idbGet<TeacherData>('teacher_workbench'))
    } catch (e) {
      console.error('[teacher] load failed', e)
      data.value = emptyTeacherData()
    }
    // 载入后校正当前页：被隐藏的页面要回落到可见页
    setActivePage(activePage.value)
  }

  async function saveTeacher(): Promise<void> {
    try {
      await idbPut('teacher_workbench', JSON.parse(JSON.stringify(data.value)))
      markDirty()
    } catch (e) {
      console.error('[teacher] save failed', e)
    }
  }

  // ---------- 派生 ----------

  const bucket = computed<ClassBucket | null>(() => currentBucket(data.value))
  const cls = computed<ClassGroup | null>(() => currentClass(data.value))
  const role = computed<TeacherRole>(() => currentRole(data.value))
  const isHead = computed(() => role.value === 'head')

  // ---------- 左侧菜单（自定义顺序 / 名称；「工作台」分组已迁入设置页，不再作为菜单项） ----------
  const menu = computed(() => normalizeTeacherMenu(data.value.menuOrder, data.value.menuLabels))
  /** 导航用：按身份过滤 + 自定义顺序/名称，仍按 group 分组输出 */
  const groups = computed(() =>
    groupTeacherMenuItems(resolveTeacherMenuItems(menu.value.order, menu.value.labels, role.value))
  )
  /** 设置页用：全部菜单项（不过滤身份），同样按 group 分组 */
  const menuAllGroups = computed(() =>
    groupTeacherMenuItems(resolveTeacherMenuItems(menu.value.order, menu.value.labels))
  )
  /** 导航用：扁平列表（左侧不再渲染分组标题），按自定义顺序 + 身份过滤 */
  const menuItems = computed(() => resolveTeacherMenuItems(menu.value.order, menu.value.labels, role.value))

  async function moveMenuItem(key: string, dir: 'up' | 'down'): Promise<void> {
    const res = moveTeacherMenuItem(menu.value.order, key, dir)
    if (!res.ok || !res.order) return
    data.value = { ...data.value, menuOrder: res.order }
    await saveTeacher()
  }

  async function renameMenuItem(key: string, name: string): Promise<void> {
    const res = renameTeacherMenuLabel(menu.value.labels, key, name)
    if (!res.ok || !res.labels) return
    data.value = { ...data.value, menuLabels: res.labels }
    await saveTeacher()
  }

  async function resetMenu(): Promise<void> {
    const def = defaultTeacherMenu()
    data.value = { ...data.value, menuOrder: def.order, menuLabels: def.labels }
    await saveTeacher()
  }
  const semesters = computed(() => data.value.semesters)
  const classesOfCurrentSem = computed(() =>
    data.value.classes.filter((c) => c.semesterId === data.value.current.sem)
  )
  const needsSemester = computed(() => data.value.semesters.length === 0)
  const needsClass = computed(() => !needsSemester.value && classesOfCurrentSem.value.length === 0)

  // ---------- 默认组合（学期 + 班级；进入工作台自动进入，随云同步） ----------

  /** 有效默认组合；未设置或已失效时为 { sem:'', cls:'' } */
  const defaultSelection = computed<{ sem: string; cls: string }>(
    () => resolveDefaultSelection(data.value) ?? { sem: '', cls: '' }
  )
  /** 当前选中的学期 + 班级是否就是默认组合 */
  const isDefaultCurrent = computed<boolean>(() => {
    const d = defaultSelection.value
    return !!d.sem && d.sem === data.value.current.sem && d.cls === data.value.current.cls
  })
  const isDefaultSemester = (semId: string): boolean => defaultSelection.value.sem === semId && !!semId
  const isDefaultClass = (classId: string): boolean => defaultSelection.value.cls === classId && !!classId

  function defaultLabelOf(semId: string, classId: string): string {
    return isDefaultSemester(semId) && isDefaultClass(classId) ? '默认' : ''
  }

  /** 把当前「学期 + 班级」设为默认组合 */
  async function setDefaultSelection(): Promise<void> {
    const { sem, cls: cid } = data.value.current
    if (!sem || !cid) return
    data.value = { ...data.value, defaultSelection: { sem, cls: cid } }
    await saveTeacher()
  }

  /** 取消默认组合（进入工作台时回落到常规解析：最新学期 + 其首个/班主任班级） */
  async function clearDefaultSelection(): Promise<void> {
    data.value = { ...data.value, defaultSelection: { sem: '', cls: '' } }
    await saveTeacher()
  }

  // ---------- 当前桶改写 ----------

  function mutateBucket(fn: (b: ClassBucket) => ClassBucket): boolean {
    const { sem, cls: cid } = data.value.current
    if (!sem || !cid) return false
    const inner = data.value.groups?.[sem]
    const cur = inner?.[cid]
    if (!cur) return false
    data.value = {
      ...data.value,
      groups: { ...data.value.groups, [sem]: { ...(inner ?? {}), [cid]: fn(cur) } }
    }
    return true
  }

  // ---------- 学期 / 班级 ----------

  async function addSemester(year: string, term: string): Promise<string> {
    const id = uid('sem')
    const sem = { id, year: year.trim(), term: normalizeTerm(term), createdAt: Date.now() }
    data.value = {
      ...data.value,
      semesters: [...data.value.semesters, sem],
      groups: { ...data.value.groups, [id]: {} },
      current: resolveCurrent({ ...data.value, semesters: [...data.value.semesters, sem], current: { sem: id, cls: '' } })
    }
    await saveTeacher()
    return id
  }

  async function addClass(grade: string, name: string, subject: string, role_: TeacherRole, stage: TeacherStage): Promise<string> {
    const semId = data.value.current.sem
    if (!semId) return ''
    const id = uid('cls')
    const c: ClassGroup = { id, semesterId: semId, stage, grade: grade.trim(), name: name.trim(), role: role_, subject: subject.trim() }
    const asg = { id: uid('asg'), teacherId: data.value.teacher.id, semesterId: semId, classId: id, subject: subject.trim() }
    const inner = { ...(data.value.groups[semId] ?? {}), [id]: emptyBucket() }
    // 首个班级自动成为默认组合，免得用户还要手动点一次「设为默认」
    const hasDefault = !!(data.value.defaultSelection?.sem && data.value.defaultSelection?.cls)
    data.value = {
      ...data.value,
      classes: [...data.value.classes, c],
      assignments: [...data.value.assignments, asg],
      groups: { ...data.value.groups, [semId]: inner },
      current: { sem: semId, cls: id },
      defaultSelection: hasDefault ? data.value.defaultSelection : { sem: semId, cls: id }
    }
    await saveTeacher()
    return id
  }

  async function deleteClass(classId: string): Promise<void> {
    const target = data.value.classes.find((c) => c.id === classId)
    if (!target) return
    const sem = target.semesterId
    const inner = { ...(data.value.groups[sem] ?? {}) }
    delete inner[classId]
    const classes = data.value.classes.filter((c) => c.id !== classId)
    // 删掉的正是默认班级 → 清空默认组合，避免指向不存在的班级
    const defaultSelection =
      data.value.defaultSelection?.cls === classId ? { sem: '', cls: '' } : data.value.defaultSelection
    // 该学期已无班级 → 一并删除学期（含其分组与关联 assignment），避免孤立学期
    const semEmpty = !classes.some((c) => c.semesterId === sem)
    const groups = semEmpty
      ? (() => {
          const g = { ...data.value.groups }
          delete g[sem]
          return g
        })()
      : { ...data.value.groups, [sem]: inner }
    const semesters = semEmpty ? data.value.semesters.filter((s) => s.id !== sem) : data.value.semesters
    const assignments = semEmpty
      ? data.value.assignments.filter((a) => a.semesterId !== sem)
      : data.value.assignments.filter((a) => a.classId !== classId)
    // 写入删除标记：让云同步合并也能剔除该班级（否则会被远端旧数据「复活」）
    const tombstones = {
      semesters: [...(data.value.tombstones?.semesters ?? [])],
      classes: [...(data.value.tombstones?.classes ?? [])]
    }
    if (!tombstones.classes.includes(classId)) tombstones.classes.push(classId)
    if (semEmpty && !tombstones.semesters.includes(sem)) tombstones.semesters.push(sem)
    data.value = {
      ...data.value,
      classes,
      assignments,
      groups,
      semesters,
      defaultSelection,
      tombstones,
      current: resolveCurrent({
        ...data.value,
        classes,
        groups,
        semesters,
        current: { sem, cls: '' }
      })
    }
    await saveTeacher()
  }

  /** 按 (学年, 学期) 查找已有学期，找不到返回空串 */
  function findSemesterByYearTerm(year: string, term: string): string {
    const y = year.trim()
    const t = term.trim()
    return data.value.semesters.find((s) => s.year === y && s.term === t)?.id ?? ''
  }

  /** 新增班级：学年/学段/学期/班级/身份/科目一次写入；学期不存在则自动创建；首个班级自动成为当前与默认组合 */
  async function createClassEntry(input: {
    year: string
    term: TeacherTerm
    stage: TeacherStage
    grade: string
    name: string
    role: TeacherRole
    subject: string
  }): Promise<string> {
    let semId = findSemesterByYearTerm(input.year, input.term)
    if (!semId) {
      semId = uid('sem')
      data.value = {
        ...data.value,
        semesters: [...data.value.semesters, { id: semId, year: input.year.trim(), term: input.term.trim(), createdAt: Date.now() }],
        groups: { ...data.value.groups, [semId]: {} }
      }
    }
    const clsId = uid('cls')
    const c: ClassGroup = {
      id: clsId,
      semesterId: semId,
      stage: input.stage,
      grade: input.grade.trim(),
      name: input.name.trim(),
      role: input.role,
      subject: input.subject.trim()
    }
    const asg = { id: uid('asg'), teacherId: data.value.teacher.id, semesterId: semId, classId: clsId, subject: input.subject.trim() }
    const inner = { ...(data.value.groups[semId] ?? {}), [clsId]: emptyBucket() }
    const isFirst = data.value.classes.length === 0
    data.value = {
      ...data.value,
      classes: [...data.value.classes, c],
      assignments: [...data.value.assignments, asg],
      groups: { ...data.value.groups, [semId]: inner },
      current: isFirst ? { sem: semId, cls: clsId } : data.value.current,
      defaultSelection: isFirst ? { sem: semId, cls: clsId } : data.value.defaultSelection
    }
    await saveTeacher()
    return clsId
  }

  /** 编辑班级：可改学年/学段/学期/班级/身份/科目；若学年或学期变化导致所属学期变化，自动重挂学期并搬移数据桶 */
  async function updateClassEntry(
    classId: string,
    patch: {
      year: string
      term: TeacherTerm
      stage: TeacherStage
      grade: string
      name: string
      role: TeacherRole
      subject: string
    }
  ): Promise<void> {
    const cls = data.value.classes.find((c) => c.id === classId)
    if (!cls) return
    const oldSem = cls.semesterId
    let newSem = findSemesterByYearTerm(patch.year, patch.term)
    if (!newSem) {
      newSem = uid('sem')
      data.value = {
        ...data.value,
        semesters: [...data.value.semesters, { id: newSem, year: patch.year.trim(), term: patch.term.trim(), createdAt: Date.now() }],
        groups: { ...data.value.groups, [newSem]: {} }
      }
    }
    const reParent = newSem !== oldSem
    const updatedClass: ClassGroup = {
      ...cls,
      semesterId: newSem,
      stage: patch.stage,
      grade: patch.grade.trim(),
      name: patch.name.trim(),
      role: patch.role,
      subject: patch.subject.trim()
    }
    const classes = data.value.classes.map((c) => (c.id === classId ? updatedClass : c))
    // 同步 assignment（学期与科目）
    const exAsg = data.value.assignments.find((a) => a.classId === classId)
    const assignments = [
      ...data.value.assignments.filter((a) => a.classId !== classId),
      exAsg
        ? { ...exAsg, semesterId: newSem, subject: patch.subject.trim() }
        : { id: uid('asg'), teacherId: data.value.teacher.id, semesterId: newSem, classId, subject: patch.subject.trim() }
    ]
    let groups = data.value.groups
    if (reParent) {
      const bucket = groups[oldSem]?.[classId] ?? emptyBucket()
      const oldInner = { ...(groups[oldSem] ?? {}) }
      delete oldInner[classId]
      const newInner = { ...(groups[newSem] ?? {}), [classId]: bucket }
      groups = { ...groups, [oldSem]: oldInner, [newSem]: newInner }
    }
    data.value = { ...data.value, classes, assignments, groups }
    if (reParent) {
      // 当前 / 默认组合若指向该类，跟随更新学期
      if (data.value.current.cls === classId) data.value = { ...data.value, current: { sem: newSem, cls: classId } }
      if (data.value.defaultSelection?.cls === classId) {
        data.value = { ...data.value, defaultSelection: { sem: newSem, cls: classId } }
      }
      // 旧学期已无班级 → 删除旧学期
      if (!classes.some((c) => c.semesterId === oldSem)) {
        const g2 = { ...data.value.groups }
        delete g2[oldSem]
        data.value = {
          ...data.value,
          groups: g2,
          semesters: data.value.semesters.filter((s) => s.id !== oldSem),
          assignments: data.value.assignments.filter((a) => a.semesterId !== oldSem)
        }
      }
    }
    await saveTeacher()
  }

  /** 将指定「学期 + 班级」标记为默认组合（进入工作台自动进入） */
  async function markDefault(semId: string, classId: string): Promise<void> {
    if (!semId || !classId) return
    if (!data.value.semesters.some((s) => s.id === semId)) return
    if (!data.value.classes.some((c) => c.id === classId && c.semesterId === semId)) return
    data.value = { ...data.value, defaultSelection: { sem: semId, cls: classId } }
    await saveTeacher()
  }

  async function deleteSemester(semId: string): Promise<void> {
    const groups = { ...data.value.groups }
    delete groups[semId]
    const classes = data.value.classes.filter((c) => c.semesterId !== semId)
    const semesters = data.value.semesters.filter((s) => s.id !== semId)
    // 删掉的正是默认学期 → 清空默认组合
    const defaultSelection =
      data.value.defaultSelection?.sem === semId ? { sem: '', cls: '' } : data.value.defaultSelection
    // 写入删除标记：学期及其全部班级一并记入，云同步合并据此剔除，避免被远端「复活」
    const removedClasses = data.value.classes.filter((c) => c.semesterId === semId).map((c) => c.id)
    const tombstones = {
      semesters: [...(data.value.tombstones?.semesters ?? [])],
      classes: [...(data.value.tombstones?.classes ?? []), ...removedClasses]
    }
    if (!tombstones.semesters.includes(semId)) tombstones.semesters.push(semId)
    data.value = {
      ...data.value,
      semesters,
      classes,
      assignments: data.value.assignments.filter((a) => a.semesterId !== semId),
      groups,
      defaultSelection,
      tombstones,
      current: resolveCurrent({ ...data.value, semesters, classes, groups, current: { sem: '', cls: '' } })
    }
    await saveTeacher()
  }

  /**
   * 清空某学期下的全部数据记录（学生/家长/成绩/试卷/座位/值日/课程表/奖励/点名等），
   * 但保留该学期与班级结构本身（区别于 deleteSemester 整学期删除）。
   */
  async function clearSemesterData(semId: string): Promise<void> {
    if (!data.value.semesters.some((s) => s.id === semId)) return
    const clsIds = data.value.classes.filter((c) => c.semesterId === semId).map((c) => c.id)
    const nextGroups = { ...data.value.groups }
    nextGroups[semId] = {}
    for (const clsId of clsIds) nextGroups[semId][clsId] = emptyBucket()
    data.value = { ...data.value, groups: nextGroups }
    await saveTeacher()
  }

  /** 切换学期：只改指针，不搬动记录 */
  async function selectSemester(semId: string): Promise<void> {
    data.value = {
      ...data.value,
      current: resolveCurrent({ ...data.value, current: { sem: semId, cls: '' } })
    }
    await saveTeacher()
    setActivePage(activePage.value)
  }

  /** 切换班级：身份与可用模块随之变化 */
  async function selectClass(classId: string): Promise<void> {
    data.value = { ...data.value, current: { sem: data.value.current.sem, cls: classId } }
    await saveTeacher()
    setActivePage(activePage.value)
  }

  async function setRole(r: TeacherRole): Promise<void> {
    const c = cls.value
    if (!c) return
    data.value = {
      ...data.value,
      classes: data.value.classes.map((x) => (x.id === c.id ? { ...x, role: r } : x))
    }
    await saveTeacher()
    setActivePage(activePage.value)
  }

  async function updateClassInfo(patch: Partial<Pick<ClassGroup, 'grade' | 'name' | 'subject'>>): Promise<void> {
    const c = cls.value
    if (!c) return
    data.value = { ...data.value, classes: data.value.classes.map((x) => (x.id === c.id ? { ...x, ...patch } : x)) }
    await saveTeacher()
  }

  async function updateTeacherInfo(patch: { name?: string; subjects?: string[] }): Promise<void> {
    data.value = {
      ...data.value,
      teacher: {
        ...data.value.teacher,
        name: patch.name?.trim() || data.value.teacher.name,
        subjects: patch.subjects ?? data.value.teacher.subjects
      }
    }
    await saveTeacher()
  }

  // ---------- 页面切换（含可见性拦截） ----------

  function setActivePage(page: TeacherPageKey): void {
    activePage.value = guardPage(page, role.value)
  }

  // ---------- 学生 ----------

  async function addStudent(input: { no: string; name: string; gender: '男' | '女'; boarding?: boolean }): Promise<void> {
    const { sem, cls: cid } = data.value.current
    if (!sem || !cid || !input.name.trim()) return
    const no = input.no.trim() || String((bucket.value?.students.length ?? 0) + 1)
    const s: Student = {
      id: makeStudentId(sem, cid, no, input.name.trim()),
      no,
      name: input.name.trim(),
      gender: input.gender,
      special: false,
      post: '',
      address: '',
      boarding: input.boarding ?? false,
      health: { allergy: '', disease: '', notes: '', emergencyPhone: '' }
    }
    mutateBucket((b) => ({ ...b, students: [...b.students.filter((x) => x.id !== s.id), s] }))
    await saveTeacher()
  }

  async function updateStudent(studentId: string, patch: Partial<Student>): Promise<void> {
    if (patch.post !== undefined) {
      // 反向同步：手动改学生职务 → 回写班委（保留已有条目职责，新增缺失职务，移除多余职务）
      mutateBucket((b) => {
        const roles = (patch.post || '').split(/[、,，]/).map((r) => r.trim()).filter(Boolean)
        const roleSet = new Set(roles)
        const kept = b.committee.filter((c) => c.studentId === studentId && roleSet.has(c.role))
        const keptRoles = new Set(kept.map((c) => c.role))
        const added: CommitteeMember[] = roles
          .filter((r) => !keptRoles.has(r))
          .map((role) => ({ studentId, role, duty: '' }))
        const committee = [...b.committee.filter((c) => c.studentId !== studentId), ...kept, ...added]
        const next = {
          ...b,
          students: b.students.map((s) => (s.id === studentId ? { ...s, ...patch, id: s.id } : s)),
          committee
        }
        return { ...next, students: syncStudentPosts(next) }
      })
    } else {
      mutateBucket((b) => ({
        ...b,
        students: b.students.map((s) => (s.id === studentId ? { ...s, ...patch, id: s.id } : s))
      }))
    }
    await saveTeacher()
  }

  /** 删除学生：级联清理成绩/座位/值日/家长/点名历史，成长档案保留 */
  async function removeStudent(studentId: string): Promise<void> {
    mutateBucket((b) => removeStudentCascade(b, studentId))
    await saveTeacher()
  }

  /** 导入学生名单：整体替换名单，并同步重排座位 */
  async function importStudents(list: Student[]): Promise<void> {
    mutateBucket((b) => {
      const next = { ...b, students: list }
      return { ...next, seats: arrangeByRoster(list, next.seats.rows, next.seats.cols) }
    })
    await saveTeacher()
  }

  // ---------- 家长 ----------

  async function setParent(studentId: string, info: ParentInfo | null): Promise<void> {
    mutateBucket((b) => {
      const parents = { ...b.parents }
      if (info) parents[studentId] = info
      else delete parents[studentId]
      return { ...b, parents }
    })
    await saveTeacher()
  }

  async function importParents(map: Record<string, ParentInfo>): Promise<void> {
    mutateBucket((b) => ({ ...b, parents: { ...b.parents, ...map } }))
    await saveTeacher()
  }

  // ---------- 考试 / 成绩 ----------

  async function addExam(name: string, subject: string, date: string): Promise<string> {
    const id = uid('exam')
    mutateBucket((b) => ({
      ...b,
      exams: [...b.exams, { id, name: name.trim(), subject: subject.trim(), date: date.trim(), scores: {} }]
    }))
    await saveTeacher()
    return id
  }

  async function setScore(examId: string, studentId: string, score: number | null): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      exams: b.exams.map((e) => {
        if (e.id !== examId) return e
        const scores = { ...e.scores }
        if (score === null || !Number.isFinite(score)) delete scores[studentId]
        else scores[studentId] = score
        return { ...e, scores }
      })
    }))
    await saveTeacher()
  }

  async function importExams(list: { name: string; subject: string; scores: Record<string, number> }[]): Promise<void> {
    if (!list.length) return
    const date = new Date().toISOString().slice(0, 7)
    mutateBucket((b) => ({
      ...b,
      exams: [...b.exams, ...list.map((x) => ({ id: uid('exam'), name: x.name, subject: x.subject, date, scores: { ...x.scores } }))]
    }))
    await saveTeacher()
  }

  async function deleteExam(examId: string): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      exams: b.exams.filter((e) => e.id !== examId),
      papers: b.papers.filter((p) => p.examId !== examId)
    }))
    await saveTeacher()
  }

  // ---------- 试卷 ----------

  async function addPaper(examId: string, title: string): Promise<string> {
    const id = uid('paper')
    mutateBucket((b) => ({ ...b, papers: [...b.papers, { id, examId, title: title.trim(), questions: [] }] }))
    await saveTeacher()
    return id
  }

  async function setPaperQuestions(
    paperId: string,
    questions: { no: number; type: string; point: string; wrongCount: number }[]
  ): Promise<void> {
    mutateBucket((b) => ({ ...b, papers: b.papers.map((p) => (p.id === paperId ? { ...p, questions } : p)) }))
    await saveTeacher()
  }

  async function deletePaper(paperId: string): Promise<void> {
    mutateBucket((b) => ({ ...b, papers: b.papers.filter((p) => p.id !== paperId) }))
    await saveTeacher()
  }

  // ---------- 座位 ----------

  async function setSeatLayout(rows: number, cols: number): Promise<void> {
    mutateBucket((b) => ({ ...b, seats: resizeSeats(b.seats, rows, cols) }))
    await saveTeacher()
  }

  async function arrangeSeats(mode: 'roster' | 'random'): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      seats: mode === 'roster' ? arrangeByRoster(b.students, b.seats.rows, b.seats.cols) : arrangeRandom(b.students, b.seats.rows, b.seats.cols)
    }))
    await saveTeacher()
  }

  async function swapSeat(i: number, j: number): Promise<void> {
    mutateBucket((b) => ({ ...b, seats: { ...b.seats, grid: swapSeats(b.seats.grid, i, j) } }))
    await saveTeacher()
  }

  // ---------- 值日 / 班委 ----------

  async function setDutyMembers(day: string, members: string[], leader: string): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      duty: { ...b.duty, days: b.duty.days.map((d) => (d.day === day ? { ...d, members, leader } : d)) }
    }))
    await saveTeacher()
  }

  async function autoDuty(groupSize: number): Promise<void> {
    mutateBucket((b) => ({ ...b, duty: { ...b.duty, days: autoArrangeDuty(b.students, groupSize).days } }))
    await saveTeacher()
  }

  async function setCommittee(list: CommitteeMember[]): Promise<void> {
    mutateBucket((b) => {
      const next = { ...b, committee: list }
      return { ...next, students: syncStudentPosts(next) }
    })
    await saveTeacher()
  }

  // ---------- 课程表（富模型，按班级隔离，落在 ClassBucket.timetable） ----------

  /** 整体写入当前班级课程表（富模型 StudentTimetableData），供教师课程表面板 / 配置 / 数据管理导入统一调用 */
  async function updateTimetable(timetable: StudentTimetableData): Promise<void> {
    mutateBucket((b) => ({ ...b, timetable }))
    await saveTeacher()
  }

  // ---------- 奖励记录（growth 桶，原「学生成长档案」） ----------

  async function addGrowth(studentId: string, rec: Omit<GrowthRecord, 'id'>): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      growth: { ...b.growth, [studentId]: [...(b.growth[studentId] ?? []), { ...rec, id: uid('grow') }] }
    }))
    await saveTeacher()
  }

  async function updateGrowth(studentId: string, rec: GrowthRecord): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      growth: {
        ...b.growth,
        [studentId]: (b.growth[studentId] ?? []).map((g) => (g.id === rec.id ? rec : g))
      }
    }))
    await saveTeacher()
  }

  async function removeGrowth(studentId: string, recId: string): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      growth: { ...b.growth, [studentId]: (b.growth[studentId] ?? []).filter((g) => g.id !== recId) }
    }))
    await saveTeacher()
  }

  // ---------- 请假信息（leaves 桶，班主任专属） ----------

  /** 新增请假：id / createdAt 由 store 生成；天数缺省按起止日期自动计算 */
  async function addLeave(rec: Omit<LeaveRecord, 'id' | 'createdAt'>): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      leaves: [...(b.leaves ?? []), { ...rec, id: uid('leave'), createdAt: todayStr() }]
    }))
    await saveTeacher()
  }

  async function updateLeave(rec: LeaveRecord): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      leaves: (b.leaves ?? []).map((l) => (l.id === rec.id ? { ...rec } : l))
    }))
    await saveTeacher()
  }

  async function removeLeave(id: string): Promise<void> {
    mutateBucket((b) => ({ ...b, leaves: (b.leaves ?? []).filter((l) => l.id !== id) }))
    await saveTeacher()
  }

  /** 状态流转：批准 / 不批准 / 销假（销假时 remark 追加销假说明） */
  async function setLeaveStatus(id: string, status: LeaveStatus, remark?: string): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      leaves: (b.leaves ?? []).map((l) =>
        l.id === id ? { ...l, status, remark: remark === undefined ? l.remark : remark } : l
      )
    }))
    await saveTeacher()
  }

  /** 当前班级请假统计（页面直接消费，store 不内联重算） */
  const leaveSummary = computed(() => leaveStats(bucket.value?.leaves ?? []))

  // ---------- 作业记录（homeworks 桶；仅记录未交同学，每人一条独立记录） ----------

  /** 新增作业：初始状态为「已布置」，按当前名册为每位在册同学生成一条 pending 未交记录（冗余姓名/学号） */
  async function addHomework(
    input: Omit<TeacherHomework, 'id' | 'createdAt' | 'updatedAt' | 'misses' | 'status'>
  ): Promise<void> {
    const students = bucket.value?.students ?? []
    const now = todayStr()
    const hw: TeacherHomework = {
      ...input,
      id: uid('thw'),
      status: 'assigned',
      createdAt: now,
      updatedAt: now,
      misses: initMissesFromRoster(students)
    }
    mutateBucket((b) => ({ ...b, homeworks: [...b.homeworks, hw] }))
    await saveTeacher()
  }

  /** 编辑作业元信息（不改未交名单）；标题等可修正 */
  async function updateHomework(hw: TeacherHomework): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      homeworks: b.homeworks.map((h) => (h.id === hw.id ? { ...hw, updatedAt: todayStr() } : h))
    }))
    await saveTeacher()
  }

  async function removeHomework(id: string): Promise<void> {
    mutateBucket((b) => ({ ...b, homeworks: b.homeworks.filter((h) => h.id !== id) }))
    await saveTeacher()
  }

  /** 标记某条记录为「已交」（按时提交；清空补交时间/备注） */
  async function markSubmitted(homeworkId: string, missId: string): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      homeworks: b.homeworks.map((h) => {
        if (h.id !== homeworkId) return h
        return {
          ...h,
          updatedAt: todayStr(),
          misses: h.misses.map((m) =>
            m.id === missId ? { ...m, status: 'submitted', madeUpAt: undefined, note: undefined } : m
          )
        }
      })
    }))
    await saveTeacher()
  }

  /** 标记某条记录为「未交」（回到待提交；清空补交时间/备注） */
  async function markPending(homeworkId: string, missId: string): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      homeworks: b.homeworks.map((h) => {
        if (h.id !== homeworkId) return h
        return {
          ...h,
          updatedAt: todayStr(),
          misses: h.misses.map((m) =>
            m.id === missId ? { ...m, status: 'pending', madeUpAt: undefined, note: undefined } : m
          )
        }
      })
    }))
    await saveTeacher()
  }

  /** 标记某条记录为「已补交」（人工填写补交时间/备注，留空则保持空） */
  async function markMadeup(
    homeworkId: string,
    missId: string,
    patch: { madeUpAt?: string; note?: string }
  ): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      homeworks: b.homeworks.map((h) => {
        if (h.id !== homeworkId) return h
        return {
          ...h,
          updatedAt: todayStr(),
          misses: h.misses.map((m) =>
            m.id === missId
              ? { ...m, status: 'madeup', madeUpAt: patch.madeUpAt ?? m.madeUpAt ?? '', note: patch.note ?? m.note ?? '' }
              : m
          )
        }
      })
    }))
    await saveTeacher()
  }

  /** 撤销补交：状态回到未交，清空补交时间/备注 */
  async function revertMadeup(homeworkId: string, missId: string): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      homeworks: b.homeworks.map((h) => {
        if (h.id !== homeworkId) return h
        return {
          ...h,
          updatedAt: todayStr(),
          misses: h.misses.map((m) =>
            m.id === missId ? { ...m, status: 'pending', madeUpAt: undefined, note: undefined } : m
          )
        }
      })
    }))
    await saveTeacher()
  }

  /** 导出当前作业的未交名单（仅 pending）为 Excel */
  async function exportMissesExcel(homeworkId: string): Promise<void> {
    const hw = bucket.value?.homeworks.find((h) => h.id === homeworkId)
    if (!hw) return
    await exportHomeworkMissesExcel(hw, classTitle(cls.value, data.value.teacher.name))
  }

  /** 当前班级作业统计（聚合所有作业的未交/已交/已补交人数） */
  const homeworkSummary = computed(() => {
    const homeworks = bucket.value?.homeworks ?? []
    let pending = 0
    let submitted = 0
    let madeup = 0
    for (const h of homeworks) {
      for (const m of h.misses) {
        if (m.status === 'madeup') madeup++
        else if (m.status === 'submitted') submitted++
        else pending++
      }
    }
    return { homeworkCount: homeworks.length, pending, submitted, madeup }
  })

  // ---------- 家校谈话记录（talks 桶；班主任专属；随学期×班级隔离） ----------

  /** 新增谈话：自动补全冗余姓名/学号（若未传则按 studentId 反查名册） */
  async function addTalk(
    input: Omit<HomeSchoolTalkRecord, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<void> {
    const students = bucket.value?.students ?? []
    const stu = students.find((s) => s.id === input.studentId)
    const now = Date.now()
    const talk: HomeSchoolTalkRecord = {
      ...input,
      studentName: input.studentName || stu?.name || '',
      studentNo: input.studentNo || stu?.no || undefined,
      id: uid('talk'),
      createdAt: now,
      updatedAt: now
    }
    mutateBucket((b) => ({ ...b, talks: [...b.talks, talk] }))
    await saveTeacher()
  }

  /** 编辑谈话（回显后保存；updatedAt 刷新） */
  async function updateTalk(talk: HomeSchoolTalkRecord): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      talks: b.talks.map((t) => (t.id === talk.id ? { ...talk, updatedAt: Date.now() } : t))
    }))
    await saveTeacher()
  }

  async function removeTalk(id: string): Promise<void> {
    mutateBucket((b) => ({ ...b, talks: b.talks.filter((t) => t.id !== id) }))
    await saveTeacher()
  }

  /** 导出当前筛选后的谈话记录为 Excel */
  async function exportTalksExcel(talks: HomeSchoolTalkRecord[]): Promise<void> {
    await exportTalksExcelFile(talks, classTitle(cls.value, data.value.teacher.name))
  }

  /** 本班谈话统计：总数 / 本月次数 / 待跟进数 / 涉及分类数 */
  const talksSummary = computed(() => {
    const talks = bucket.value?.talks ?? []
    const now = new Date()
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    let thisMonth = 0
    let needFollowUp = 0
    const cats = new Set<string>()
    for (const t of talks) {
      if (t.date && t.date.startsWith(ym)) thisMonth++
      if (t.needFollowUp) needFollowUp++
      if (t.category) cats.add(t.category)
    }
    return { total: talks.length, thisMonth, needFollowUp, categories: cats.size }
  })

  // ---------- 随机点名 ----------

  async function setRandomMode(mode: 'all' | 'once'): Promise<void> {
    mutateBucket((b) => ({ ...b, random: { ...b.random, mode } }))
    await saveTeacher()
  }

  async function pushRandomHistory(studentId: string): Promise<void> {
    mutateBucket((b) => ({ ...b, random: { ...b.random, history: [...b.random.history, studentId] } }))
    await saveTeacher()
  }

  async function resetRandomHistory(): Promise<void> {
    mutateBucket((b) => ({ ...b, random: { ...b.random, history: [] } }))
    await saveTeacher()
  }

  async function removeRandomHistory(studentId: string): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      random: { ...b.random, history: b.random.history.filter((id) => id !== studentId) }
    }))
    await saveTeacher()
  }

  // ---------- 数据管理 ----------

  async function importBackup(raw: unknown): Promise<void> {
    data.value = normalizeTeacherData(raw)
    await saveTeacher()
    setActivePage(activePage.value)
  }

  async function clearAll(): Promise<void> {
    data.value = emptyTeacherData()
    await saveTeacher()
  }

  /** 一键填充演示数据（全部虚构） */
  async function loadDemoData(): Promise<void> {
    const semId = uid('sem')
    const clsId = uid('cls')
    // 示例数据学生名册：采用为国家做出杰出贡献的名人姓名（科学家、工程师等），便于演示时辩识。
    const names: [string, '男' | '女'][] = [
      ['钱学森', '男'], ['邓稼先', '男'], ['袁隆平', '男'], ['屠呦呦', '女'], ['李四光', '男'],
      ['华罗庚', '男'], ['竺可桢', '男'], ['谢希德', '女'], ['孙家栋', '男'], ['黄旭华', '男'],
      ['南仁东', '男'], ['林巧稚', '女'], ['王选', '男'], ['于敏', '男'], ['顾方舟', '男'],
      ['何泽慧', '女'], ['王承书', '女'], ['吴孟超', '男'], ['茅以升', '男'], ['詹天佑', '男']
    ]
    const students: Student[] = names.map(([name, gender], i) => ({
      id: makeStudentId(semId, clsId, String(i + 1), name),
      no: String(i + 1),
      name,
      gender,
      special: [2, 9, 15].includes(i),
      post: '',
      address: '',
      boarding: [3, 11, 16].includes(i),
      health: {
        allergy: [2, 9, 15].includes(i) ? '花生' : '',
        disease: '',
        notes: [2, 9, 15].includes(i) ? '避免接触过敏原，剧烈运动需观察' : '',
        emergencyPhone: ''
      }
    }))
    students[0].post = '班长' // 演示数据：首名学生任班长，与班委信息联动
    const b = emptyBucket()
    const seats = arrangeByRoster(students, b.seats.rows, b.seats.cols)
    const duty = autoArrangeDuty(students, 4)
    const examScores: Record<string, number> = {}
    students.forEach((s, i) => {
      examScores[s.id] = 60 + ((i * 7) % 40)
    })
    const parents: Record<string, ParentInfo> = {}
    students.slice(0, 12).forEach((s, i) => {
      parents[s.id] = { parentName: `${s.name}家长`, relation: i % 2 ? '妈妈' : '爸爸', phone: `1390000${String(1000 + i).slice(-4)}` }
    })

    data.value = {
      schemaVer: 1,
      teacher: { id: 'teacher_1', name: '王老师', subjects: ['语文', '数学'] },
      semesters: [{ id: semId, year: '2026', term: '上半年', createdAt: Date.now() }],
      classes: [{ id: clsId, semesterId: semId, stage: '小学', grade: '三年级', name: '1班', role: 'head', subject: '语文' }],
      assignments: [{ id: uid('asg'), teacherId: 'teacher_1', semesterId: semId, classId: clsId, subject: '语文' }],
      current: { sem: semId, cls: clsId },
      groups: {
        [semId]: {
          [clsId]: {
            ...b,
            students,
            seats,
            duty: { days: duty.days },
            committee: [{ studentId: students[0].id, role: '班长', duty: '全面负责班级事务' }],
            parents,
            exams: [{ id: uid('exam'), name: '语文期中', subject: '语文', date: '2026-04', scores: examScores }],
            papers: [
              {
                id: uid('paper'),
                examId: '',
                title: '语文期中试卷',
                questions: [
                  { no: 1, type: '选择题', point: '字音', wrongCount: 12 },
                  { no: 2, type: '填空题', point: '古诗默写', wrongCount: 8 },
                  { no: 3, type: '阅读理解', point: '概括段意', wrongCount: 15 }
                ]
              }
            ],
            timetable: (() => {
              const timing = emptyTiming()
              const schedule: StudentTimetableSchedule = {}
              // 演示课表：周一~周四各 4 节（di+1=day，pi+1=period），时间按节次配置推算
              const demo: [number, number, string][] = [
                [1, 1, '语文'], [1, 2, '数学'], [1, 3, '英语'], [1, 4, '体育'],
                [2, 1, '数学'], [2, 2, '语文'], [2, 3, '音乐'], [2, 4, '美术'],
                [3, 1, '英语'], [3, 2, '科学'], [3, 3, '语文'], [3, 4, '书法'],
                [4, 1, '语文'], [4, 2, '数学'], [4, 3, '体育'], [4, 4, '班会']
              ]
              for (const [day, period, subject] of demo) {
                const { startHHMM, endHHMM } = computePeriodTime(period, timing)
                schedule[cellKey(day, period)] = { subject, startHHMM, endHHMM }
              }
              return { ...emptyTimetableData(), classroom: '三年级1班', schedule }
            })(),
            growth: {
              [students[0].id]: [
                { id: uid('grow'), date: '2026-05-08', title: '期中进步之星', content: '数学期中成绩进步明显。', photos: [] }
              ]
            },
            random: { history: [], mode: 'all' },
            talks: [
              {
                id: uid('talk'),
                studentId: students[0].id,
                studentName: students[0].name,
                studentNo: students[0].no,
                date: '2026-05-10',
                time: '19:30',
                mode: '电话',
                counterpart: '母亲',
                counterpartName: '',
                category: '学业',
                content: '近期数学成绩下滑，已沟通课后辅导计划，家长配合督促完成每日练习。',
                result: '约定每周五反馈一次练习完成情况。',
                needFollowUp: true,
                followUpNote: '下周五前回访练习完成情况。',
                createdAt: Date.now(),
                updatedAt: Date.now()
              },
              {
                id: uid('talk'),
                studentId: students[1].id,
                studentName: students[1].name,
                studentNo: students[1].no,
                date: '2026-05-15',
                mode: '微信',
                counterpart: '父亲',
                category: '心理情绪',
                content: '家长反映孩子近期情绪低落，了解后疑似亲子沟通较少，建议多陪伴。',
                result: '已提供亲子沟通建议，家长表示会调整。',
                needFollowUp: false,
                createdAt: Date.now(),
                updatedAt: Date.now()
              }
            ]
          }
        }
      }
    }
    await saveTeacher()
    setActivePage('students')
  }

  return {
    data,
    activePage,
    bucket,
    cls,
    role,
    isHead,
    groups,
    menuAllGroups,
    menuItems,
    semesters,
    classesOfCurrentSem,
    needsSemester,
    needsClass,
    defaultSelection,
    isDefaultCurrent,
    isDefaultSemester,
    isDefaultClass,
    defaultLabelOf,
    setDefaultSelection,
    clearDefaultSelection,
    loadTeacher,
    saveTeacher,
    addSemester,
    deleteSemester,
    clearSemesterData,
    addClass,
    deleteClass,
    createClassEntry,
    updateClassEntry,
    markDefault,
    selectSemester,
    selectClass,
    setRole,
    updateClassInfo,
    updateTeacherInfo,
    setActivePage,
    moveMenuItem,
    renameMenuItem,
    resetMenu,
    addStudent,
    updateStudent,
    removeStudent,
    importStudents,
    setParent,
    importParents,
    addExam,
    setScore,
    importExams,
    deleteExam,
    addPaper,
    setPaperQuestions,
    deletePaper,
    setSeatLayout,
    arrangeSeats,
    swapSeat,
    setDutyMembers,
    autoDuty,
    setCommittee,
    updateTimetable,
    addGrowth,
    updateGrowth,
    removeGrowth,
    addLeave,
    updateLeave,
    removeLeave,
    setLeaveStatus,
    leaveSummary,
    addHomework,
    updateHomework,
    removeHomework,
    markSubmitted,
    markPending,
    markMadeup,
    revertMadeup,
    exportMissesExcel,
    homeworkSummary,
    addTalk,
    updateTalk,
    removeTalk,
    exportTalksExcel,
    talksSummary,
    setRandomMode,
    pushRandomHistory,
    resetRandomHistory,
    removeRandomHistory,
    importBackup,
    clearAll,
    loadDemoData
  }
})

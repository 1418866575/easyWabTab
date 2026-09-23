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
  currentBucket,
  currentClass,
  currentRole,
  emptyBucket,
  emptyTeacherData,
  guardPage,
  makeStudentId,
  normalizeTeacherData,
  removeStudentCascade,
  resizeSeats,
  resolveCurrent,
  resolveDefaultSelection,
  swapSeats,
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
  type ClassBucket,
  type ClassGroup,
  type GrowthRecord,
  type ParentInfo,
  type Student,
  type TeacherData,
  type TeacherPageKey,
  type TeacherRole,
  WEEK_DAYS
} from '@/types/teacher'

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
    const sem = { id, year: year.trim(), term: term.trim(), createdAt: Date.now() }
    data.value = {
      ...data.value,
      semesters: [...data.value.semesters, sem],
      groups: { ...data.value.groups, [id]: {} },
      current: resolveCurrent({ ...data.value, semesters: [...data.value.semesters, sem], current: { sem: id, cls: '' } })
    }
    await saveTeacher()
    return id
  }

  async function addClass(grade: string, name: string, subject: string, role_: TeacherRole): Promise<string> {
    const semId = data.value.current.sem
    if (!semId) return ''
    const id = uid('cls')
    const c: ClassGroup = { id, semesterId: semId, grade: grade.trim(), name: name.trim(), role: role_, subject: subject.trim() }
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
    const { sem } = data.value.current
    const inner = { ...(data.value.groups[sem] ?? {}) }
    delete inner[classId]
    const classes = data.value.classes.filter((c) => c.id !== classId)
    // 删掉的正是默认班级 → 清空默认组合，避免指向不存在的班级
    const defaultSelection =
      data.value.defaultSelection?.cls === classId ? { sem: '', cls: '' } : data.value.defaultSelection
    data.value = {
      ...data.value,
      classes,
      assignments: data.value.assignments.filter((a) => a.classId !== classId),
      groups: { ...data.value.groups, [sem]: inner },
      defaultSelection,
      current: resolveCurrent({
        ...data.value,
        classes,
        groups: { ...data.value.groups, [sem]: inner },
        current: { sem, cls: '' }
      })
    }
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
    data.value = {
      ...data.value,
      semesters,
      classes,
      assignments: data.value.assignments.filter((a) => a.semesterId !== semId),
      groups,
      defaultSelection,
      current: resolveCurrent({ ...data.value, semesters, classes, groups, current: { sem: '', cls: '' } })
    }
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

  async function addStudent(input: { no: string; name: string; gender: '男' | '女' }): Promise<void> {
    const { sem, cls: cid } = data.value.current
    if (!sem || !cid || !input.name.trim()) return
    const no = input.no.trim() || String((bucket.value?.students.length ?? 0) + 1)
    const s: Student = {
      id: makeStudentId(sem, cid, no, input.name.trim()),
      no,
      name: input.name.trim(),
      gender: input.gender,
      special: false,
      health: { allergy: '', disease: '', notes: '', emergencyPhone: '' }
    }
    mutateBucket((b) => ({ ...b, students: [...b.students.filter((x) => x.id !== s.id), s] }))
    await saveTeacher()
  }

  async function updateStudent(studentId: string, patch: Partial<Student>): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      students: b.students.map((s) => (s.id === studentId ? { ...s, ...patch, id: s.id } : s))
    }))
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

  async function setCommittee(list: { role: string; name: string; duty: string }[]): Promise<void> {
    mutateBucket((b) => ({ ...b, duty: { ...b.duty, committee: list } }))
    await saveTeacher()
  }

  // ---------- 课程表 ----------

  async function setTimetableCell(period: number, day: number, subject: string): Promise<void> {
    mutateBucket((b) => {
      const grid = b.timetable.grid.map((row, pi) =>
        pi === period ? row.map((v, di) => (di === day ? (subject.trim() || null) : v)) : row
      )
      return { ...b, timetable: { ...b.timetable, grid } }
    })
    await saveTeacher()
  }

  async function setTimetablePeriods(periods: { label: string; time: string }[]): Promise<void> {
    mutateBucket((b) => {
      const grid = periods.map((_, pi) => b.timetable.grid[pi] ?? Array.from({ length: WEEK_DAYS.length }, () => null))
      return { ...b, timetable: { periods, grid } }
    })
    await saveTeacher()
  }

  async function clearTimetable(): Promise<void> {
    mutateBucket((b) => ({
      ...b,
      timetable: { ...b.timetable, grid: b.timetable.grid.map((row) => row.map(() => null)) }
    }))
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
    const names: [string, '男' | '女'][] = [
      ['闫婉', '女'], ['曹静', '女'], ['夏梓', '女'], ['陈昊', '男'], ['李泽', '男'],
      ['王悦', '女'], ['赵磊', '男'], ['孙倩', '女'], ['周涛', '男'], ['吴敏', '女'],
      ['郑凯', '男'], ['冯雪', '女'], ['蒋宇', '男'], ['韩露', '女'], ['沈鹏', '男'],
      ['许诺', '女'], ['何俊', '男'], ['吕珊', '女'], ['施磊', '男'], ['张萌', '女']
    ]
    const students: Student[] = names.map(([name, gender], i) => ({
      id: makeStudentId(semId, clsId, String(i + 1), name),
      no: String(i + 1),
      name,
      gender,
      special: [2, 9, 15].includes(i),
      health: {
        allergy: [2, 9, 15].includes(i) ? '花生' : '',
        disease: '',
        notes: [2, 9, 15].includes(i) ? '避免接触过敏原，剧烈运动需观察' : '',
        emergencyPhone: ''
      }
    }))
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
      semesters: [{ id: semId, year: '2026', term: '上学期', createdAt: Date.now() }],
      classes: [{ id: clsId, semesterId: semId, grade: '三年级', name: '1班', role: 'head', subject: '语文' }],
      assignments: [{ id: uid('asg'), teacherId: 'teacher_1', semesterId: semId, classId: clsId, subject: '语文' }],
      current: { sem: semId, cls: clsId },
      groups: {
        [semId]: {
          [clsId]: {
            ...b,
            students,
            seats,
            duty: { days: duty.days, committee: [{ role: '班长', name: students[0].id, duty: '全面负责班级事务' }] },
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
            timetable: {
              periods: b.timetable.periods,
              grid: b.timetable.grid.map((row, pi) =>
                row.map((_, di) => (pi < 4 && di < 5 ? ['语文', '数学', '语文', '英语', '体育'][di] : null))
              )
            },
            growth: {
              [students[0].id]: [
                { id: uid('grow'), date: '2026-05-08', title: '期中进步之星', content: '数学期中成绩进步明显。', photos: [] }
              ]
            },
            random: { history: [], mode: 'all' }
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
    addClass,
    deleteClass,
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
    setTimetableCell,
    setTimetablePeriods,
    clearTimetable,
    addGrowth,
    updateGrowth,
    removeGrowth,
    setRandomMode,
    pushRandomHistory,
    resetRandomHistory,
    importBackup,
    clearAll,
    loadDemoData
  }
})

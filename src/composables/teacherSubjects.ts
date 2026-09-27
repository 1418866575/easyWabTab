// 教师工作台学科全集：按 小学 / 初中 / 高中 / 大学 四阶段分组。
// 用于「任教科目 / 学科 / 科目」输入统一改造为下拉选择框（见 SubjectSelect.vue）。
// 注：按需求仅覆盖这四个阶段；幼儿园阶段不在此列。

import type { TeacherStage } from '@/types/teacher'

/** 下拉涵盖的教育阶段（按需求仅小学/初中/高中/大学，不含幼儿园） */
export type SubjectStage = Exclude<TeacherStage, '幼儿园'>

/** 纳入下拉的四个教育阶段（顺序即展示顺序） */
export const SUBJECT_STAGES: SubjectStage[] = ['小学', '初中', '高中', '大学']

/** 各阶段标准学科全集（覆盖国家课程主体 + 常见校本/实践类课程） */
export const TEACHER_SUBJECTS_BY_STAGE: Record<SubjectStage, string[]> = {
  小学: [
    '语文',
    '数学',
    '英语',
    '道德与法治',
    '科学',
    '信息技术',
    '音乐',
    '美术',
    '体育与健康',
    '劳动',
    '综合实践活动',
    '校本课程',
    '心理健康',
    '书法',
    '阅读',
    '国学/经典诵读'
  ],
  初中: [
    '语文',
    '数学',
    '英语',
    '道德与法治',
    '历史',
    '地理',
    '物理',
    '化学',
    '生物',
    '信息技术',
    '音乐',
    '美术',
    '体育与健康',
    '劳动',
    '综合实践活动',
    '心理健康',
    '校本课程',
    '阅读'
  ],
  高中: [
    '语文',
    '数学',
    '英语',
    '思想政治',
    '历史',
    '地理',
    '物理',
    '化学',
    '生物',
    '信息技术',
    '通用技术',
    '音乐',
    '美术',
    '体育与健康',
    '劳动',
    '综合实践活动',
    '心理健康',
    '校本课程',
    '研究性学习',
    '阅读'
  ],
  大学: [
    '高等数学',
    '线性代数',
    '概率论与数理统计',
    '大学英语',
    '大学语文',
    '大学物理',
    '程序设计',
    '数据结构',
    '计算机基础',
    '马克思主义基本原理',
    '思想道德与法治',
    '中国近现代史纲要',
    '毛泽东思想和中国特色社会主义理论体系概论',
    '体育',
    '专业基础课',
    '专业课',
    '实验课',
    '实习实训',
    '毕业设计（论文）',
    '通识选修课'
  ]
}

export interface TeacherSubjectGroup {
  stage: SubjectStage
  subjects: string[]
}

/** 按阶段分组后的下拉数据源（el-option-group 直接消费） */
export const TEACHER_SUBJECT_GROUPS: TeacherSubjectGroup[] = SUBJECT_STAGES.map((stage) => ({
  stage,
  subjects: TEACHER_SUBJECTS_BY_STAGE[stage]
}))

/** 扁平化的全部学科（去重，保持阶段顺序） */
export function allTeacherSubjects(): string[] {
  return SUBJECT_STAGES.flatMap((s) => TEACHER_SUBJECTS_BY_STAGE[s])
}

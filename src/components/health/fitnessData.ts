/**
 * 健康工作台 · 健身动作静态数据
 *
 * 来源：动作库按锻炼部位分类（胸/背/腿/肩/手臂/核心/全身），共 28 个动作。
 * 其中 5 个腹训动作（平板支撑、卷腹等）要点参考公众号《5 个居家腹训动作》。
 * 内容为家庭训练常识参考，非医疗建议。
 */
/** 锻炼部位：会直接显示在页签与卡片上 */
export type FitnessPart = '胸' | '背' | '腿' | '肩' | '手臂' | '核心' | '全身'
export type FitnessEquipment = '徒手' | '简易器械'
export type FitnessDifficulty = '初级' | '中级'

export interface FitnessMove {
  id: string
  name: string
  part: FitnessPart
  emoji: string
  equipment: FitnessEquipment
  difficulty: FitnessDifficulty
  /** 目标肌群 */
  target: string
  /** 动作要点 */
  keyPoints: string[]
  /** 常见错误 */
  mistakes: string[]
  /** 安全提示 */
  safety: string[]
  /** 训练组次 */
  sets: string
  source: string
}

export const FITNESS_PARTS: readonly FitnessPart[] = ['胸', '背', '腿', '肩', '手臂', '核心', '全身']

const SRC_CORE = '《5 个居家腹训动作》'
const SRC_COMMON = '家常健身动作整理'

/** 每条动作按现有菜谱结构写法：要点/错误/安全各成数组，便于弹框分栏展示 */
const SEEDS: FitnessMove[] = [
  {
    id: 'push-up', name: '俯卧撑', part: '胸', emoji: '💪',
    equipment: '徒手', difficulty: '初级', target: '胸大肌、肱三头肌、三角肌前束',
    keyPoints: ['双手略宽于肩撑地，身体从头到脚成一条直线。', '屈肘缓慢下放至胸口接近地面，大臂与身体约 45°。', '呼气推起至手臂伸直，顶点稍停再重复。'],
    mistakes: ['塌腰或翘臀，核心没有收紧。', '手肘过度外展，肩关节承压过大。'],
    safety: ['肩部有伤者改用跪姿或靠墙俯卧撑。', '出现肩痛立即停止，不要硬撑。'],
    sets: '3 组 × 8~15 次，组间休息 60 秒', source: SRC_COMMON
  },
  {
    id: 'kneeling-push-up', name: '跪姿俯卧撑', part: '胸', emoji: '🙇',
    equipment: '徒手', difficulty: '初级', target: '胸大肌下部、肱三头肌',
    keyPoints: ['双膝跪地、脚踝交叉，身体从膝到头成直线。', '双手略宽于肩，屈肘下放至胸口接近地面。', '呼气推起，保持核心收紧不塌腰。'],
    mistakes: ['臀部后坐，身体没有成线。', '下放幅度太小，胸肌没有拉伸。'],
    safety: ['手腕不适可握拳或用俯卧撑支架。', '膝盖垫软物避免压痛。'],
    sets: '3 组 × 10~15 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'dumbbell-bench', name: '哑铃卧推', part: '胸', emoji: '🏋️',
    equipment: '简易器械', difficulty: '中级', target: '胸大肌、三角肌前束、肱三头肌',
    keyPoints: ['仰卧凳上，双手持哑铃置于胸两侧，手腕中立。', '向上推起至手臂接近伸直，顶点挤压胸肌。', '缓慢下放至起始位，全程控制。'],
    mistakes: ['手肘大幅外展，肩部代偿。', '借腰背弓起发力，增加腰部负担。'],
    safety: ['重量从轻开始，力竭时有人保护。', '肩袖有伤者避免过度下放。'],
    sets: '3 组 × 8~12 次，组间休息 90 秒', source: SRC_COMMON
  },
  {
    id: 'incline-push-up', name: '上斜俯卧撑', part: '胸', emoji: '📐',
    equipment: '徒手', difficulty: '初级', target: '胸大肌上部、三角肌前束',
    keyPoints: ['双手撑在台阶或椅面，身体成斜线。', '屈肘下放至胸口接近支撑面。', '呼气推起，保持核心与臀部稳定。'],
    mistakes: ['支撑面太高导致难度过低。', '肩部耸起，颈部紧张。'],
    safety: ['确认支撑物稳固不滑动。', '肩痛者减小倾斜角度。'],
    sets: '3 组 × 10~15 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'doorway-row', name: '门框划船', part: '背', emoji: '🚪',
    equipment: '徒手', difficulty: '初级', target: '背阔肌、菱形肌',
    keyPoints: ['面对门框握住两侧，身体后倾成斜线。', '呼气背部发力将胸口拉向门框。', '顶峰挤压肩胛骨，缓慢放回。'],
    mistakes: ['用手臂硬拉，背部没有参与。', '身体过于直立，难度过低。'],
    safety: ['确认门框与握点牢固。', '腰部保持挺直，不要塌腰。'],
    sets: '3 组 × 10~12 次，组间休息 60 秒', source: SRC_COMMON
  },
  {
    id: 'dumbbell-row', name: '俯身哑铃划船', part: '背', emoji: '🚣',
    equipment: '简易器械', difficulty: '中级', target: '背阔肌、斜方肌中下部',
    keyPoints: ['俯身屈髋，背部挺直，单手持哑铃自然下垂。', '呼气将哑铃沿身体拉向髋部，肘部贴身后拉。', '顶峰停 1 秒，缓慢下放。'],
    mistakes: ['弓背借助惯性甩铃。', '肘部外展，背部发力不足。'],
    safety: ['腰部始终挺直，避免腰椎承压。', '重量不宜过大。'],
    sets: '3 组 × 每侧 10~12 次，组间休息 90 秒', source: SRC_COMMON
  },
  {
    id: 'superman', name: '超人式', part: '背', emoji: '🦸',
    equipment: '徒手', difficulty: '初级', target: '竖脊肌、臀大肌',
    keyPoints: ['俯卧，双臂前伸、双腿伸直。', '呼气同时抬起手臂与双腿，离地数厘米。', '顶峰停顿 1 秒，缓慢放下。'],
    mistakes: ['抬得过高导致腰部过度反弓。', '速度过快借惯性。'],
    safety: ['腰部不适者减小抬起幅度。', '颈部保持中立，不要抬头。'],
    sets: '3 组 × 12 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'dumbbell-deadlift', name: '哑铃硬拉', part: '背', emoji: '🏋️',
    equipment: '简易器械', difficulty: '中级', target: '竖脊肌、臀腿后链',
    keyPoints: ['双脚与肩同宽，双手持哑铃于腿前。', '屈髋屈膝，背部挺直，哑铃贴腿下放。', '呼气臀腿发力站起，顶点挺髋。'],
    mistakes: ['弓背拉起，腰椎承压。', '哑铃远离身体，力臂变长。'],
    safety: ['重量从轻开始，动作标准优先。', '腰部有伤者避免此动作。'],
    sets: '3 组 × 10~12 次，组间休息 90 秒', source: SRC_COMMON
  },
  {
    id: 'bodyweight-squat', name: '徒手深蹲', part: '腿', emoji: '🦵',
    equipment: '徒手', difficulty: '初级', target: '股四头肌、臀大肌',
    keyPoints: ['双脚与肩同宽，脚尖略外展。', '屈髋屈膝下蹲至大腿接近水平，膝盖对齐脚尖。', '呼气脚跟发力站起，顶点挺髋。'],
    mistakes: ['膝盖内扣。', '弓背或脚跟离地。'],
    safety: ['膝盖有伤者减小下蹲深度。', '下蹲时保持膝盖与脚尖方向一致。'],
    sets: '3 组 × 15~20 次，组间休息 60 秒', source: SRC_COMMON
  },
  {
    id: 'lunge', name: '弓步蹲', part: '腿', emoji: '🏃',
    equipment: '徒手', difficulty: '初级', target: '股四头肌、臀大肌、腘绳肌',
    keyPoints: ['向前迈一大步，前膝约 90°，后膝接近地面。', '躯干挺直，重心在两腿之间。', '呼气前脚发力站起，换腿重复。'],
    mistakes: ['前膝超过脚尖过多。', '身体前倾，后腿没有发力。'],
    safety: ['膝盖不适者减小步幅。', '保持躯干直立，避免弯腰。'],
    sets: '3 组 × 每侧 12 次，组间休息 60 秒', source: SRC_COMMON
  },
  {
    id: 'dumbbell-squat', name: '哑铃深蹲', part: '腿', emoji: '🏋️',
    equipment: '简易器械', difficulty: '中级', target: '股四头肌、臀腿',
    keyPoints: ['双手持哑铃于肩侧或体侧。', '屈髋屈膝下蹲至大腿接近水平。', '呼气站起，全程背部挺直。'],
    mistakes: ['弓背下蹲。', '膝盖内扣或脚跟离地。'],
    safety: ['重量从轻开始。', '膝盖有伤者慎做。'],
    sets: '3 组 × 10~12 次，组间休息 90 秒', source: SRC_COMMON
  },
  {
    id: 'glute-bridge', name: '臀桥', part: '腿', emoji: '🌉',
    equipment: '徒手', difficulty: '初级', target: '臀大肌、腘绳肌',
    keyPoints: ['仰卧屈膝，双脚踩地，双臂放体侧。', '呼气臀部发力抬起，身体从肩到膝成直线。', '顶峰夹臀停 1 秒，缓慢下落。'],
    mistakes: ['用腰部顶起，腰反弓。', '脚距过远，臀部发力不足。'],
    safety: ['腰部保持中立，不要过度反弓。', '膝盖不适者调整脚距。'],
    sets: '3 组 × 15 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'dumbbell-press', name: '哑铃推举', part: '肩', emoji: '🙌',
    equipment: '简易器械', difficulty: '中级', target: '三角肌、肱三头肌',
    keyPoints: ['坐姿或站姿，双手持哑铃于肩侧。', '呼气向上推举至手臂接近伸直。', '缓慢下放至肩侧，全程控制。'],
    mistakes: ['借腰部后仰发力。', '手肘过度前移。'],
    safety: ['重量从轻开始。', '肩部有伤者避免过度推举。'],
    sets: '3 组 × 8~12 次，组间休息 90 秒', source: SRC_COMMON
  },
  {
    id: 'lateral-raise', name: '侧平举', part: '肩', emoji: '👐',
    equipment: '简易器械', difficulty: '初级', target: '三角肌中束',
    keyPoints: ['双手持小重量哑铃自然下垂。', '呼气向两侧平举至肩高，肘微屈。', '顶峰稍停，缓慢下放。'],
    mistakes: ['耸肩借斜方肌发力。', '重量过大导致甩动。'],
    safety: ['重量宜轻，动作慢。', '肩痛者减小幅度。'],
    sets: '3 组 × 12~15 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'rear-fly', name: '俯身飞鸟', part: '肩', emoji: '🦅',
    equipment: '简易器械', difficulty: '初级', target: '三角肌后束',
    keyPoints: ['俯身屈髋，背部挺直，双手持轻哑铃。', '呼气向两侧打开至与肩同高。', '顶峰挤压后束，缓慢下放。'],
    mistakes: ['耸肩或借力甩动。', '弓背。'],
    safety: ['重量宜轻。', '腰部保持挺直。'],
    sets: '3 组 × 12~15 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'wall-squat-press', name: '靠墙静蹲举臂', part: '肩', emoji: '🧗',
    equipment: '徒手', difficulty: '初级', target: '三角肌、腿部耐力',
    keyPoints: ['背部贴墙，屈膝成静蹲姿。', '双臂沿墙向上滑动举过头顶。', '保持核心收紧，缓慢下滑。'],
    mistakes: ['腰部离墙。', '膝盖超过脚尖过多。'],
    safety: ['膝盖不适者减小屈膝角度。', '动作缓慢可控。'],
    sets: '3 组 × 30 秒，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'dumbbell-curl', name: '哑铃弯举', part: '手臂', emoji: '💪',
    equipment: '简易器械', difficulty: '初级', target: '肱二头肌',
    keyPoints: ['双手持哑铃自然下垂，大臂贴身体。', '呼气屈肘将哑铃举向肩部。', '顶峰挤压二头，缓慢下放。'],
    mistakes: ['大臂前后摆动借力。', '身体后仰甩铃。'],
    safety: ['重量宜轻，动作慢。', '手腕保持中立。'],
    sets: '3 组 × 12 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'chair-dip', name: '椅上臂屈伸', part: '手臂', emoji: '🪑',
    equipment: '徒手', difficulty: '初级', target: '肱三头肌',
    keyPoints: ['背对椅子双手撑椅面，身体略前移。', '屈肘缓慢下放至大臂约 90°。', '呼气手臂发力撑起。'],
    mistakes: ['肩膀耸起。', '下放过深导致肩部不适。'],
    safety: ['确认椅子稳固不滑动。', '肩部有伤者减小幅度。'],
    sets: '3 组 × 10~12 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'hammer-curl', name: '锤式弯举', part: '手臂', emoji: '🔨',
    equipment: '简易器械', difficulty: '初级', target: '肱肌、肱桡肌',
    keyPoints: ['双手持哑铃，掌心相对。', '屈肘举哑铃，大臂保持不动。', '缓慢下放。'],
    mistakes: ['大臂摆动。', '速度过快。'],
    safety: ['重量宜轻。', '手腕保持中立。'],
    sets: '3 组 × 12 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'narrow-push-up', name: '窄距俯卧撑', part: '手臂', emoji: '🤏',
    equipment: '徒手', difficulty: '中级', target: '肱三头肌、胸大肌内侧',
    keyPoints: ['双手间距略窄于肩，身体成直线。', '屈肘向后下放，大臂贴近身体。', '呼气推起伸直手臂。'],
    mistakes: ['手肘过度外展。', '塌腰。'],
    safety: ['手腕不适者用支架。', '肘部有伤者慎做。'],
    sets: '3 组 × 8~12 次，组间休息 60 秒', source: SRC_COMMON
  },
  {
    id: 'plank', name: '平板支撑', part: '核心', emoji: '🧱',
    equipment: '徒手', difficulty: '初级', target: '腹横肌、核心稳定',
    keyPoints: ['肘撑地面，小臂贴地，手肘在肩正下方。', '身体从头到脚成一条直线，核心收紧。', '均匀呼吸，保持不塌腰不翘臀。'],
    mistakes: ['塌腰或臀部抬得过高。', '耸肩、憋气。'],
    safety: ['腰部有伤者缩短时间。', '出现腰痛立即停止。'],
    sets: '3 组 × 30~60 秒，组间休息 45 秒', source: SRC_CORE
  },
  {
    id: 'crunch', name: '基础卷腹', part: '核心', emoji: '🔄',
    equipment: '徒手', difficulty: '初级', target: '腹直肌上段',
    keyPoints: ['平躺，后脑勺轻贴垫子，脖子放松。', '双腿屈膝脚掌踩实，双手轻搭大腿前侧。', '呼气上腹发力，上背卷起，双手伸向膝盖；顶峰停 0.5 秒。', '吸气缓慢放下，保持腹部张力。'],
    mistakes: ['当成仰卧起坐，背部全部抬起。', '借惯性完成。'],
    safety: ['脖子放松，靠腹部发力。', '动作缓慢，幅度适中。'],
    sets: '3 组 × 12 次，组间休息 45 秒', source: SRC_CORE
  },
  {
    id: 'reverse-crunch', name: '仰卧反向卷腹', part: '核心', emoji: '⬆️',
    equipment: '徒手', difficulty: '初级', target: '腹直肌下部',
    keyPoints: ['平躺，双手置身体两侧，双腿并拢屈膝 60~90°。', '呼气下腹发力，骨盆向上卷起、臀部离地，双膝向胸收拢。', '顶峰停 0.5 秒，吸气缓慢放下。'],
    mistakes: ['甩腿借力。', '单独顶腰，腰椎没有随骨盆卷起。'],
    safety: ['头部贴地，颈部放松。', '下放要慢。'],
    sets: '3 组 × 12 次，组间休息 45 秒', source: SRC_CORE
  },
  {
    id: 'dead-bug', name: '死虫式', part: '核心', emoji: '🪲',
    equipment: '徒手', difficulty: '初级', target: '腹横肌、骨盆稳定',
    keyPoints: ['仰卧，四肢朝天，腰背贴垫。', '对侧手脚缓慢放下接近地面，全程腰部贴垫。', '换侧重复，动作缓慢。'],
    mistakes: ['腰部离垫拱起。', '速度过快。'],
    safety: ['腰部始终贴垫。', '避免过度伸展。'],
    sets: '3 组 × 每侧 10 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'russian-twist', name: '俄罗斯转体', part: '核心', emoji: '🌀',
    equipment: '徒手', difficulty: '中级', target: '腹斜肌',
    keyPoints: ['坐姿屈膝，上身后倾，核心收紧。', '双手交握，呼气向一侧转体。', '左右交替，动作受控。'],
    mistakes: ['甩动借力。', '弓背。'],
    safety: ['腰部有伤者减小幅度。', '保持背部挺直。'],
    sets: '3 组 × 每侧 12 次，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'jumping-jack', name: '开合跳', part: '全身', emoji: '⭐',
    equipment: '徒手', difficulty: '初级', target: '心肺、全身协调',
    keyPoints: ['双脚并拢站立，双手垂于体侧。', '跳起时双脚分开、双手举过头顶。', '落地轻缓，膝盖微屈缓冲。'],
    mistakes: ['落地过重。', '膝盖内扣。'],
    safety: ['膝盖不适者改为原地踏步开合。', '选择软硬适中的地面。'],
    sets: '3 组 × 30~60 秒，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'burpee', name: '波比跳', part: '全身', emoji: '🔥',
    equipment: '徒手', difficulty: '中级', target: '心肺、全身肌群',
    keyPoints: ['站立下蹲撑地，双腿后跳成俯撑。', '做一个俯卧撑后收腿站起。', '起身跳起，双手举过头顶。'],
    mistakes: ['塌腰俯撑。', '动作过快导致失控。'],
    safety: ['心血管不适者慎做或减量。', '可分步完成降低强度。'],
    sets: '3 组 × 8~12 次，组间休息 90 秒', source: SRC_COMMON
  },
  {
    id: 'mountain-climber', name: '登山跑', part: '全身', emoji: '⛰️',
    equipment: '徒手', difficulty: '初级', target: '核心、心肺、腿部',
    keyPoints: ['俯撑起始，手在肩正下方，身体成直线。', '交替快速提膝向胸口，核心收紧。', '保持节奏，呼吸均匀。'],
    mistakes: ['臀部抬高。', '塌腰。'],
    safety: ['手腕不适者用支架。', '腰部保持挺直。'],
    sets: '3 组 × 30~45 秒，组间休息 45 秒', source: SRC_COMMON
  },
  {
    id: 'squat-press', name: '深蹲推举', part: '全身', emoji: '🏋️',
    equipment: '简易器械', difficulty: '中级', target: '腿、肩、核心',
    keyPoints: ['双手持哑铃于肩侧，下蹲至大腿接近水平。', '站起同时向上推举哑铃。', '缓慢下放哑铃回肩侧。'],
    mistakes: ['下蹲时弓背。', '推举时借腰后仰。'],
    safety: ['重量从轻开始。', '动作不协调时拆成深蹲+推举分别练。'],
    sets: '3 组 × 10~12 次，组间休息 90 秒', source: SRC_COMMON
  },
  {
    id: 'plank-rotation', name: '平板支撑髋部旋转', part: '核心', emoji: '🔄',
    equipment: '徒手', difficulty: '中级', target: '腹斜肌、腰侧肌群',
    keyPoints: ['标准平板支撑起始，肘撑地、身体成直线。', '呼气核心紧绷，髋部缓慢向一侧旋转。', '顶峰停 0.5 秒感受腰侧发力，吸气缓慢转回。'],
    mistakes: ['大幅拧腰。', '塌腰或翘臀。'],
    safety: ['幅度适中，靠腹部控制。', '肩膀放松不耸肩。'],
    sets: '3 组 × 12 次，组间休息 45 秒', source: SRC_CORE
  }
]

export const FITNESS_MOVES: FitnessMove[] = SEEDS

/** 动作教学图路径：真实示范照 + 目标肌群中文标注，存 public/fitness/<id>.jpg */
export const fitnessImage = (id: string) => `/fitness/${id}.jpg`

/** 动作分解图路径：1=起始位、2=动作中段，图上已带阶段角标 */
export const fitnessStepImage = (id: string, n: 1 | 2) => `/fitness/${id}-step${n}.jpg`

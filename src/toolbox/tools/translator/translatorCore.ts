/**
 * 中英互译 · 离线小词库 + 词汇本纯逻辑
 *
 * 词库规模说明：内置为高频词小词库（非完整词典），未收录词会如实提示，
 * 不伪造释义、不请求任何在线翻译接口。
 */

export interface Entry {
  word: string
  trans: string[]
}

export interface LookupResult extends Entry {
  dir: 'zh2en' | 'en2zh'
}

/** 词库源数据：`英文|中文1,中文2`（一行一词），加载时解析 */
const RAW = `
abandon|放弃,抛弃
ability|能力,才能
accept|接受,接纳
accident|事故,意外
account|账户,描述
achieve|实现,达到
action|行动,行为
active|活跃的,积极的
actually|实际上
address|地址,演讲
advantage|优势,好处
advice|建议
afraid|害怕的
after|在…之后
afternoon|下午
again|再次,又
against|反对,违背
agent|代理人,中介
agree|同意
ahead|向前,提前
air|空气,空中
airport|机场
alarm|警报,闹钟
album|专辑,相册
alike|相似的
alive|活着的
allow|允许
almost|几乎
alone|独自的
along|沿着
already|已经
also|也
although|虽然
always|总是
amazing|令人惊讶的
ambition|雄心,抱负
amount|数量,总额
ancient|古代的
anger|愤怒
angle|角度,角
animal|动物
anniversary|周年纪念日
announce|宣布
annoy|使恼怒
annual|每年的
answer|回答,答案
anxious|焦虑的
any|任何的
apartment|公寓
apologize|道歉
appear|出现,显得
apple|苹果
apply|申请,应用
appoint|任命,约定
approach|方法,接近
approve|批准,赞成
architect|建筑师
argue|争论
arm|手臂,武器
army|军队
around|周围,大约
arrange|安排,整理
arrest|逮捕
arrive|到达
art|艺术,美术
article|文章,物品
artist|艺术家
aspect|方面
assess|评估
assign|分配,指派
assist|协助
assume|假设,承担
atmosphere|气氛,大气
attach|附上,依附
attempt|尝试,企图
attend|出席,上(学)
attention|注意
attitude|态度
attract|吸引
audience|观众,听众
author|作者
auto|汽车,自动
autumn|秋天
available|可用的,有空的
average|平均的,普通
avoid|避免
awake|醒着的
award|奖项,授予
aware|意识到的
baby|婴儿
back|后面,背部
background|背景
bacteria|细菌
bad|坏的
bag|包,袋
balance|平衡,余额
ball|球,舞会
ban|禁止
band|乐队,带子
bank|银行,河岸
bar|酒吧,条
bargain|讨价还价,便宜货
barrier|障碍,屏障
base|基础,基地
basic|基本的
bath|洗澡
battle|战斗,战役
beach|海滩
bear|熊,承受
beat|打败,跳动
beauty|美丽,美人
because|因为
become|变成
bed|床
before|在…之前
begin|开始
behave|表现,举止
behind|在…后面
believe|相信
bell|铃,钟
belong|属于
below|在…下面
belt|腰带,地带
bench|长凳
bend|弯曲
benefit|好处,利益
beside|在…旁边
best|最好的
better|更好的
between|在…之间
beyond|超出,在…之外
bicycle|自行车
big|大的
bill|账单,法案
bird|鸟
birth|出生
biscuit|饼干
bit|一点,少量
bite|咬
bitter|苦的,痛苦的
black|黑色的
blade|刀刃
blame|责备
blank|空白的
bleed|流血
blind|失明的,盲目的
block|街区,阻塞
blood|血
blow|吹,打击
blue|蓝色的,忧郁的
board|板,董事会
boat|船
body|身体,主体
boil|煮沸
bold|大胆的,粗体
bomb|炸弹
bone|骨头
book|书,预订
border|边界
borrow|借入
boss|老板
both|两者都
bother|打扰,麻烦
bottle|瓶子
bottom|底部
bounce|弹跳
boundary|边界,界限
bowl|碗
box|盒子
brain|大脑,头脑
brake|刹车
branch|树枝,分支
brand|品牌
brave|勇敢的
bread|面包
break|打破,休息
breakfast|早餐
breath|呼吸,气息
bridge|桥
brief|简短的,摘要
bright|明亮的,聪明的
bring|带来
broad|宽的,广泛的
broadcast|广播
brother|兄弟
brown|棕色的
brush|刷子,刷
bubble|气泡
budget|预算
build|建造,建立
bull|公牛
bunch|一串,一群
burden|负担
burn|燃烧,烧伤
burst|爆发,破裂
bus|公共汽车
business|生意,事务
busy|忙碌的
but|但是
butter|黄油
button|按钮,纽扣
buy|买
by|通过,被
cabbage|卷心菜
cabin|小木屋,机舱
cable|电缆,有线电视
cafe|咖啡馆
cage|笼子
cake|蛋糕
calendar|日历,日程表
call|打电话,称呼
calm|平静的
camera|相机
camp|营地,露营
campaign|运动,活动
campus|校园
can|能够,罐头
cancel|取消
cancer|癌症
candidate|候选人
candle|蜡烛
cap|帽子,盖
capacity|容量,能力
captain|船长,队长
capture|捕获,占领
card|卡片,银行卡
care|关心,照料
career|职业,生涯
careful|小心的
carry|携带,搬运
case|情况,案例
cash|现金
cast|投掷,演员表
catch|抓住,赶上
category|类别,范畴
cause|原因,引起
ceiling|天花板
celebrate|庆祝
cell|细胞,牢房
center|中心,中央
central|中心的,中央的
century|世纪
ceremony|典礼,仪式
certain|确定的,某些
chain|链条,连锁
chair|椅子,主席
challenge|挑战
champion|冠军
chance|机会,可能性
change|改变,变化
channel|频道,渠道
chapter|章节
character|性格,角色
charge|收费,指控
charm|魅力
chart|图表
chase|追逐
cheap|便宜的
check|检查,核对
cheer|欢呼,加油
chemical|化学的,化学品
chest|胸部,箱子
chicken|鸡,鸡肉
chief|主要的,首领
child|孩子
chimney|烟囱
choice|选择
choose|选择
church|教堂
circle|圆圈,圈子
circumstance|情况,环境
citizen|市民,公民
city|城市
civil|公民的,国内的
claim|声称,索赔
class|班级,阶级,类别
classic|经典的
clean|干净的,清洁
clear|清楚的,晴朗的
clerk|职员
clever|聪明的
client|客户,委托人
climb|爬,攀登
clock|钟
close|关闭,接近的
cloth|布,布料
cloud|云
club|俱乐部,社团
clue|线索
coach|教练,长途车
coal|煤
coast|海岸
coat|外套,涂层
code|代码,密码
coffee|咖啡
coin|硬币
cold|冷的,感冒
collapse|倒塌,崩溃
colleague|同事
collect|收集,聚集
college|学院,大学
colony|殖民地,群落
color|颜色,着色
column|列,专栏
comb|梳子,梳理
combine|结合,联合
come|来
comfort|安慰,舒适
command|命令,指挥
comment|评论
commerce|商业
commit|承诺,犯(错)
common|常见的,共同的
communicate|交流,沟通
community|社区,群体
company|公司,陪伴
compare|比较,比喻
compete|竞争,比赛
complain|抱怨
complete|完成,完整的
complex|复杂的,综合体
confirm|确认,证实
conflict|冲突,矛盾
confuse|使困惑
connect|连接,联系
consider|考虑,认为
constant|持续的,常数
contact|联系,接触
`
export const ENTRIES: Entry[] = RAW.trim()
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    const [word, trans] = line.split('|')
    return { word, trans: (trans ?? '').split(',').filter(Boolean) }
  })

/** 中文 → 词条倒排（zh2en 用） */
const ZH_INDEX = new Map<string, Entry[]>()
for (const e of ENTRIES) {
  for (const t of e.trans) {
    const list = ZH_INDEX.get(t) ?? []
    list.push(e)
    ZH_INDEX.set(t, list)
  }
}

export const DICT_SIZE = ENTRIES.length

export function lookup(word: string, dir: 'zh2en' | 'en2zh'): LookupResult | null {
  const q = (word ?? '').trim()
  if (!q) return null
  if (dir === 'en2zh') {
    const e = ENTRIES.find((x) => x.word.toLowerCase() === q.toLowerCase())
    return e ? { ...e, dir } : null
  }
  const list = ZH_INDEX.get(q)
  if (list?.length) return { word: list[0].word, trans: list.flatMap((x) => x.trans), dir }
  // 中文模糊：找包含关键字的释义
  const hit = ENTRIES.find((e) => e.trans.some((t) => t.includes(q)))
  return hit ? { word: hit.word, trans: hit.trans, dir } : null
}

export function suggest(prefix: string, limit = 10): string[] {
  const p = (prefix ?? '').trim().toLowerCase()
  if (!p) return []
  return ENTRIES.filter((e) => e.word.toLowerCase().startsWith(p))
    .slice(0, Math.max(1, Math.min(50, limit)))
    .map((e) => e.word)
}

/* ---------------- 词汇本 ---------------- */

export interface VocabItem {
  id: string
  word: string
  trans: string[]
  /** 熟悉度 0~3：0 未掌握 → 3 已掌握 */
  level: number
  ts: number
}

export interface VocabData {
  items: VocabItem[]
}

export const MAX_LEVEL = 3

export function emptyVocab(): VocabData {
  return { items: [] }
}

export function normalizeVocab(raw: unknown): VocabData {
  const obj = raw as { items?: unknown } | null
  const list = Array.isArray(obj?.items) ? obj.items : []
  const items: VocabItem[] = []
  for (const r of list) {
    const it = r as Partial<VocabItem>
    if (!it || typeof it.id !== 'string' || typeof it.word !== 'string') continue
    items.push({
      id: it.id,
      word: it.word,
      trans: Array.isArray(it.trans) ? it.trans.filter((t): t is string => typeof t === 'string') : [],
      level: Math.max(0, Math.min(MAX_LEVEL, Number(it.level) || 0)),
      ts: typeof it.ts === 'number' ? it.ts : Date.now()
    })
  }
  return { items }
}

export function addVocab(data: VocabData, e: Entry): { data: VocabData; ok: boolean } {
  if (data.items.some((i) => i.word.toLowerCase() === e.word.toLowerCase())) return { data, ok: false }
  return {
    data: {
      items: data.items.concat([
        { id: `v${Date.now()}${Math.random().toString(36).slice(2, 5)}`, word: e.word, trans: e.trans, level: 0, ts: Date.now() }
      ])
    },
    ok: true
  }
}

export function removeVocab(data: VocabData, id: string): VocabData {
  return { items: data.items.filter((i) => i.id !== id) }
}

export function setLevel(data: VocabData, id: string, level: number): VocabData {
  const lv = Math.max(0, Math.min(MAX_LEVEL, Math.trunc(level)))
  return { items: data.items.map((i) => (i.id === id ? { ...i, level: lv } : i)) }
}

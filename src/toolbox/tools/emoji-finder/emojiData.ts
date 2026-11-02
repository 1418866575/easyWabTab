/**
 * Emoji 快速查询内置数据（约 300 个常用 Emoji，10 组）
 *
 * 体量刻意控制在 ~40KB：只收录高频常用款，肤色 / 性别变体与全量 Unicode 不做。
 */

export interface EmojiItem {
  char: string
  name: string
  keywords: string
}

export interface EmojiGroup {
  id: string
  name: string
  icon: string
  items: EmojiItem[]
}

/** 每条：`名称|字符|英文关键词(空格分)` */
const RAW: { id: string; name: string; icon: string; data: string }[] = [
  {
    id: 'smileys', name: '笑脸', icon: '😀',
    data: `微笑|😀|grinning smile 开心
开心|😄|joy smile 笑
大笑|😁|beam grin
眯眼笑|😆|laugh squint
喜极而泣|😂|joy tears 笑哭
笑出泪|🤣|rofl 笑死
微笑|🙂|slight smile
倒脸|🙃|upside down
眨眼|😉|wink
 Relieved|😌|relieved
爱心眼|😍|heart eyes 喜欢
星星眼|🤩|star struck
亲亲|😘|kiss
吐舌|😛|tongue
调皮|😜|winking tongue
滑稽|🤪|zany
酷|😎|cool sunglasses
拥抱|🤗|hug
得意|😏|smirk
冷漠|😒|unamused
无语|🙄|rolling eyes
闷闷不乐|😔|pensive
难过|😢|cry
大哭|😭|sob 哭
生气|😠|angry
暴怒|😡|rage
思考|🤔|thinking 思考
沉默|🤫|shush
生病|🤒|sick
发烧|🤕|bandage head
晕|😵|dizzy
 Meh|😐|neutral
震惊|😱|scream
害怕|😨|fearful
紧张|😰|anxious
流泪|🥲|smiling tear
感动|🥹|holding back tears
戴眼镜|🤓|nerd
恶魔|😈|devil
小丑|🤡|clown
幽灵|👻|ghost
外星人|👽|alien
机器人|🤖|robot`
  },
  {
    id: 'gestures', name: '手势', icon: '👍',
    data: `点赞|👍|thumbs up 好
差评|👎|thumbs down
ok|👌|ok
胜利|✌️|victory 耶
手指交叉|🤞|crossed fingers 祈祷
拍手|👏|clap 掌声
举手|🙌|raising hands
合十|🙏|pray 拜托
握手|🤝|handshake 合作
拳头|✊|fist
加油|👊|punch
比心|🤟|love you
ok 手|🤌|pinched
指点|👆|point up
指下|👇|point down
指左|👈|point left
指右|👉|point right
挥手|👋|wave 你好
招手|🤙|call me
张手|🤲|palms up
捂脸|🤦|facepalm
耸肩|🤷|shrug
掐指|🤏|pinch
肌肉|💪|muscle 强
耳朵|👂|ear
鼻子|👃|nose
大脑|🧠|brain
牙齿|🦷|tooth
骨骼|🦴|bone
眼睛|👀|eyes 看
舌头|👅|tongue
嘴巴|👄|lips`
  },
  {
    id: 'hearts', name: '爱心', icon: '❤️',
    data: `红心|❤️|red heart 爱
橙心|🧡|orange heart
黄心|💛|yellow heart
绿心|💚|green heart
蓝心|💙|blue heart
紫心|💜|purple heart
黑心|🖤|black heart
白心|🤍|white heart
棕心|🤎|brown heart
跳动的心|💗|beating heart
破碎的心|💔|broken heart 失恋
两颗心|💕|two hearts
闪闪爱心|💖|sparkling heart
成长的心|💞|revolving hearts
心花怒放|💓|pulsing heart
紫色花|💐|bouquet 花束
玫瑰|🌹|rose 玫瑰
向日葵|🌻|sunflower
郁金香|🌷|tulip
樱花|🌸|cherry blossom
花|🌺|hibiscus
菊花|🌼|blossom
新芽|🌱|seedling
树|🌲|evergreen
叶子|🍃|leaf
四叶草|🍀|clover 幸运
枫叶|🍁|maple`
  },
  {
    id: 'animals', name: '动物', icon: '🐱',
    data: `狗|🐶|dog
猫|🐱|cat
老鼠|🐭|mouse
仓鼠|🐹|hamster
兔子|🐰|rabbit
狐狸|🦊|fox
熊|🐻|bear
熊猫|🐼|panda
考拉|🐨|koala
老虎|🐯|tiger
狮子|🦁|lion
牛|🐮|cow
猪|🐷|pig
青蛙|🐸|frog
猴子|🐵|monkey
鸡|🐔|chicken
企鹅|🐧|penguin
鸟|🐦|bird
小鸭|🐤|chick
老鹰|🦅|eagle
猫头鹰|🦉|owl
马|🐴|horse
独角兽|🦄|unicorn
蜜蜂|🐝|bee
蝴蝶|🦋|butterfly
蜗牛|🐌|snail
甲虫|🐞|beetle
蚂蚁|🐜|ant
蜘蛛|🕷️|spider
龟|🐢|turtle
蛇|🐍|snake
恐龙|🦖|dinosaur
章鱼|🐙|octopus
鱼|🐟|fish
鲸鱼|🐳|whale
海豚|🐬|dolphin`
  },
  {
    id: 'food', name: '食物', icon: '🍔',
    data: `苹果|🍎|apple
橘子|🍊|orange
柠檬|🍋|lemon
香蕉|🍌|banana
西瓜|🍉|watermelon
葡萄|🍇|grapes
草莓|🍓|strawberry
桃子|🍑|peach
樱桃|🍒|cherry
菠萝|🍍|pineapple
芒果|🥭|mango
椰子|🥥|coconut
牛油果|🥑|avocado
茄子|🍆|eggplant
玉米|🌽|corn
辣椒|🌶️|chili
胡萝卜|🥕|carrot
面包|🍞|bread
牛角包|🥐|croissant
汉堡|🍔|burger
薯条|🍟|fries
披萨|🍕|pizza
热狗|🌭|hotdog
三明治|🥪|sandwich
饺子|🥟|dumpling
面条|🍜|noodles
米饭|🍚|rice
寿司|🍣|sushi
包子|🥠|fortune cookie
冰淇淋|🍦|ice cream
甜甜圈|🍩|donut
蛋糕|🎂|cake
月饼|🥮|mooncake
巧克力|🍫|chocolate
糖果|🍬|candy
咖啡|☕|coffee
奶茶|🧋|boba
啤酒|🍺|beer
茶|🍵|tea
牛奶|🥛|milk`
  },
  {
    id: 'travel', name: '旅行', icon: '✈️',
    data: `汽车|🚗|car
出租车|🚕|taxi
公交车|🚌|bus
救护车|🚑|ambulance
消防车|🚒|fire engine
警车|🚓|police car
自行车|🚲|bike
摩托车|🏍️|motorcycle
火车|🚄|train
地铁|🚇|metro
飞机|✈️|airplane
火箭|🚀|rocket
轮船|🚢|ship
帆船|⛵|sailboat
红绿灯|🚦|traffic light
加油站|⛽|fuel
地图|🗺️|map
指南针|🧭|compass
山|⛰️|mountain
火山|🌋|volcano
雪山|🏔️|snow mountain
露营|🏕️|camping
海滩|🏖️|beach
岛屿|🏝️|island
沙漠|🏜️|desert
东京塔|🗼|tower
自由女神|🗽|statue
家|🏠|home
办公楼|🏢|office
医院|🏥|hospital
学校|🏫|school
工厂|🏭|factory
帐篷|⛺|tent
摩天轮|🎡|ferris wheel
烟花|🎆|fireworks
灯笼|🏮|lantern`
  },
  {
    id: 'activities', name: '活动', icon: '⚽',
    data: `足球|⚽|soccer
篮球|🏀|basketball
排球|🏐|volleyball
乒乓球|🏓|ping pong
羽毛球|🏸|badminton
网球|🎾|tennis
奖杯|🏆|trophy 冠军
奖牌|🥇|gold medal
 Target|🎯|target
骰子|🎲|dice
拼图|🧩|puzzle
游戏手柄|🎮|game
麦克风|🎤|karaoke
耳机|🎧|headphones
音符|🎵|music note
吉他|🎸|guitar
小提琴|🎻|violin
钢琴|🎹|piano
鼓|🥁|drum
电影|🎬|clapper
话剧|🎭|theater
艺术|🎨|art palette
魔术|🎩|magic hat
杂耍|🤹|juggle
滑雪|⛷️|ski
冲浪|🏄|surf
游泳|🏊|swim
跑步|🏃|run
举重|🏋️|weightlifting
瑜伽|🧘|yoga
自行车赛|🚴|cycling
游泳奖牌|🥈|silver medal
铜牌|🥉|bronze medal`
  },
  {
    id: 'objects', name: '物品', icon: '📱',
    data: `手机|📱|phone
电脑|💻|laptop
台式机|🖥️|desktop
键盘|⌨️|keyboard
打印机|🖨️|printer
鼠标|🖱️|mouse
相机|📷|camera
电视|📺|tv
收音机|📻|radio
电池|🔋|battery
灯泡|💡|bulb
手电筒|🔦|flashlight
书|📚|books
笔记本|📓|notebook
书签|🔖|bookmark
报纸|📰|newspaper
信封|✉️|mail
钱包|👛|purse
钥匙|🔑|key
锁|🔒|lock
锤子|🔨|hammer
扳手|🔧|wrench
螺丝刀|🪛|screwdriver
工具箱|🧰|toolbox
剪刀|✂️|scissors
图钉|📌|pin
回形针|📎|paperclip
尺子|📏|ruler
铅笔|✏️|pencil
钢笔|🖊️|pen
毛笔|🖌️|brush
礼物|🎁|gift
气球|🎈|balloon
彩带|🎊|confetti
购物袋|🛍️|shopping
垃圾桶|🗑️|trash`
  },
  {
    id: 'symbols', name: '符号', icon: '✨',
    data: `星星|⭐|star
闪光|✨|sparkles
发光|🌟|glowing star
彩虹|🌈|rainbow
太阳|☀️|sun
月亮|🌙|moon
云|☁️|cloud
闪电|⚡|lightning
雪花|❄️|snowflake
雨伞|☂️|umbrella
火焰|🔥|fire
水滴|💧|droplet
对勾|✅|check 完成
叉|❌|cross 错误
感叹号|❗|exclamation
问号|❓|question
警告|⚠️|warning
禁止|🚫|prohibited
圆圈叉|⭕|circle
加号|➕|plus
减号|➖|minus
向上箭头|⬆️|up
向下箭头|⬇️|down
向左箭头|⬅️|left
向右箭头|➡️|right
循环|🔄|refresh
无限|♾️|infinity
百分号|💯|100 分
音符符号|🎶|notes
版权|©️|copyright
注册|®️|registered
商标|™️|trademark
钱|💰|money bag
钻石|💎|gem
时钟|🕐|clock
沙漏|⌛|hourglass`
  },
  {
    id: 'flags', name: '旗帜', icon: '🏁',
    data: `方格旗|🏁|checkered flag
三角旗|🚩|triangular flag
 crossed|🎌|crossed flags 日本
彩虹旗|🏳️‍🌈|pride flag
白旗|🏳️|white flag
黑旗|🏴|black flag
中国|🇨🇳|china 中国
美国|🇺🇸|usa
英国|🇬🇧|uk
日本|🇯🇵|japan
韩国|🇰🇷|korea
法国|🇫🇷|france
德国|🇩🇪|germany
意大利|🇮🇹|italy
加拿大|🇨🇦|canada
澳大利亚|🇦🇺|australia
俄罗斯|🇷🇺|russia
巴西|🇧🇷|brazil
印度|🇮🇳|india
新加坡|🇸🇬|singapore
泰国|🇹🇭|thailand
马来西亚|🇲🇾|malaysia
荷兰|🇳🇱|netherlands
西班牙|🇪🇸|spain
瑞士|🇨🇭|switzerland
瑞典|🇸🇪|sweden
挪威|🇳🇴|norway
新西兰|🇳🇿|new zealand
墨西哥|🇲🇽|mexico
阿根廷|🇦🇷|argentina
埃及|🇪🇬|egypt
南非|🇿🇦|south africa`
  },
  {
    id: 'people', name: '人物', icon: '👋',
    data: `婴儿|👶|baby
男孩|👦|boy
女孩|👧|girl
男人|👨|man
女人|👩|woman
老人|👴|old man
奶奶|👵|old woman
医生|🧑‍⚕️|doctor
警察|👮|police
厨师|🧑‍🍳|chef
老师|🧑‍🏫|teacher
学生|🧑‍🎓|student
工程师|🧑‍💻|engineer
程序员|👨‍💻|programmer
科学家|🧑‍🔬|scientist
宇航员|🧑‍🚀|astronaut
农民|🧑‍🌾|farmer
歌手|🧑‍🎤|singer
画家|🧑‍🎨|artist
侦探|🕵️|detective
圣诞老人|🎅|santa
超人|🦸|superhero
忍者|🥷|ninja
精灵|🧚|fairy
吸血鬼|🧛|vampire
美人鱼|🧜|mermaid
天使|👼|angel
宝宝天使|🧑‍🍼|feeding
跑步人|🏃|runner
跳舞|💃|dancing
游泳人|🏊|swimmer
打坐|🧘|meditate`
  }
]

export const EMOJI_GROUPS: EmojiGroup[] = RAW.map((g) => ({
  id: g.id,
  name: g.name,
  icon: g.icon,
  items: g.data
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [name, char, keywords] = line.split('|')
      return { name: name.trim(), char: (char ?? '').trim(), keywords: (keywords ?? '').trim() }
    })
    .filter((i) => i.char)
}))

export const EMOJI_TOTAL = EMOJI_GROUPS.reduce((s, g) => s + g.items.length, 0)

export const RECENT_LIMIT = 20

export function searchEmoji(q: string, limit = 100): EmojiItem[] {
  const k = (q ?? '').trim().toLowerCase()
  if (!k) return []
  const out: EmojiItem[] = []
  for (const g of EMOJI_GROUPS) {
    for (const it of g.items) {
      if (out.length >= Math.max(1, Math.min(200, limit))) return out
      if (it.name.includes(k) || it.keywords.toLowerCase().includes(k)) out.push(it)
    }
  }
  return out
}

export interface RecentEmoji {
  char: string
  ts: number
}

/** 最近使用：去重置顶，最多 20 条 */
export function recordRecentEmoji(list: RecentEmoji[], char: string): RecentEmoji[] {
  const next = [{ char, ts: Date.now() }, ...list.filter((r) => r.char !== char)]
  return next.slice(0, RECENT_LIMIT)
}

export function normalizeRecent(raw: unknown): RecentEmoji[] {
  const list = Array.isArray(raw) ? raw : []
  return list
    .map((r) => r as Partial<RecentEmoji>)
    .filter((r) => r && typeof r.char === 'string' && r.char)
    .map((r) => ({ char: r.char as string, ts: typeof r.ts === 'number' ? r.ts : 0 }))
    .slice(0, RECENT_LIMIT)
}

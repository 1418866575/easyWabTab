/**
 * 常用字拼音表（共享数据，copybook / 拼音类工具使用）
 *
 * 体量说明：刻意只内置约 200 个高频字，未收录字由调用方留空并提示，
 * 不做网络查询、不引入整本拼音词典（几百 KB）。
 */

const RAW =
  '的de是shi了le我wo不bu在zai有you个ge人ren这zhe上shang中zhong来lai到dao时shi大da地di' +
  '为wei子zi你ni说shuo生sheng国guo年nian着zhe就jiu那na和he要yao她ta出chu也ye得de里li' +
  '后hou自zi以yi会hui家jia可ke下xia而er过guo天tian去qu能neng对dui小xiao多duo然ran' +
  '于yu心xin学xue么me都dou好hao看kan起qi发fa当dang没mei成cheng只zhi如ru事shi把ba' +
  '还hai用yong第di样yang道dao想xiang作zuo种zhong开kai美mei总zong从cong无wu情qing' +
  '己ji面mian最zui女nv但dan现xian前qian些xie所suo同tong日ri手shou又you行xing意yi' +
  '动dong方fang期qi它ta头tou经jing长chang儿er回hui位wei分fen爱ai老lao因yin很hen' +
  '给gei名ming法fa间jian知zhi世shi什shi两liang次ci使shi身shen者zhe被bei高gao已yi' +
  '亲qin其qi进jin此ci话hua常chang与yu活huo正zheng感gan觉jue听ting说说请qing谢xie' +
  '校xiao庭ting平ping友you谊yi快kuai乐le健jian康kang智zhi慧hui勇yong敢gan善shan' +
  '良liang诚cheng实shi守shou信xin勤qin奋fen读du书shu写xie字zi画hua歌ge舞wu琴qin' +
  '棋qi球qiu跑pao跳tiao游you泳yong飞fei鸟niao花hua草cao树shu木mu山shan河he湖hu' +
  '海hai春chun夏xia秋qiu冬dong晨chen夜ye星xing云yun雨yu雪xue风feng光guang明ming' +
  '暗an红hong橙cheng黄huang绿lv蓝lan紫zi黑hei白bai灰hui爸ba妈ma哥ge姐jie弟di' +
  '妹mei爷ye奶nai师shi朋peng再zai见jian早zao晚wan安an静jing问wen答da数shu量liang' +
  '加jia减jian乘cheng除chu元yuan角jiao钱qian买mai卖mai东dong西xi南nan北bei城cheng' +
  '市shi村cun路lu桥qiao车che船chuan门men窗chuang桌zhuo椅yi床chuang灯deng电dian'

export const PINYIN: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  const re = /([\u4e00-\u9fa5])([a-z]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(RAW))) out[m[1]] = m[2]
  return out
})()

export function pinyinOf(ch: string): string {
  return PINYIN[ch] ?? ''
}

export function hasPinyin(ch: string): boolean {
  return ch in PINYIN
}

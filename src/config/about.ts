/**
 * 「关于」页配置（设置 → 通知与同步 → 关于）。
 *
 * 集中放置公众号与开源地址信息，便于后续维护：
 * - 换公众号二维码：替换 public/wechat-mp-qrcode.jpg（或改 WECHAT_MP_QRCODE 指向新文件）；
 * - 追加开源仓库：直接往 OPEN_SOURCE_LINKS 数组里 push 一项，页面自动渲染（含「前往」按钮）。
 */

/** 微信公众号名称 */
export const WECHAT_MP_NAME = '司伊娃'

/** 公众号二维码图片地址（public 目录静态资源，构建后原样拷贝） */
export const WECHAT_MP_QRCODE = '/wechat-mp-qrcode.jpg'

/** 二维码下方的一句话引导文案 */
export const WECHAT_MP_HINT = '扫码关注，获取使用技巧与更新动态。'

/** 开源仓库条目 */
export interface OpenSourceLink {
  /** 展示名称 */
  label: string
  /** 一句话说明 */
  description: string
  /** 仓库主页（「前往」按钮跳转目标） */
  homeUrl: string
  /** git clone 地址（页面展示用） */
  cloneUrl: string
}

/** 开源地址列表：新增仓库直接追加，无需改页面 */
export const OPEN_SOURCE_LINKS: OpenSourceLink[] = [
  {
    label: 'easy-web-tab',
    description: '本项目源码：网页导航 + 个人工作台（Vue 3 + Pinia + IndexedDB，纯前端部署）',
    homeUrl: 'https://gitee.com/sifujiang/easy-web-tab',
    cloneUrl: 'https://gitee.com/sifujiang/easy-web-tab.git'
  }
]

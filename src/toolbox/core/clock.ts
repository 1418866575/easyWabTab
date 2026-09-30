/**
 * 世界时钟与时区换算纯函数（零依赖，基于 Intl API，自动处理夏令时）
 */

export interface City {
  id: string
  name: string
  tz: string
  flag: string
}

export const CITIES: City[] = [
  { id: 'shanghai', name: '上海', tz: 'Asia/Shanghai', flag: '🇨🇳' },
  { id: 'beijing', name: '北京', tz: 'Asia/Shanghai', flag: '🇨🇳' },
  { id: 'hongkong', name: '中国香港', tz: 'Asia/Hong_Kong', flag: '🇨🇳' },
  { id: 'taipei', name: '中国台湾', tz: 'Asia/Taipei', flag: '🇨🇳' },
  { id: 'tokyo', name: '东京', tz: 'Asia/Tokyo', flag: '🇯🇵' },
  { id: 'seoul', name: '首尔', tz: 'Asia/Seoul', flag: '🇰🇷' },
  { id: 'singapore', name: '新加坡', tz: 'Asia/Singapore', flag: '🇸🇬' },
  { id: 'bangkok', name: '曼谷', tz: 'Asia/Bangkok', flag: '🇹🇭' },
  { id: 'dubai', name: '迪拜', tz: 'Asia/Dubai', flag: '🇦🇪' },
  { id: 'moscow', name: '莫斯科', tz: 'Europe/Moscow', flag: '🇷🇺' },
  { id: 'berlin', name: '柏林', tz: 'Europe/Berlin', flag: '🇩🇪' },
  { id: 'paris', name: '巴黎', tz: 'Europe/Paris', flag: '🇫🇷' },
  { id: 'london', name: '伦敦', tz: 'Europe/London', flag: '🇬🇧' },
  { id: 'newyork', name: '纽约', tz: 'America/New_York', flag: '🇺🇸' },
  { id: 'chicago', name: '芝加哥', tz: 'America/Chicago', flag: '🇺🇸' },
  { id: 'denver', name: '丹佛', tz: 'America/Denver', flag: '🇺🇸' },
  { id: 'losangeles', name: '洛杉矶', tz: 'America/Los_Angeles', flag: '🇺🇸' },
  { id: 'sydney', name: '悉尼', tz: 'Australia/Sydney', flag: '🇦🇺' },
  { id: 'auckland', name: '奥克兰', tz: 'Pacific/Auckland', flag: '🇳🇿' },
  { id: 'santiago', name: '圣保罗', tz: 'America/Sao_Paulo', flag: '🇧🇷' },
  { id: 'utc', name: 'UTC', tz: 'UTC', flag: '🌐' }
]

/** 某时区相对本地时间的偏移（分钟，东为正） */
export function tzOffsetMinutes(tz: string, at: Date = new Date()): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
    const parts = dtf.formatToParts(at)
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value || '0')
    const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
    return Math.round((asUTC - Math.floor(at.getTime() / 1000) * 1000 + 500) / 60000)
  } catch {
    return 0
  }
}

/** 格式化某时区的日期时间 */
export function formatInZone(tz: string, at: Date, opts: { hour12?: boolean; seconds?: boolean } = {}): {
  time: string
  date: string
  weekday: string
} {
  try {
    const time = new Intl.DateTimeFormat('zh-CN', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      second: opts.seconds ? '2-digit' : undefined,
      hour12: opts.hour12 ?? false
    }).format(at)
    const date = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
    const weekday = new Intl.DateTimeFormat('zh-CN', { timeZone: tz, weekday: 'short' }).format(at)
    return { time, date, weekday }
  } catch {
    return { time: '--:--', date: '----', weekday: '-' }
  }
}

/** 时区是否支持 */
export function tzSupported(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date())
    return true
  } catch {
    return false
  }
}

/** 偏移的人类可读表示，如 UTC+8 */
export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+'
  const abs = Math.abs(minutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`
}

/** 与本地时区的时差文案 */
export function diffText(tz: string, at: Date): string {
  const off = tzOffsetMinutes(tz, at)
  const localOff = -at.getTimezoneOffset()
  const d = (off - localOff) / 60
  if (!d) return '与本地相同'
  return d > 0 ? `比本地快 ${d} 小时` : `比本地慢 ${Math.abs(d)} 小时`
}

/** 将某时区的本地时间换算到另一时区展示 */
export function convertZone(
  fromTz: string,
  toTz: string,
  localDateTime: string
): { ok: boolean; text: string; error?: string } {
  try {
    const naive = new Date(localDateTime.replace(' ', 'T'))
    if (Number.isNaN(naive.getTime())) return { ok: false, text: '', error: '时间格式不正确，应为 YYYY-MM-DD HH:mm' }
    const fromOff = tzOffsetMinutes(fromTz, naive)
    const utcMs = naive.getTime() - fromOff * 60000
    const target = new Date(utcMs)
    const f = formatInZone(toTz, target, { seconds: false })
    return { ok: true, text: `${f.date} ${f.time}（${f.weekday}）` }
  } catch (e) {
    return { ok: false, text: '', error: (e as Error).message }
  }
}

export interface Countdown {
  days: number
  hours: number
  minutes: number
  seconds: number
  total: number
  past: boolean
}

/** 倒计时 */
export function countdown(target: Date, now: Date = new Date()): Countdown {
  const total = target.getTime() - now.getTime()
  const abs = Math.abs(total)
  return {
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
    seconds: Math.floor((abs % 60000) / 1000),
    total,
    past: total < 0
  }
}

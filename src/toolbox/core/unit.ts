/**
 * 单位换算纯函数（零依赖）
 * 8 大类：长度 / 重量 / 温度 / 面积 / 体积 / 速度 / 数据存储 / 时间
 * 除温度（仿射变换）与数据存储（可切 SI/IEC）外，统一按「基准单位 × 系数」换算。
 */

export interface UnitDef {
  id: string
  name: string
  /** 相对于该类别基准单位的系数 */
  factor: number
}

export interface UnitCategory {
  id: string
  name: string
  units: UnitDef[]
  /** 温度等特殊类别走自定义换算 */
  special?: 'temperature'
}

export const UNIT_CATEGORIES: UnitCategory[] = [
  {
    id: 'length',
    name: '长度',
    units: [
      { id: 'nm', name: '纳米 (nm)', factor: 1e-9 },
      { id: 'um', name: '微米 (μm)', factor: 1e-6 },
      { id: 'mm', name: '毫米 (mm)', factor: 0.001 },
      { id: 'cm', name: '厘米 (cm)', factor: 0.01 },
      { id: 'dm', name: '分米 (dm)', factor: 0.1 },
      { id: 'm', name: '米 (m)', factor: 1 },
      { id: 'km', name: '千米 (km)', factor: 1000 },
      { id: 'in', name: '英寸 (in)', factor: 0.0254 },
      { id: 'ft', name: '英尺 (ft)', factor: 0.3048 },
      { id: 'yd', name: '码 (yd)', factor: 0.9144 },
      { id: 'mi', name: '英里 (mi)', factor: 1609.344 },
      { id: 'nmi', name: '海里 (nmi)', factor: 1852 },
      { id: 'chi', name: '市尺', factor: 1 / 3 },
      { id: 'cun', name: '市寸', factor: 1 / 30 }
    ]
  },
  {
    id: 'weight',
    name: '重量',
    units: [
      { id: 'mg', name: '毫克 (mg)', factor: 1e-6 },
      { id: 'g', name: '克 (g)', factor: 0.001 },
      { id: 'kg', name: '千克 (kg)', factor: 1 },
      { id: 't', name: '吨 (t)', factor: 1000 },
      { id: 'lb', name: '磅 (lb)', factor: 0.45359237 },
      { id: 'oz', name: '盎司 (oz)', factor: 0.028349523125 },
      { id: 'st', name: '英石 (st)', factor: 6.35029318 },
      { id: 'jin', name: '市斤', factor: 0.5 },
      { id: 'liang', name: '市两', factor: 0.05 }
    ]
  },
  {
    id: 'temperature',
    name: '温度',
    special: 'temperature',
    units: [
      { id: 'c', name: '摄氏度 (℃)', factor: 1 },
      { id: 'f', name: '华氏度 (℉)', factor: 1 },
      { id: 'k', name: '开尔文 (K)', factor: 1 },
      { id: 'r', name: '兰氏度 (°R)', factor: 1 }
    ]
  },
  {
    id: 'area',
    name: '面积',
    units: [
      { id: 'mm2', name: '平方毫米 (mm²)', factor: 1e-6 },
      { id: 'cm2', name: '平方厘米 (cm²)', factor: 1e-4 },
      { id: 'm2', name: '平方米 (m²)', factor: 1 },
      { id: 'km2', name: '平方千米 (km²)', factor: 1e6 },
      { id: 'ha', name: '公顷 (ha)', factor: 10000 },
      { id: 'acre', name: '英亩 (acre)', factor: 4046.8564224 },
      { id: 'mu', name: '亩', factor: 2000 / 3 },
      { id: 'ft2', name: '平方英尺 (ft²)', factor: 0.09290304 }
    ]
  },
  {
    id: 'volume',
    name: '体积',
    units: [
      { id: 'ml', name: '毫升 (mL)', factor: 0.001 },
      { id: 'l', name: '升 (L)', factor: 1 },
      { id: 'm3', name: '立方米 (m³)', factor: 1000 },
      { id: 'gal_us', name: '美制加仑 (gal)', factor: 3.785411784 },
      { id: 'gal_uk', name: '英制加仑 (gal)', factor: 4.54609 },
      { id: 'pt_us', name: '美制品脱 (pt)', factor: 0.473176473 },
      { id: 'floz_us', name: '美制液量盎司 (fl oz)', factor: 0.0295735295625 },
      { id: 'cup', name: '杯 (250mL)', factor: 0.25 }
    ]
  },
  {
    id: 'speed',
    name: '速度',
    units: [
      { id: 'mps', name: '米/秒 (m/s)', factor: 1 },
      { id: 'kmh', name: '千米/小时 (km/h)', factor: 1 / 3.6 },
      { id: 'mph', name: '英里/小时 (mph)', factor: 0.44704 },
      { id: 'kn', name: '节 (kn)', factor: 1852 / 3600 },
      { id: 'fts', name: '英尺/秒 (ft/s)', factor: 0.3048 },
      { id: 'mach', name: '马赫 (海平面)', factor: 340.3 }
    ]
  },
  {
    id: 'data',
    name: '数据存储',
    units: [
      { id: 'bit', name: '比特 (bit)', factor: 0.125 },
      { id: 'b', name: '字节 (B)', factor: 1 },
      { id: 'kb', name: '千字节 (KB, 1000)', factor: 1000 },
      { id: 'kib', name: '千字节 (KiB, 1024)', factor: 1024 },
      { id: 'mb', name: '兆字节 (MB, 1000²)', factor: 1e6 },
      { id: 'mib', name: '兆字节 (MiB, 1024²)', factor: 1048576 },
      { id: 'gb', name: '吉字节 (GB, 1000³)', factor: 1e9 },
      { id: 'gib', name: '吉字节 (GiB, 1024³)', factor: 1073741824 },
      { id: 'tb', name: '太字节 (TB, 1000⁴)', factor: 1e12 },
      { id: 'tib', name: '太字节 (TiB, 1024⁴)', factor: 1099511627776 }
    ]
  },
  {
    id: 'time',
    name: '时间',
    units: [
      { id: 'ms', name: '毫秒 (ms)', factor: 0.001 },
      { id: 's', name: '秒 (s)', factor: 1 },
      { id: 'min', name: '分钟 (min)', factor: 60 },
      { id: 'h', name: '小时 (h)', factor: 3600 },
      { id: 'd', name: '天 (d)', factor: 86400 },
      { id: 'wk', name: '周 (wk)', factor: 604800 },
      { id: 'mo', name: '月 (30 天)', factor: 2592000 },
      { id: 'yr', name: '年 (365 天)', factor: 31536000 }
    ]
  }
]

function toBase(category: UnitCategory, unitId: string, value: number): number {
  if (category.special === 'temperature') {
    switch (unitId) {
      case 'c':
        return value
      case 'f':
        return ((value - 32) * 5) / 9
      case 'k':
        return value - 273.15
      case 'r':
        return ((value - 491.67) * 5) / 9
      default:
        return value
    }
  }
  const u = category.units.find(x => x.id === unitId)
  return u ? value * u.factor : value
}

function fromBase(category: UnitCategory, unitId: string, base: number): number {
  if (category.special === 'temperature') {
    switch (unitId) {
      case 'c':
        return base
      case 'f':
        return (base * 9) / 5 + 32
      case 'k':
        return base + 273.15
      case 'r':
        return ((base + 273.15) * 9) / 5
      default:
        return base
    }
  }
  const u = category.units.find(x => x.id === unitId)
  return u ? base / u.factor : base
}

export interface ConvertResult {
  ok: boolean
  value: number
  text: string
  /** 该类别全部单位的换算结果 */
  all: { id: string; name: string; text: string }[]
  error?: string
}

/** 单位换算 */
export function convertUnit(
  categoryId: string,
  value: number,
  from: string,
  to: string,
  precision = 6
): ConvertResult {
  const cat = UNIT_CATEGORIES.find(c => c.id === categoryId)
  if (!cat) return { ok: false, value: 0, text: '', all: [], error: '未知单位类别' }
  if (!Number.isFinite(value)) return { ok: false, value: 0, text: '', all: [], error: '请输入有效数值' }
  const base = toBase(cat, from, value)
  const out = fromBase(cat, to, base)
  const all = cat.units.map(u => ({ id: u.id, name: u.name, text: fmt(fromBase(cat, u.id, base), precision) }))
  return { ok: true, value: out, text: fmt(out, precision), all }
}

function fmt(v: number, precision: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v)
  const p = Math.max(0, Math.min(precision, 10))
  return Number(v.toFixed(p)).toString()
}

/** 取类别 */
export function getCategory(id: string): UnitCategory {
  return UNIT_CATEGORIES.find(c => c.id === id) || UNIT_CATEGORIES[0]
}

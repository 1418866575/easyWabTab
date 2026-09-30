/**
 * JPEG EXIF 解析纯函数（零依赖）
 * 解析 APP1/Exif 段的 IFD0 / ExifIFD / GPS IFD，输出可读标签与 GPS 坐标。
 */

export interface ExifTag {
  group: string
  name: string
  value: string
}

export interface ExifResult {
  ok: boolean
  error?: string
  tags: ExifTag[]
  gps?: { lat: number; lng: number }
  hasGps: boolean
}

const TAGS: Record<number, { name: string; group?: string }> = {
  0x010e: { name: '图像描述' },
  0x010f: { name: '相机厂商' },
  0x0110: { name: '相机型号' },
  0x0112: { name: '方向' },
  0x011a: { name: 'X 分辨率' },
  0x011b: { name: 'Y 分辨率' },
  0x0128: { name: '分辨率单位' },
  0x0131: { name: '软件' },
  0x0132: { name: '修改时间' },
  0x013b: { name: '艺术家' },
  0x8298: { name: '版权' },
  0x8769: { name: 'Exif 子 IFD', group: 'exif' },
  0x8825: { name: 'GPS IFD', group: 'gps' },
  0x9000: { name: 'Exif 版本', group: 'exif' },
  0x9003: { name: '拍摄时间', group: 'exif' },
  0x9004: { name: '数字化时间', group: 'exif' },
  0x829a: { name: '曝光时间', group: 'exif' },
  0x829d: { name: 'F 值', group: 'exif' },
  0x8827: { name: 'ISO', group: 'exif' },
  0x920a: { name: '焦距', group: 'exif' },
  0xa002: { name: '像素宽度', group: 'exif' },
  0xa003: { name: '像素高度', group: 'exif' },
  0xa402: { name: '曝光模式', group: 'exif' },
  0xa403: { name: '白平衡', group: 'exif' },
  0xa406: { name: '场景类型', group: 'exif' },
  0xa432: { name: '镜头信息', group: 'exif' },
  0x0000: { name: 'GPS 版本', group: 'gps' },
  0x0001: { name: '纬度参考', group: 'gps' },
  0x0002: { name: '纬度', group: 'gps' },
  0x0003: { name: '经度参考', group: 'gps' },
  0x0004: { name: '经度', group: 'gps' },
  0x0005: { name: '海拔参考', group: 'gps' },
  0x0006: { name: '海拔', group: 'gps' },
  0x001d: { name: 'GPS 日期', group: 'gps' }
}

const TYPE_SIZE: Record<number, number> = {
  1: 1, // BYTE
  2: 1, // ASCII
  3: 2, // SHORT
  4: 4, // LONG
  5: 8, // RATIONAL
  7: 1, // UNDEFINED
  9: 4, // SLONG
  10: 8 // SRATIONAL
}

class Reader {
  /** 用显式字段声明而非构造器参数属性（兼容 node --experimental-strip-types 直测） */
  buf: Uint8Array
  little: boolean
  constructor(buf: Uint8Array, little: boolean) {
    this.buf = buf
    this.little = little
  }
  u16(o: number): number {
    return this.little ? this.buf[o] | (this.buf[o + 1] << 8) : (this.buf[o] << 8) | this.buf[o + 1]
  }
  u32(o: number): number {
    return this.little
      ? (this.buf[o] | (this.buf[o + 1] << 8) | (this.buf[o + 2] << 16) | (this.buf[o + 3] << 24)) >>> 0
      : ((this.buf[o] << 24) | (this.buf[o + 1] << 16) | (this.buf[o + 2] << 8) | this.buf[o + 3]) >>> 0
  }
  i32(o: number): number {
    const v = this.u32(o)
    return v > 0x7fffffff ? v - 0x100000000 : v
  }
}

function readValue(r: Reader, type: number, count: number, valueOffset: number, tiffStart: number): number[] {
  const size = (TYPE_SIZE[type] || 1) * count
  let base = valueOffset
  if (size > 4) base = tiffStart + valueOffset
  const out: number[] = []
  for (let i = 0; i < count; i++) {
    const o = base + i * (TYPE_SIZE[type] || 1)
    if (o + (TYPE_SIZE[type] || 1) > r['buf'].length) break
    switch (type) {
      case 1:
      case 7:
        out.push(r['buf'][o])
        break
      case 2:
        out.push(r['buf'][o])
        break
      case 3:
        out.push(r.u16(o))
        break
      case 4:
        out.push(r.u32(o))
        break
      case 9:
        out.push(r.i32(o))
        break
      case 5:
        out.push(r.u32(o) / (r.u32(o + 4) || 1))
        break
      case 10:
        out.push(r.i32(o) / (r.i32(o + 4) || 1))
        break
      default:
        out.push(0)
    }
  }
  return out
}

function asciiOf(values: number[]): string {
  return values
    .filter(v => v > 0 && v < 128)
    .map(v => String.fromCharCode(v))
    .join('')
    .trim()
}

function fmtValues(type: number, values: number[]): string {
  if (type === 2) return asciiOf(values)
  if (type === 5 || type === 10) return values.map(v => (Math.round(v * 1000) / 1000).toString()).join(', ')
  return values.join(', ')
}

/** 解析 EXIF */
export function parseExif(buffer: ArrayBuffer | Uint8Array): ExifResult {
  const buf = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const tags: ExifTag[] = []
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return { ok: false, error: '不是 JPEG 文件（需以 FFD8 开头）', tags: [], hasGps: false }
  }
  let offset = 2
  let tiffStart = -1
  while (offset + 4 < buf.length) {
    if (buf[offset] !== 0xff) {
      offset++
      continue
    }
    const marker = buf[offset + 1]
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2
      continue
    }
    const size = (buf[offset + 2] << 8) | buf[offset + 3]
    if (marker === 0xe1) {
      const sig = String.fromCharCode(...buf.slice(offset + 4, offset + 8))
      if (sig === 'Exif') {
        tiffStart = offset + 10
        break
      }
    }
    if (marker === 0xda) break
    offset += 2 + size
  }
  if (tiffStart < 0) return { ok: true, tags: [], hasGps: false, error: '该文件不含 EXIF 信息' }

  const bo = String.fromCharCode(buf[tiffStart], buf[tiffStart + 1])
  if (bo !== 'II' && bo !== 'MM') return { ok: false, error: 'EXIF 字节序无法识别', tags: [], hasGps: false }
  const r = new Reader(buf, bo === 'II')
  const ifd0Offset = r.u32(tiffStart + 4)

  const gpsRaw: Record<string, number[]> = {}
  const gpsRef: Record<string, string> = {}

  const readIfd = (ifdOffset: number, group: string) => {
    const base = tiffStart + ifdOffset
    if (base + 2 > buf.length) return
    const count = r.u16(base)
    for (let i = 0; i < count; i++) {
      const entry = base + 2 + i * 12
      if (entry + 12 > buf.length) break
      const tag = r.u16(entry)
      const type = r.u16(entry + 2)
      const num = r.u32(entry + 4)
      const valueOffset = r.u32(entry + 8)
      const meta = TAGS[tag]
      const values = readValue(r, type, num, valueOffset, tiffStart)
      const text = fmtValues(type, values)
      if (group === 'gps') {
        gpsRaw[tag] = values
        if (tag === 0x0001 || tag === 0x0003) gpsRef[tag] = asciiOf(values)
      }
      if (meta) {
        tags.push({ group: group === 'gps' ? 'GPS' : group === 'exif' ? '拍摄参数' : '基本信息', name: meta.name, value: text })
      }
      if (tag === 0x8769 && group === 'root') readIfd(valueOffset, 'exif')
      if (tag === 0x8825 && group === 'root') readIfd(valueOffset, 'gps')
    }
  }
  readIfd(ifd0Offset, 'root')

  let gps: { lat: number; lng: number } | undefined
  const latV = gpsRaw[0x0002]
  const lngV = gpsRaw[0x0004]
  if (latV && latV.length >= 3 && lngV && lngV.length >= 3) {
    const toDeg = (v: number[]) => v[0] + v[1] / 60 + v[2] / 3600
    let lat = toDeg(latV)
    let lng = toDeg(lngV)
    if ((gpsRef[0x0001] || 'N').toUpperCase() === 'S') lat = -lat
    if ((gpsRef[0x0003] || 'E').toUpperCase() === 'W') lng = -lng
    gps = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 }
  }
  return { ok: true, tags, gps, hasGps: !!gps }
}

/** 敏感字段（用于"一键清除"的提示） */
export const SENSITIVE_TAGS = ['相机厂商', '相机型号', '拍摄时间', 'GPS IFD', '纬度', '经度', '纬度参考', '经度参考', '海拔', '艺术家', '软件']

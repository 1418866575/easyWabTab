/**
 * 随机头像生成纯逻辑：像素风 / 字母风 / 卡通几何风，种子可复现，输出 SVG 字符串
 */

export interface AvatarStyle {
  id: 'pixel' | 'letter' | 'cartoon'
  name: string
}

export const STYLES: AvatarStyle[] = [
  { id: 'pixel', name: '像素风' },
  { id: 'letter', name: '字母风' },
  { id: 'cartoon', name: '卡通几何' }
]

export const SIZES = [128, 256, 512, 1024]

export const PALETTES: string[][] = [
  ['#4f46e5', '#a5b4fc', '#eef2ff'],
  ['#0891b2', '#67e8f9', '#ecfeff'],
  ['#16a34a', '#86efac', '#f0fdf4'],
  ['#ea580c', '#fdba74', '#fff7ed'],
  ['#db2777', '#f9a8d4', '#fdf2f8'],
  ['#7c3aed', '#c4b5fd', '#f5f3ff']
]

/** 字符串 → 32 位种子（xmur3 简化版） */
export function hashSeed(seed: string): number {
  let h = 1779033703 ^ (seed ?? '').length
  for (let i = 0; i < (seed ?? '').length; i++) {
    h = Math.imul(h ^ (seed ?? '').charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export function rngFromSeed(seed: string): () => number {
  let s = hashSeed(seed) || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

function palette(seed: string): string[] {
  const rand = rngFromSeed(seed)
  return PALETTES[Math.floor(rand() * PALETTES.length)]
}

/** 像素风：size×size 网格，左右镜像对称，约一半格子着色 */
export function buildPixelAvatar(seed: string, size = 5): string {
  const rand = rngFromSeed(seed)
  const [c1, c2, bg] = palette(seed)
  const half = Math.ceil(size / 2)
  const grid: boolean[][] = []
  for (let r = 0; r < size; r++) {
    const row: boolean[] = []
    for (let c = 0; c < half; c++) row.push(rand() > 0.42)
    for (let c = size - 1; c >= half; c--) row[c] = row[size - 1 - c]
    grid.push(row)
  }
  const cell = 100 / size
  let rects = `<rect width="100" height="100" fill="${bg}"/>`
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c]) continue
      const fill = (r + c) % 2 === 0 ? c1 : c2
      rects += `<rect x="${(c * cell).toFixed(2)}" y="${(r * cell).toFixed(2)}" width="${cell.toFixed(2)}" height="${cell.toFixed(2)}" fill="${fill}"/>`
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${rects}</svg>`
}

function esc(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 字母风：渐变底 + 首字 */
export function buildLetterAvatar(letter: string, seed: string): string {
  const [c1, c2] = palette(seed)
  const ch = esc((letter ?? '').trim().charAt(0).toUpperCase() || '?')
  const gid = `g${hashSeed(seed + letter).toString(36)}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="100" height="100" fill="url(#${gid})"/>
  <text x="50" y="50" text-anchor="middle" dominant-baseline="central"
    font-family="system-ui,-apple-system,'Microsoft YaHei',sans-serif" font-size="46" font-weight="700" fill="#ffffff">${ch}</text>
</svg>`
}

/** 卡通几何风：圆脸 + 发型 + 眼睛 + 嘴 + 腮红 */
export function buildCartoonAvatar(seed: string): string {
  const rand = rngFromSeed(seed)
  const [c1, c2, bg] = palette(seed)
  const skin = ['#ffd7b3', '#f6c9a0', '#ffe0c2'][Math.floor(rand() * 3)]
  const faceX = 50
  const faceY = 56
  const faceR = 26 + rand() * 4
  const hairType = Math.floor(rand() * 3)
  const eyeGap = 9 + rand() * 3
  const eyeY = faceY - 3
  const mouthW = 8 + rand() * 6
  let hair = ''
  if (hairType === 0) hair = `<path d="M${faceX - faceR} ${faceY - 6} a${faceR} ${faceR} 0 0 1 ${faceR * 2} 0 l0 -8 a${faceR} ${faceR} 0 0 0 -${faceR * 2} 0 z" fill="${c1}"/>`
  else if (hairType === 1) hair = `<circle cx="${faceX}" cy="${faceY - faceR + 4}" r="${faceR * 0.92}" fill="${c1}"/><circle cx="${faceX}" cy="${faceY}" r="${faceR}" fill="${skin}"/>`
  else hair = `<rect x="${faceX - faceR}" y="${faceY - faceR - 6}" width="${faceR * 2}" height="14" rx="7" fill="${c1}"/>`

  const eyeL = `<circle cx="${faceX - eyeGap}" cy="${eyeY}" r="2.6" fill="#2b2b33"/>`
  const eyeR = `<circle cx="${faceX + eyeGap}" cy="${eyeY}" r="2.6" fill="#2b2b33"/>`
  const mouth = `<path d="M${faceX - mouthW} ${faceY + 9} q${mouthW} ${6 + rand() * 5} ${mouthW * 2} 0" stroke="#2b2b33" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
  const blush = `<circle cx="${faceX - eyeGap - 7}" cy="${faceY + 4}" r="3.4" fill="${c2}"/><circle cx="${faceX + eyeGap + 7}" cy="${faceY + 4}" r="3.4" fill="${c2}"/>`
  const body = `<path d="M${faceX - 30} 100 a30 22 0 0 1 60 0 z" fill="${c2}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <rect width="100" height="100" fill="${bg}"/>${hair}
  <circle cx="${faceX}" cy="${faceY}" r="${faceR}" fill="${skin}"/>${eyeL}${eyeR}${mouth}${blush}${body}
</svg>`
}

export function buildAvatar(style: 'pixel' | 'letter' | 'cartoon', seed: string, letter: string): string {
  if (style === 'pixel') return buildPixelAvatar(seed)
  if (style === 'letter') return buildLetterAvatar(letter, seed)
  return buildCartoonAvatar(seed)
}

export function svgDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

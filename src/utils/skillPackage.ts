/**
 * 技能包 IO 层（浏览器专属，纯逻辑在 @/composables/skillPackageCore）
 * ------------------------------------------------------------------
 * 只负责「读字节 / 写字节」：
 *   1. 选择技能文件夹（webkitdirectory）或 zip 包，产出统一的文件列表
 *   2. 按需把文件读成 text / base64（二进制不硬读，超限直接跳过并留痕）
 *   3. 把单个（或多个）技能打包成 zip 下载，导出后可原样再次导入
 * 规范见 docs/smart-skill-structure.md。
 */
import { strToU8, unzipSync, zipSync } from 'fflate'
import type { SmartSkill, SmartSkillResource } from '@/types'
import {
  RESOURCE_FILE_MAX,
  SKILL_FILE,
  isTextPath,
  planResources,
  skillToMarkdown,
  type RawResourceFile
} from '@/composables/skillPackageCore'
import { downloadBlob } from './download'
import { useToast } from '@/composables/useToast'

// ==================== 类型 ====================

export interface SkillFileEntry {
  /** 包内相对路径（含层级） */
  path: string
  size: number
  blob: Blob
}

export interface SkillSource {
  kind: 'folder' | 'zip'
  /** 用户选中的顶层名称（目录名 / zip 文件名），用于提示文案 */
  label: string
  entries: SkillFileEntry[]
}

// ==================== 选择来源 ====================

function relPathOf(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  const p = rel && rel.length ? rel : file.name
  return p.replace(/\\/g, '/').replace(/^\.?\//, '')
}

/** 打开「选择文件夹」对话框（webkitdirectory），返回带层级的文件列表 */
export function pickSkillFolder(): Promise<SkillSource | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.multiple = true
    input.addEventListener('cancel', () => resolve(null))
    input.addEventListener('change', () => {
      const list = Array.from(input.files ?? [])
      if (!list.length) {
        resolve(null)
        return
      }
      const entries = list.map(f => ({ path: relPathOf(f), size: f.size, blob: f as Blob }))
      const label = entries[0].path.split('/')[0] || '所选目录'
      resolve({ kind: 'folder', label, entries })
    })
    input.click()
  })
}

/** 打开「选择 zip」对话框，解压后返回同样的文件列表（目录项自动剔除） */
export function pickSkillZip(): Promise<SkillSource | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip,application/x-zip-compressed'
    input.addEventListener('cancel', () => resolve(null))
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      file
        .arrayBuffer()
        .then(buf => {
          const entries: SkillFileEntry[] = []
          try {
            const unzipped = unzipSync(new Uint8Array(buf))
            for (const [rawPath, data] of Object.entries(unzipped)) {
              const p = rawPath.replace(/\\/g, '/').replace(/^\.?\//, '')
              // 目录项以 / 结尾；macOS 压缩包里的 __MACOSX / 隐藏文件一律忽略
              if (!p || p.endsWith('/')) continue
              if (p.startsWith('__MACOSX/') || p.split('/').pop()?.startsWith('.') === true) continue
              const bytes = new Uint8Array(data)
              entries.push({ path: p, size: bytes.length, blob: new Blob([bytes]) })
            }
          } catch (e) {
            console.error('[skillPackage] zip 解压失败', e)
            useToast().error('压缩包解析失败，请确认是标准的 zip 文件')
            resolve(null)
            return
          }
          if (!entries.length) {
            useToast().warning('压缩包里没有可用文件')
            resolve(null)
            return
          }
          const label = file.name.replace(/\.zip$/i, '')
          resolve({ kind: 'zip', label, entries })
        })
        .catch(() => {
          useToast().error('压缩包读取失败')
          resolve(null)
        })
    })
    input.click()
  })
}

// ==================== 读取内容 ====================

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(s)
}

function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

/**
 * 把选中的文件读成 core 需要的 RawResourceFile。
 * - 文本类文件读 text，其余读 base64
 * - 超过单文件上限 4 倍的文件**不读内容**，只留体积信息，由 planResources 给出超限提示
 */
export async function readSkillFiles(source: SkillSource): Promise<RawResourceFile[]> {
  const out: RawResourceFile[] = []
  for (const e of source.entries) {
    if (e.size > RESOURCE_FILE_MAX * 4) {
      out.push({ path: e.path, size: e.size })
      continue
    }
    try {
      if (isTextPath(e.path)) {
        out.push({ path: e.path, size: e.size, text: await e.blob.text() })
      } else {
        out.push({ path: e.path, size: e.size, base64: toBase64(await e.blob.arrayBuffer()) })
      }
    } catch {
      out.push({ path: e.path, size: e.size })
    }
  }
  return out
}

/**
 * 在编辑弹框里补选资源文件（多选）。
 * 路径取文件名（webkitRelativePath 只在选目录时才有），体积超限的由 planResources 给出原因。
 */
export function pickResourceFiles(): Promise<{
  resources: SmartSkillResource[]
  skipped: { path: string; reason: string }[]
} | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.addEventListener('cancel', () => resolve(null))
    input.addEventListener('change', async () => {
      const list = Array.from(input.files ?? [])
      if (!list.length) {
        resolve(null)
        return
      }
      const raws: RawResourceFile[] = []
      for (const f of list) {
        const path = relPathOf(f)
        if (f.size > RESOURCE_FILE_MAX * 4) {
          raws.push({ path, size: f.size })
          continue
        }
        try {
          raws.push(
            isTextPath(path)
              ? { path, size: f.size, text: await f.text() }
              : { path, size: f.size, base64: toBase64(await f.arrayBuffer()) }
          )
        } catch {
          raws.push({ path, size: f.size })
        }
      }
      resolve(planResources(raws, ''))
    })
    input.click()
  })
}

// ==================== 导出 zip ====================

/** 目录/文件名安全化：去掉路径分隔符与控制字符，空值回落 */
export function safeDirName(name: string, fallback = 'skill'): string {
  const s = String(name ?? '')
    .replace(/[\\/:*?"<>|\r\n\t]/g, '')
    .trim()
  return s || fallback
}

/** 把单个技能序列化为「目录 → 字节」的映射（供 zip 打包与测试复用） */
export function skillZipEntries(skill: SmartSkill, rootOverride?: string): Record<string, Uint8Array> {
  const root = safeDirName(rootOverride ?? skill.name)
  const out: Record<string, Uint8Array> = {
    [`${root}/${SKILL_FILE}`]: strToU8(skillToMarkdown(skill))
  }
  for (const r of skill.resources ?? []) {
    const p = String(r.path ?? '').replace(/\\/g, '/').replace(/^\.?\//, '')
    if (!p || p.endsWith('/')) continue
    out[`${root}/${p}`] = r.encoding === 'base64' ? fromBase64(r.data) : strToU8(r.data)
  }
  return out
}

/** 打包单个技能为 zip 字节（目录名即技能名，导出后可直接再导入） */
export function buildSkillZip(skill: SmartSkill): Uint8Array {
  return zipSync(skillZipEntries(skill), { level: 6 })
}

/** 打包多个技能为一个 zip（每个技能一个顶层目录） */
export function buildSkillsZip(skills: SmartSkill[]): Uint8Array {
  const all: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  for (const s of skills) {
    let root = safeDirName(s.name)
    // 重名技能加后缀，避免 zip 内互相覆盖
    if (used.has(root.toLowerCase())) root = `${root}-${(s.id || '').slice(-4) || used.size}`
    used.add(root.toLowerCase())
    Object.assign(all, skillZipEntries(s, root))
  }
  return zipSync(all, { level: 6 })
}

function toBlob(bytes: Uint8Array): Blob {
  // 拷一份干净的 ArrayBuffer，避免把 fflate 内部 buffer 直接交给 Blob
  return new Blob([new Uint8Array(bytes).buffer as ArrayBuffer], { type: 'application/zip' })
}

/** 下载单个技能为 zip（文件名：技能名.zip） */
export function downloadSkillZip(skill: SmartSkill): boolean {
  try {
    return downloadBlob(`${safeDirName(skill.name)}.zip`, toBlob(buildSkillZip(skill)))
  } catch (e) {
    console.error('[skillPackage] zip 打包失败', e)
    useToast().error('打包失败，请稍后重试')
    return false
  }
}

/** 批量下载多个技能为一个 zip */
export function downloadSkillsZip(skills: SmartSkill[], filename = 'skills'): boolean {
  try {
    return downloadBlob(`${safeDirName(filename)}.zip`, toBlob(buildSkillsZip(skills)))
  } catch (e) {
    console.error('[skillPackage] zip 打包失败', e)
    useToast().error('打包失败，请稍后重试')
    return false
  }
}

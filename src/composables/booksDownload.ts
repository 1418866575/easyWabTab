/**
 * 图书馆「下载到本地」
 *
 * 一本书在服务器上的形态是 `public/bookdata/<id>/` 目录：入口页 index.html，
 * 可能还带着若干**二级页面**（入口页里用相对链接指向的同目录 .html）。
 * 本模块负责把这些页面一次性拉到本地：
 *
 *   - 只有入口页 → 直接下载单个 .html（不为一个文件套 zip，用户拿到就能双击打开）
 *   - 带二级页面 → 入口页 + 全部二级页打包成 .zip，目录结构照搬
 *
 * 失败策略是「尽力而为」而不是「全有或全无」：
 * 入口页抓不到才整体失败；某个二级页 404 只记录到 failed，其余照样打包 ——
 * 一本 80 页的书不该因为第 37 页挂了就整本下不来。
 *
 * 与 booksCore 的分工：URL/路径判定这类纯逻辑在 booksCore（可 node 单测），
 * 只有 fetch / JSZip / DOM 下载这些副作用留在这里。
 */
import JSZip from 'jszip'
import {
  BOOK_DOWNLOAD_CONCURRENCY,
  BOOK_DOWNLOAD_MAX_BYTES,
  BOOK_SUBPAGE_LIMIT,
  bookDirOf,
  bookEntryName,
  extractBookSubPages,
  slugifyBookId,
  type BookSource
} from './booksCore'

export interface BookDownloadInput {
  id: string
  title: string
  source: BookSource
  /** 静态书为 `/bookdata/<id>/index.html`；本机上传书为 '' */
  entry: string
  /** 本机上传书的正文；给了就无需联网 */
  html?: string
}

export interface BookDownloadResult {
  ok: boolean
  /** 实际落盘的文件名（.html 或 .zip） */
  fileName: string
  /** 打包的页面数（入口页 + 成功抓到的二级页） */
  pageCount: number
  /** 打包内容总字节数 */
  bytes: number
  /** 抓取失败或被体积上限略过的页面相对路径 */
  failed: string[]
  /** 是否因总体积上限而截断（还有页面没被打包） */
  truncated: boolean
  /** 直接可展示给用户的结果文案 */
  message: string
}

/** 非 ok 结果的统一构造 */
function fail(message: string): BookDownloadResult {
  return { ok: false, fileName: '', pageCount: 0, bytes: 0, failed: [], truncated: false, message }
}

/** 文件名安全化：书名 → slug，全清洗没了就退回 id */
function safeName(title: string, id: string): string {
  return slugifyBookId(title || '') || slugifyBookId(id || '') || 'book'
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return await res.text()
}

/** 二级页只需字节（不再解析），直接取 arrayBuffer 省一次字符串解码 */
async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * 定长并发跑任务。
 *
 * 不用 Promise.all 一把梭：一本书两百个页面同时发请求，浏览器连接池排队、
 * nginx 也容易判成异常流量。并发压到 6 既快又稳。
 */
async function runPool<T>(items: string[], limit: number, worker: (item: string) => Promise<T>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor++]
      await worker(item)
    }
  })
  await Promise.all(runners)
}

/** 触发浏览器下载并回收 object URL */
function triggerFile(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 立即 revoke 在部分浏览器会抢在下载真正开始前销毁 URL，延迟一拍更稳
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * 下载一本书的全部页面到本地。
 *
 * 单页直接给 .html，多页给 .zip —— 一个文件硬套 zip 只会让用户多一步解压。
 */
export async function downloadBook(input: BookDownloadInput): Promise<BookDownloadResult> {
  const title = input.title || input.id || 'book'
  const dir = bookDirOf(input.entry)
  const entryName = bookEntryName(input.entry)

  /** ---------- 1. 入口页 ---------- */
  let entryHtml = ''
  if (input.source === 'upload') {
    entryHtml = input.html ?? ''
    if (!entryHtml) return fail(`《${title}》在本机没有可读内容，无法导出`)
  } else {
    if (!input.entry) return fail(`《${title}》没有可下载的地址`)
    try {
      entryHtml = await fetchText(input.entry)
    } catch (e) {
      return fail(`《${title}》入口页下载失败：${(e as Error)?.message ?? e}`)
    }
  }

  /** ---------- 2. 解析二级页面 ---------- */
  // 上传书是单文件自包含 HTML，没有服务器目录可谈，不走解析
  const subs =
    input.source === 'upload'
      ? []
      : extractBookSubPages(entryHtml, {
          dirPrefix: dir,
          entryName,
          limit: BOOK_SUBPAGE_LIMIT
        })

  /** ---------- 3a. 单页：直接存 HTML ---------- */
  if (subs.length === 0) {
    const fileName = `${safeName(title, input.id)}.html`
    const bytes = byteLength(entryHtml)
    triggerFile(fileName, new Blob([entryHtml], { type: 'text/html;charset=utf-8' }))
    return {
      ok: true,
      fileName,
      pageCount: 1,
      bytes,
      failed: [],
      truncated: false,
      message: `已下载《${title}》`
    }
  }

  /** ---------- 3b. 多页：打包 zip ---------- */
  const zip = new JSZip()
  const root = safeName(title, input.id)
  zip.file(`${root}/${entryName}`, entryHtml)

  let used = byteLength(entryHtml)
  let pageCount = 1
  let truncated = false
  const failed: string[] = []

  await runPool(subs, BOOK_DOWNLOAD_CONCURRENCY, async (rel) => {
    // 体积已到上限：剩下的不再请求（记截断而不逐个标 failed，避免刷屏）
    if (truncated) return
    try {
      const buf = await fetchBytes(`${dir}${rel}`)
      if (used + buf.byteLength > BOOK_DOWNLOAD_MAX_BYTES) {
        truncated = true
        return
      }
      used += buf.byteLength
      zip.file(`${root}/${rel}`, buf)
      pageCount += 1
    } catch {
      failed.push(rel)
    }
  })

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  })
  const fileName = `${root}.zip`
  triggerFile(fileName, blob)

  const problems: string[] = []
  if (failed.length) problems.push(`${failed.length} 页抓取失败`)
  if (truncated) problems.push('超出 60MB 已截断')
  return {
    ok: true,
    fileName,
    pageCount,
    bytes: used,
    failed,
    truncated,
    message: problems.length
      ? `《${title}》已下载 ${pageCount} 页（${problems.join('、')}）`
      : `《${title}》已下载 ${pageCount} 页`
  }
}

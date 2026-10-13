/**
 * 扫描 public/bookdata/ 生成 public/bookdata/manifest.json（个人图书馆清单）
 *
 * 运行：node scripts/gen-books-manifest.cjs
 *      或 npm run gen:books（build 前置会自动跑一次）
 *
 * 设计目标：**放入文件即出卡片，零维护**。
 * - 必需：public/bookdata/<id>/index.html（自包含单文件）
 * - 可选：public/bookdata/<id>/meta.json（title / description / cover / category / tags / order）
 *   缺 meta.json 时回落到目录名与 HTML 的 <title>，卡片照常显示。
 *
 * ⚠️ 目录名**不能**叫 `books`：SPA 书架路由就是 `/books`，
 * 若静态目录也叫 `dist/books/` 且无 index.html，nginx 的
 * `try_files $uri $uri/ /index.html` 命中该目录后会交给 index 模块 →
 * autoindex 关闭 → 直接 403 Forbidden，SPA 回退永远走不到（实测复现）。
 * 故书籍数据一律放 `bookdata/`，与路由命名空间彻底分开。
 *
 * 铁律（与博客模块的 P4/P5 兜底一致）：
 * - 绝不删除已有条目，只增补与刷新
 * - meta.json 非法只告警不抛错，回落默认值，绝不写入 undefined
 * - 缺 index.html 的目录跳过但**必须控制台告警**（不静默吞掉）
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..', 'public', 'bookdata')
const MANIFEST = path.join(ROOT, 'manifest.json')

/** 分类兜底值：meta.json 未写 category 时使用 */
const DEFAULT_CATEGORY = '未分类'

/**
 * 读旧 manifest，用于**只补不删**：脚本异常退出时不会把已有书条目弄丢。
 * 结构非法时降级为空表（并告警），不阻断本次生成。
 */
function readPrevManifest() {
  try {
    if (!fs.existsSync(MANIFEST)) return {}
    const parsed = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    if (!Array.isArray(parsed)) {
      console.warn('[books] 旧 manifest.json 不是数组 → 按空表处理（本次将全量重建）')
      return {}
    }
    const map = {}
    for (const item of parsed) {
      if (item && typeof item.id === 'string') map[item.id] = item
    }
    return map
  } catch (e) {
    console.warn('[books] 旧 manifest.json 解析失败 → 按空表处理:', e.message)
    return {}
  }
}

/** 读 meta.json；不存在返回 null，非法返回 {}（配合告警，调用方按兜底取值） */
function readMeta(dir) {
  const metaPath = path.join(dir, 'meta.json')
  if (!fs.existsSync(metaPath)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.warn(`[books] meta.json 不是对象，已按默认值处理：${metaPath}`)
      return {}
    }
    return parsed
  } catch (e) {
    console.warn(`[books] meta.json 解析失败，已按默认值处理：${metaPath} →`, e.message)
    return {}
  }
}

/**
 * 从 HTML 抽 <title> 与 <meta name="description">。
 * 只读文件头部 64KB —— 大文件动辄几十万到几百万字符，整读既慢又没必要。
 */
function readHtmlHead(html) {
  const head = html.slice(0, 64 * 1024)
  const titleMatch = head.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)
  const descMatch = head.match(
    /<meta[^>]+name=["']description["'][^>]*content=["']([\s\S]{0,500}?)["'][^>]*>/i
  ) || head.match(
    /<meta[^>]+content=["']([\s\S]{0,500}?)["'][^>]*name=["']description["'][^>]*>/i
  )
  const clean = (s) => (s ? s.replace(/\s+/g, ' ').trim() : '')
  return { title: clean(titleMatch?.[1]), description: clean(descMatch?.[1]) }
}

/** 截断 index.html 头部用于抽标题；读完即丢，不整体载入内存 */
function peekHtml(pathname) {
  try {
    const fd = fs.openSync(pathname, 'r')
    try {
      const buf = Buffer.alloc(64 * 1024)
      const bytes = fs.readSync(fd, buf, 0, buf.length, 0)
      return buf.slice(0, bytes).toString('utf8')
    } finally {
      fs.closeSync(fd)
    }
  } catch (e) {
    console.warn(`[books] 读取失败，按空标题处理：${pathname} →`, e.message)
    return ''
  }
}

/** 字符串取非空，否则用兜底 */
function str(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

/** 标签数组归一：非数组或全非字符串 → 空数组；剔除空串与重复 */
function tags(value) {
  if (!Array.isArray(value)) return []
  const out = []
  for (const t of value) {
    if (typeof t !== 'string') continue
    const s = t.trim()
    if (s && !out.includes(s)) out.push(s)
  }
  return out
}

/**
 * 排序权重：meta.json 给有限正整数则用它，否则用 LARGE_ORDER（保持目录名序，见末尾排序）。
 *
 * 刻意不用 Infinity：JSON.stringify 会把 Infinity 序列化成 null，
 * manifest 里出现 "order": null 会让前端每次都得防一手。给一个有限大值更干净。
 */
const LARGE_ORDER = 1e9

function order(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : LARGE_ORDER
}

function scan() {
  if (!fs.existsSync(ROOT)) {
    console.warn('[books] public/bookdata/ 不存在，跳过生成')
    return []
  }

  const prev = readPrevManifest()
  const entries = []
  const warnings = []

  for (const name of fs.readdirSync(ROOT, { withFileTypes: true })) {
    // 只处理一级子目录；_ 前缀（_template）与 manifest.json 本体跳过
    if (!name.isDirectory()) continue
    if (name.name.startsWith('_') || name.name.startsWith('.')) continue

    const id = name.name
    const dir = path.join(ROOT, id)
    const indexPath = path.join(dir, 'index.html')

    if (!fs.existsSync(indexPath)) {
      warnings.push(`目录缺少 index.html，已跳过：${id}`)
      continue
    }

    const meta = readMeta(dir)
    const head = meta ? { title: '', description: '' } : readHtmlHead(peekHtml(indexPath))

    let stat
    try {
      stat = fs.statSync(indexPath)
    } catch {
      warnings.push(`无法读取 index.html 的大小，已跳过：${id}`)
      continue
    }

    // cover：meta.json 里写文件名（相对本目录）或已站内绝对路径，两种都支持
    let cover = ''
    if (meta && typeof meta.cover === 'string' && meta.cover.trim()) {
      const raw = meta.cover.trim()
      cover = raw.startsWith('/') ? raw : `/bookdata/${id}/${raw.replace(/^\.\//, '')}`
      // 文件不存在只告警不失败：卡片会回落到色块占位，不该因此丢掉整本书
      if (!raw.startsWith('/') && !fs.existsSync(path.join(dir, raw))) {
        warnings.push(`meta.json 的 cover 文件不存在，将用色块占位：${id}/${raw}`)
      }
    }

    const title = str(meta?.title, head.title || id)
    const description = str(meta?.description, head.description || '')
    const old = prev[id]

    entries.push({
      id,
      title,
      description,
      cover,
      category: str(meta?.category, DEFAULT_CATEGORY),
      tags: tags(meta?.tags),
      order: order(meta?.order),
      entry: `/bookdata/${id}/index.html`,
      size: stat.size,
      updatedAt: stat.mtime.toISOString(),
      hasMeta: !!meta,
      // source 固定 static：浏览器端上传的书不走 manifest，由 IndexedDB 侧合并进来
      source: 'static'
    })

    // 只补不删：保留旧条目里脚本刷新不到的人工字段（如手动调过的 order 精度、扩展字段）
    if (old && typeof old === 'object') {
      for (const k of Object.keys(old)) {
        if (k in entries[entries.length - 1]) continue
        entries[entries.length - 1][k] = old[k]
      }
    }
  }

  // 排序：先 order（未设置的排最后），同 order 按标题
  entries.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order
    return a.title.localeCompare(b.title, 'zh-Hans-CN')
  })

  if (warnings.length) {
    console.warn(`[books] 发现 ${warnings.length} 处问题：`)
    for (const w of warnings) console.warn('  · ' + w)
  }
  return entries
}

function main() {
  const entries = scan()

  try {
    fs.writeFileSync(MANIFEST, JSON.stringify(entries, null, 2) + '\n', 'utf8')
  } catch (e) {
    console.error('[books] 写入 manifest.json 失败:', e.message)
    process.exitCode = 1
    return
  }

  const withMeta = entries.filter((e) => e.hasMeta).length
  console.log(
    `[books] 已生成 manifest.json：共 ${entries.length} 本（带 meta.json ${withMeta} 本，` +
    `${entries.length - withMeta} 本按目录名与 HTML 标题兜底）`
  )
}

main()
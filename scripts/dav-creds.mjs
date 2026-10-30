/**
 * WebDAV 云同步凭证的读取入口（供 import-today-to-blog / resume-publish 共用）
 *
 * 为什么不再写死在脚本里：
 *   Gitee 仓库是**公开**的，`const DAV_PASS = '...'` 等于把站点 WebDAV 的 Basic 口令挂到公网。
 *   仓库里已有同款范式：`config/blog-share.env`（真文件 gitignore，只提交 `.example`），
 *   这里照抄，不再另开一套。
 *
 * 取值优先级（前者覆盖后者）：
 *   1) 环境变量            EWT_DAV_URL / EWT_DAV_USER / EWT_DAV_PASS
 *   2) 配置文件 <repo>/config/webdav.env   （KEY=VALUE，支持 # 注释与简单引号）
 *   3) 代码内默认值        仅 URL 与用户名有默认；**口令没有默认值**
 *
 * 用户名不算秘密（站点 URL /dav/<用户名>/ 里本来就是明文），故保留默认值只为省事；
 * 口令缺失时一律报错退出，绝不猜测、绝不回退到任何内置字符串。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** 仓库根目录（本文件在 scripts/ 下） */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** 配置文件路径：与 config/blog-share.env 同一目录、同一约定 */
export const DAV_ENV_FILE = path.join(REPO_ROOT, 'config', 'webdav.env')

/**
 * 极简 .env 解析：只认 `KEY=VALUE`，够用即可。
 * 刻意不引 dotenv —— 这支脚本只跑在本机，零依赖更好维护。
 */
function parseEnvFile(file) {
  const out = {}
  let text
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return out // 文件不存在是常态（CI / 首次使用），不算错误
  }
  // 兼容 CRLF：Windows 上手工编辑的文件几乎都是 CRLF
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim().replace(/^export\s+/, '')
    let val = line.slice(eq + 1).trim()
    // 允许 "v" / 'v'，去掉成对引号；不做转义处理
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

const fileEnv = parseEnvFile(DAV_ENV_FILE)
const pick = (key, fallback = '') => {
  const fromEnv = process.env[key]
  if (fromEnv != null && fromEnv !== '') return fromEnv
  const fromFile = fileEnv[key]
  if (fromFile != null && fromFile !== '') return fromFile
  return fallback
}

/** 默认值只覆盖「非秘密」的两项 */
export const DAV_URL = pick('EWT_DAV_URL', 'https://www.codehelp.com.cn/dav/')
export const DAV_USER = pick('EWT_DAV_USER', 'sifujiang')
/** 必填项：没有默认值 */
export const DAV_PASS = pick('EWT_DAV_PASS', '')

/**
 * 校验口令是否就位；缺失时打印可操作的提示并退出。
 * 提示里**只出现配置项名**，不回显任何口令内容。
 */
export function assertDavCredentials() {
  if (DAV_PASS) return
  console.error(
    [
      '',
      '✗ 缺少 WebDAV 口令，无法继续。',
      '',
      '  口令不再硬编码在脚本里（Gitee 仓库是公开的）。二选一：',
      '',
      '  A) 环境变量（当前终端生效，适合临时用 / 定时任务）',
      '       Windows CMD :  set EWT_DAV_PASS=你的口令',
      '       PowerShell  :  $env:EWT_DAV_PASS="你的口令"',
      '       Bash        :  export EWT_DAV_PASS=你的口令',
      '',
      `  B) 配置文件（一劳永逸，已被 .gitignore 忽略，不会入库）`,
      `       复制 config/webdav.env.example → config/webdav.env，填入 EWT_DAV_PASS`,
      '',
      '  可选：EWT_DAV_URL（默认 ' + 'https://www.codehelp.com.cn/dav/' + '）、EWT_DAV_USER（默认 sifujiang）',
      ''
    ].join('\n')
  )
  process.exit(1)
}

/** `https://<域名>/dav/<用户名>/easy-web-tab/blog.json` —— 两支脚本原本各拼一遍，收敛到这里 */
export const DAV_BLOG_JSON_URL = (() => {
  const u = new URL(DAV_URL)
  return `${u.origin}${u.pathname.replace(/\/+$/, '')}/${DAV_USER}/easy-web-tab/blog.json`
})()

/** Basic 认证头（只有调用时才要求口令存在） */
export function davAuthHeader() {
  assertDavCredentials()
  return 'Basic ' + Buffer.from(`${DAV_USER}:${DAV_PASS}`).toString('base64')
}

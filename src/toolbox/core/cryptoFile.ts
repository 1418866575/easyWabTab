/**
 * 文件对称加解密（Web Crypto：PBKDF2 + AES-GCM）
 * 容器格式：salt(16B) + iv(12B) + ciphertext
 * 纯前端，密码不离开本机。
 */

const enc = new TextEncoder()

export async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase) as unknown as BufferSource, 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 100000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptBytes(data: Uint8Array, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource))
  const out = new Uint8Array(salt.length + iv.length + ct.length)
  out.set(salt, 0)
  out.set(iv, salt.length)
  out.set(ct, salt.length + iv.length)
  return out
}

export async function decryptBytes(data: Uint8Array, passphrase: string): Promise<Uint8Array> {
  if (data.length < 28) throw new Error('数据长度不足，可能不是有效的加密文件')
  const salt = data.slice(0, 16)
  const iv = data.slice(16, 28)
  const ct = data.slice(28)
  const key = await deriveKey(passphrase, salt)
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct as BufferSource))
}

/** 随机字节 → base64url 字符串 */
export function randomBytesToBase64Url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

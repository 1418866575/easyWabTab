/**
 * 工具自有数据的持久化（IndexedDB）
 *
 * - 存储位置：`nav` object store（v21 起按 key 多记录），键名 `toolbox-data:<工具 id>`
 * - 键不在 `NAV_SYNC_KEYS` 中，故**不参与任何云同步信封**，纯本机数据
 * - 读写全部走 try/catch：隐私模式 / 配额超限 / 脏数据一律回落到内存态
 *
 * 只给「需要跨会话保留数据」的工具用（四象限笔记、待办、身份验证器等）；
 * 一次性工具不要引入持久化。
 */

import { idbGetKey, idbPutKey } from '@/composables/useIdb'

const PREFIX = 'toolbox-data:'

function keyOf(toolId: string): string {
  return PREFIX + toolId
}

/** 读取工具数据；无数据或读取失败时返回 fallback */
export async function loadToolData<T>(toolId: string, fallback: T): Promise<T> {
  try {
    const raw = await idbGetKey<string>('nav', keyOf(toolId))
    if (typeof raw !== 'string' || !raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

/** 写入工具数据（防抖由调用方负责；写入失败静默降级为内存态） */
export async function saveToolData(toolId: string, value: unknown): Promise<void> {
  try {
    await idbPutKey('nav', keyOf(toolId), JSON.stringify(value))
  } catch (e) {
    console.warn('[toolStore] 写入失败，已降级为内存态:', e)
  }
}

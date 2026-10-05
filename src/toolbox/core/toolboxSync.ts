/**
 * 工具箱云同步 —— 信封读写层（独立文件，工具箱模块自有，不侵入 useIdb / useCloudSync）
 *
 * 职责：把「收藏 / 最近使用 / 点击次数 / 搜索历史」四项打包成 toolbox.json 信封，并提供
 *       导出（本地 → 信封）、导入（信封 → 本地）、合并（本地 ⊕ 云端）三个动作。
 *数据落点是 IndexedDB 的 `nav` store 的 `toolbox-prefs` 键（见 useToolboxPrefs）。
 *
 * 与全局云同步的衔接：useCloudSync 里注册一个 name: 'toolbox.json' 的信封项即可，
 * 本文件不直接依赖 davRequest，保持与「纯数据层 / 传输层」分离。
 */

import { idbGet } from '@/composables/useIdb'
import { mergeToolboxData, normalizeToolboxData, toolboxDiffSize, toolboxSignature } from './toolboxSyncCore'
import type { ToolboxSyncData } from './toolboxSyncCore'
import { applyToolboxPrefs, getToolboxPrefsSnapshot } from '../prefs/useToolboxPrefs'

/** nav store 内本模块占用的键 */
const IDB_KEY = 'toolbox-prefs'

/** 导出本地四项 → 信封（供 upload） */
export async function exportToolbox(): Promise<ToolboxSyncData> {
  const snap = getToolboxPrefsSnapshot()
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: snap.favorites,
    recent: snap.recent,
    clicks: snap.clicks,
    searchHistory: snap.searchHistory
  }
}

/**
 * 导入云端信封 → 写回本地（**并集 + 时间最新**，不丢本机数据）。
 * 供 download 后调用；写回后由applyToolboxPrefs 立即落盘到 IndexedDB。
 */
export async function importToolboxData(remote: ToolboxSyncData): Promise<void> {
  if (!remote) return
  const local = getToolboxPrefsSnapshot()
  const merged = mergeToolboxData(local, remote, true)
  applyToolboxPrefs(merged)
}

/** 合并（冲突时用）：与 importToolboxData 同义，保留独立命名以便 useCloudSync 引用 */
export function mergeToolbox(local: ToolboxSyncData, remote: ToolboxSyncData): ToolboxSyncData {
  const m = mergeToolboxData(local, remote, true)
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: m.favorites,
    recent: m.recent,
    clicks: m.clicks,
    searchHistory: m.searchHistory
  }
}

/** 差异大小（用于「是否有更新」判断；0 = 无差异） */
export function diffSize(local: ToolboxSyncData, remote: ToolboxSyncData): number {
  return toolboxDiffSize(local, remote)
}

/** 签名（变化才参与冲突合并） */
export function signature(data: ToolboxSyncData): string {
  return toolboxSignature(data)
}

/** 拉取后把云端数据合并进本地（供 useCloudSync 的 reload 调用，让 UI 立即反映） */
export async function reloadToolboxStore(): Promise<void> {
  try {
    const rec = (await idbGet<Record<string, string>>('nav')) || {}
    const raw = rec[IDB_KEY]
    if (typeof raw === 'string') {
      const parsed = normalizeToolboxData(JSON.parse(raw))
      applyToolboxPrefs(parsed)
    }
  } catch (e) {
    console.warn('[toolboxSync] reload 失败，保持当前内存态:', e)
  }
}

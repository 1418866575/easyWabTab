/**
 * 宸ュ叿绠变簯鍚屾 鈥斺€?淇″皝璇诲啓灞傦紙鐙珛鏂囦欢锛屽伐鍏风妯″潡鑷湁锛屼笉渚靛叆 useIdb / useCloudSync锛? *
 * 鑱岃矗锛氭妸銆屾敹钘?/ 鏈€杩戜娇鐢?/ 鐐瑰嚮娆℃暟 / 鎼滅储鍘嗗彶銆嶅洓椤规墦鍖呮垚 toolbox.json 淇″皝锛屽苟鎻愪緵
 *       瀵煎嚭锛堟湰鍦?鈫?淇″皝锛夈€佸鍏ワ紙淇″皝 鈫?鏈湴锛夈€佸悎骞讹紙鏈湴 鈯?浜戠锛変笁涓姩浣溿€? *鏁版嵁钀界偣鏄?IndexedDB 鐨?`nav` store 鐨?`toolbox-prefs` 閿紙瑙?useToolboxPrefs锛夈€? *
 * 涓庡叏灞€浜戝悓姝ョ殑琛旀帴锛歶seCloudSync 閲屾敞鍐屼竴涓?name: 'toolbox.json' 鐨勪俊灏侀」鍗冲彲锛? * 鏈枃浠朵笉鐩存帴渚濊禆 davRequest锛屼繚鎸佷笌銆岀函鏁版嵁灞?/ 浼犺緭灞傘€嶅垎绂汇€? */

import { idbGet } from '@/composables/useIdb'
import { mergeToolboxData, normalizeToolboxData, toolboxDiffSize, toolboxSignature } from './toolboxSyncCore'
import type { ToolboxSyncData } from './toolboxSyncCore'
import { applyToolboxPrefs, getToolboxPrefsSnapshot } from '../prefs/useToolboxPrefs'

/** nav store 鍐呮湰妯″潡鍗犵敤鐨勯敭 */
const IDB_KEY = 'toolbox-prefs'

/** 瀵煎嚭鏈湴鍥涢」 鈫?淇″皝锛堜緵 upload锛?*/
export async function exportToolbox(): Promise<ToolboxSyncData> {
  const snap = getToolboxPrefsSnapshot()
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: snap.favorites,
    recent: snap.recent,
    clicks: snap.clicks,
    searchHistory: snap.searchHistory,
    disabled: snap.disabled
  }
}

/**
 * 瀵煎叆浜戠淇″皝 鈫?鍐欏洖鏈湴锛?*骞堕泦 + 鏃堕棿鏈€鏂?*锛屼笉涓㈡湰鏈烘暟鎹級銆? * 渚?download 鍚庤皟鐢紱鍐欏洖鍚庣敱applyToolboxPrefs 绔嬪嵆钀界洏鍒?IndexedDB銆? */
export async function importToolboxData(remote: ToolboxSyncData): Promise<void> {
  if (!remote) return
  const local = getToolboxPrefsSnapshot()
  const merged = mergeToolboxData(local, remote, true)
  applyToolboxPrefs(merged)
}

/** 鍚堝苟锛堝啿绐佹椂鐢級锛氫笌 importToolboxData 鍚屼箟锛屼繚鐣欑嫭绔嬪懡鍚嶄互渚?useCloudSync 寮曠敤 */
export function mergeToolbox(local: ToolboxSyncData, remote: ToolboxSyncData): ToolboxSyncData {
  const m = mergeToolboxData(local, remote, true)
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: m.favorites,
    recent: m.recent,
    clicks: m.clicks,
    searchHistory: m.searchHistory,
    disabled: m.disabled
  }
}

/** 宸紓澶у皬锛堢敤浜庛€屾槸鍚︽湁鏇存柊銆嶅垽鏂紱0 = 鏃犲樊寮傦級 */
export function diffSize(local: ToolboxSyncData, remote: ToolboxSyncData): number {
  return toolboxDiffSize(local, remote)
}

/** 绛惧悕锛堝彉鍖栨墠鍙備笌鍐茬獊鍚堝苟锛?*/
export function signature(data: ToolboxSyncData): string {
  return toolboxSignature(data)
}

/** 鎷夊彇鍚庢妸浜戠鏁版嵁鍚堝苟杩涙湰鍦帮紙渚?useCloudSync 鐨?reload 璋冪敤锛岃 UI 绔嬪嵆鍙嶆槧锛?*/
export async function reloadToolboxStore(): Promise<void> {
  try {
    const rec = (await idbGet<Record<string, string>>('nav')) || {}
    const raw = rec[IDB_KEY]
    if (typeof raw === 'string') {
      const parsed = normalizeToolboxData(JSON.parse(raw))
      applyToolboxPrefs(parsed)
    }
  } catch (e) {
    console.warn('[toolboxSync] reload 澶辫触锛屼繚鎸佸綋鍓嶅唴瀛樻€?', e)
  }
}

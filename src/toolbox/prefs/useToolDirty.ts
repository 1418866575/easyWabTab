/**
 * 工具弹框的「脏状态」单例
 * - 工具打开时任何输入都会标记为 dirty
 * - 复制 / 下载结果后标记 saved
 * - 关闭时由 ToolboxToolPanel 重置（resetDirty）
 * 说明：按用户要求，关闭弹框已改为**一步关闭**，不再据此弹二次确认；
 * 该状态保留用于工具内部判断「是否已产出结果」，接口不变，工具组件无需改动。
 * 同一时刻只会有一个工具弹框，故用模块级单例即可。
 */

import { ref, watchEffect, onScopeDispose } from 'vue'

const dirty = ref(false)
const saved = ref(false)

export function setDirty(v: boolean): void {
  dirty.value = v
}

export function markSaved(): void {
  saved.value = true
}

export function resetDirty(): void {
  dirty.value = false
  saved.value = false
}

export function useToolDirty() {
  return { dirty, saved, setDirty, markSaved, resetDirty }
}

/**
 * 在工具组件内自动跟踪输入内容：
 * @param compute 返回当前是否有有效输入
 */
export function useDirtyFlag(compute: () => boolean): { markSaved: () => void } {
  watchEffect(() => {
    dirty.value = !!compute()
  })
  onScopeDispose(() => {
    dirty.value = false
    saved.value = false
  })
  return { markSaved }
}

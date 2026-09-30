import { ref } from 'vue'
import { useToast } from './useToast'

/**
 * 销售记账弹框统一的「保存中」状态与防重复提交。
 *
 * 背景：各弹框原先只在保存按钮上绑 `:disabled="!isFormValid"`，而 `handleSave` 内
 * `await store.xxx()` 期间按钮仍可点击，连点会重复写入数据（库存弹框为多行循环 +
 * 多次 await，风险最高）。同时各弹框都没有 try/catch，store 抛异常时变成
 * unhandled rejection，界面无任何反馈、弹框也不关闭，用户以为卡死。
 *
 * 约定：
 * - 业务性失败（store 返回 `{ ok: false }`）由调用方 `throw new Error(具体文案)`，
 *   由 run 统一 toast，保证「一处提示、不重复弹」；
 * - 非预期异常（如 IndexedDB 写入失败）由 run 兜底为通用文案。
 *
 * 用法：
 *   const { saving, run } = useBizSaving()
 *   const ok = await run(async () => { ... })
 *   if (!ok) return            // 失败：run 已提示，保持弹框打开
 *   toast.success('已保存'); showDialog.value = false
 *
 * 按钮：<el-button :disabled="!isFormValid || saving" :loading="saving">
 */
export function useBizSaving() {
  const saving = ref(false)

  /**
   * 串行执行保存逻辑。
   * @returns true = 保存成功；false = 未执行（重复点击）或已失败（run 内已提示）
   */
  async function run(fn: () => Promise<void>): Promise<boolean> {
    // 防重复提交：保存进行中再次触发（连点/回车重复提交）直接忽略
    if (saving.value) return false
    saving.value = true
    try {
      await fn()
      return true
    } catch (e) {
      const message = e instanceof Error && e.message ? e.message : '保存失败，请重试'
      useToast().error(message)
      return false
    } finally {
      saving.value = false
    }
  }

  return { saving, run }
}

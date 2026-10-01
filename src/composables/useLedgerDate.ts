import { computed } from 'vue'
import { useWorkbenchBusinessStore } from '@/stores/workbenchBusiness'

/**
 * 账本年份与录入日期的可用范围。
 *
 * 规则：每本账本只记录其所属年份的数据，录入日期必须落在该年份内，
 * 否则 store 写入守卫会拒绝（跨年需切换到对应年份的账本）。
 *
 * 原先「进货 / 库存 / 销售」三个录入弹框各写了一份完全相同的
 * `ledgerYear` + `disabledDate`，现统一抽取，避免改一处漏两处。
 */
export function useLedgerDate() {
  const store = useWorkbenchBusinessStore()

  /** 当前账本年份（无账本时回退为自然年，store 侧保证不为 null） */
  const ledgerYear = computed(() => store.currentLedgerYear)

  /** 日期选择器禁用规则：禁用不在当前账本年份内的日期 */
  function disabledDate(d: Date): boolean {
    return d.getFullYear() !== ledgerYear.value
  }

  return { ledgerYear, disabledDate }
}

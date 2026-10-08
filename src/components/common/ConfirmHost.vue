<script setup lang="ts">
/**
 * 统一确认弹框宿主（P0 阶段 1：消除 ElMessageBox 与自研 Toast 的双轨道）。
 *
 * 全局只需挂载一次（App.vue）：`<ConfirmHost />`。
 * 视觉完全走 `BaseDialog` + `.ui-btn` 体系 → 与 Toast、其它弹框一致，
 * 暗色与 7 套 accent 主题自动跟随。
 */
import { ref, watch } from 'vue'
import { useZIndex } from 'element-plus'
import BaseDialog from './BaseDialog.vue'
import Icon from '../Icon.vue'
import { useConfirm } from '@/composables/useConfirm'

const { current, settle } = useConfirm()

/**
 * 层级：确认框是全局单例，可能从 el-dialog 内部弹出（如进货编辑弹框里点「移除」）。
 * el-dialog 用 Element Plus 的动态层级（2000 起、每次弹出递增），而 BaseDialog 默认固定 300，
 * 直接比对必然被压在编辑弹框后面 —— 用户看到的是「确认框没弹在编辑页上，弹到后面去了」。
 * 故每次弹出时向 Element Plus 申请一个高于当前所有弹层的值（本次实测：编辑弹框 2008 → 确认框 2009+）。
 * 放在 watch 里而不是 computed：computed 每次重渲染都会调用 nextZIndex()，层级会被无意义地推高。
 */
const { nextZIndex } = useZIndex()
const zIndex = ref<number | undefined>(undefined)
watch(current, (req) => {
  zIndex.value = req ? nextZIndex() : undefined
})
</script>

<template>
  <BaseDialog
    v-if="current"
    :title="current.title"
    width="420px"
    :close-on-overlay="false"
    :z-index="zIndex"
    @close="settle(false)"
  >
    <div class="confirm-body">
      <span class="confirm-icon" aria-hidden="true"><Icon name="alert" /></span>
      <p class="confirm-message">{{ current.message }}</p>
    </div>

    <template #footer>
      <button type="button" class="btn-cancel" @click="settle(false)">取消</button>
      <button type="button" class="btn-submit" @click="settle(true)">确定</button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.confirm-body {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3, 12px);
}

.confirm-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-full, 9999px);
  background: var(--color-warning-soft, #fef3c7);
  color: var(--color-warning, #f59e0b);
}

.confirm-message {
  margin: 0;
  font-size: var(--font-size-base, 15px);
  line-height: var(--line-height-base, 1.6);
  color: var(--color-text, #1e293b);
  overflow-wrap: anywhere;
  /* 保留 \n 换行（原 ElMessageBox 适配的行为），纯文本插值无 XSS 风险 */
  white-space: pre-line;
}

@media (max-width: 768px) {
  /* 移动端触控目标 ≥44px（WCAG 2.2 下限），与项目移动端基线一致 */
  :deep(.bd-footer .btn-cancel),
  :deep(.bd-footer .btn-submit) {
    flex: 1 1 0;
    min-height: 44px;
  }
}
</style>

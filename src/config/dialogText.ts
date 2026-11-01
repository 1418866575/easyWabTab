// 弹框（dialog）底部操作按钮的统一文案 —— 全站唯一来源
//
// 规范（2026-11 统一）：
//   · 左侧次要按钮统一叫「关闭」（原「取消」）
//   · 主按钮统一叫「保存」（原「新增 / 添加」，编辑态原本就是「保存」，故合并）
//   · 危险操作按钮（删除 / 清空等）保持各自语义，不走本表
//
// 用法：
//   <script setup lang="ts">
//   import { DIALOG_BTN } from '@/config/dialogText'
//
//   <template #footer>
//     <el-button @click="close">{{ DIALOG_BTN.close }}</el-button>
//     <el-button type="primary" @click="save">{{ DIALOG_BTN.save }}</el-button>
//   </template>
//
// 组件里不要裸写「取消 / 新增 / 添加 / 保存」文字，改这里即全站生效。

export const DIALOG_BTN = {
  /** 次要按钮：关闭弹框（不保存） */
  close: '关闭',
  /** 主按钮：保存并关闭 */
  save: '保存'
} as const

export type DialogBtnKey = keyof typeof DIALOG_BTN

import { defineStore } from 'pinia'
import { computed, ref, toRaw } from 'vue'
import type { MessageBoardData, MessageBoardMessage, MessageColor } from '@/types'
import {
  emptyMessageData,
  filterMessages,
  MESSAGE_CONTENT_MAX,
  MESSAGE_TITLE_MAX,
  normalizeMessageColor,
  normalizeMessageData,
  sortMessages
} from '@/composables/messageBoardCore'
import {
  activeOnly,
  bumpStamp,
  clearDeleted,
  gcTombstones as gcTombstonesCore,
  markDeleted,
  trashedItems
} from '@/composables/tombstoneCore'
import { idbGet, idbPut } from '@/composables/useIdb'
import { getClientId, markDirty } from '@/composables/useCloudSync'

function cut(value: string, max: number): string {
  return Array.from(value.trim()).slice(0, max).join('')
}

/**
 * 个人工作台「留言板」store：数据存 IndexedDB store 'messages'（单对象 { messages: [] }）。
 * 与便签 / 日记同构：删除写墓碑而非物理移除，随 workbench.json / 飞书表同步删除状态；
 * 展示层只读 activeMessages，绝不直接读 messages。
 */
export const useWorkbenchMessagesStore = defineStore('workbenchMessages', () => {
  const messages = ref<MessageBoardMessage[]>([])

  async function loadMessages(): Promise<void> {
    try {
      messages.value = normalizeMessageData(await idbGet<MessageBoardData>('messages')).messages
    } catch (e) {
      console.error('[Messages] load failed', e)
      messages.value = emptyMessageData().messages
    }
  }

  async function saveMessages(): Promise<void> {
    try {
      // 逐元素 toRaw：reactive 代理无法被 IDB 结构化克隆（DataCloneError），
      // toRaw 只解开最外层数组，元素仍可能是 Proxy。
      await idbPut('messages', { messages: toRaw(messages.value).map((m) => toRaw(m)) })
      markDirty()
    } catch (e) {
      console.error('[Messages] save failed', e)
    }
  }

  /** 普通编辑推进 ver：compareStamp 先比 ver 再比 updatedAt，不推进会被远端旧记录整条覆盖 */
  function touch(m: MessageBoardMessage): void {
    Object.assign(m, bumpStamp(toRaw(m), { clientId: getClientId() }))
  }

  /** 新增留言：正文 trim 后为空 → 不落库返回 false；标题与正文按上限截断。 */
  async function addMessage(input: { title?: string; content: string; color?: MessageColor }): Promise<boolean> {
    const content = cut(input.content, MESSAGE_CONTENT_MAX)
    if (!content) return false
    const now = new Date().toISOString()
    messages.value.push({
      id: `mb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: cut(input.title ?? '', MESSAGE_TITLE_MAX),
      content,
      color: normalizeMessageColor(input.color),
      pinned: false,
      createdAt: now,
      updatedAt: now,
      ver: 1,
      clientId: getClientId()
    })
    await saveMessages()
    return true
  }

  async function updateMessage(
    id: string,
    patch: Partial<Pick<MessageBoardMessage, 'title' | 'content' | 'color' | 'pinned'>>
  ): Promise<void> {
    const index = messages.value.findIndex((m) => m.id === id)
    if (index === -1) return
    const prev = messages.value[index]
    if (patch.content !== undefined && !cut(patch.content, MESSAGE_CONTENT_MAX)) return
    const next = {
      ...bumpStamp(toRaw(prev), { clientId: getClientId() }),
      ...(patch.title !== undefined ? { title: cut(patch.title, MESSAGE_TITLE_MAX) } : {}),
      ...(patch.content !== undefined ? { content: cut(patch.content, MESSAGE_CONTENT_MAX) } : {}),
      ...(patch.color !== undefined ? { color: normalizeMessageColor(patch.color) } : {}),
      ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {})
    }
    messages.value[index] = next
    await saveMessages()
  }

  /** 删除 = 写墓碑（物理删除会被合并语义当作「远端新增」复活） */
  async function deleteMessage(id: string): Promise<void> {
    messages.value = toRaw(messages.value).map((m) =>
      m.id === id ? markDeleted(m, { clientId: getClientId() }) : m
    )
    await saveMessages()
  }

  /** 恢复墓碑（统一回收站「还原」） */
  async function restoreMessage(id: string): Promise<void> {
    messages.value = toRaw(messages.value).map((m) =>
      m.id === id ? clearDeleted(m, { clientId: getClientId() }) : m
    )
    await saveMessages()
  }

  /** 彻底删除 = 物理清除（回收站「彻底删除」/ GC 到期）；调用前须确保墓碑已上云 */
  async function purgeMessage(id: string): Promise<void> {
    messages.value = toRaw(messages.value).filter((m) => m.id !== id)
    await saveMessages()
  }

  async function togglePin(id: string): Promise<void> {
    const m = messages.value.find((x) => x.id === id)
    if (!m) return
    m.pinned = !m.pinned
    touch(m)
    await saveMessages()
  }

  /** 墓碑 GC：由云同步推送成功后的 runTombstoneGc 调用，返回实际清除条数 */
  async function gcTombstones(): Promise<number> {
    const { kept, purged } = gcTombstonesCore(toRaw(messages.value), new Date())
    if (purged === 0) return 0
    messages.value = kept
    await saveMessages()
    return purged
  }

  /** 活留言（剔除墓碑）：所有展示 / 筛选 / 计数一律走它 */
  const activeMessages = computed<MessageBoardMessage[]>(() => activeOnly(messages.value))
  /** 已删留言（墓碑，按删除时间倒序）：统一回收站用 */
  const trashedMessages = computed<MessageBoardMessage[]>(() => trashedItems(messages.value))
  /** 卡片排序：置顶优先 → 创建时间倒序 */
  const sortedMessages = computed<MessageBoardMessage[]>(() => sortMessages(activeMessages.value))

  /** 关键词筛选走纯逻辑核心，组件不内联过滤公式 */
  function searchMessages(keyword: string): MessageBoardMessage[] {
    return filterMessages(sortedMessages.value, keyword)
  }

  return {
    messages,
    activeMessages,
    trashedMessages,
    sortedMessages,
    searchMessages,
    loadMessages,
    saveMessages,
    addMessage,
    updateMessage,
    deleteMessage,
    restoreMessage,
    purgeMessage,
    togglePin,
    gcTombstones
  }
})

import { shallowRef, readonly } from 'vue'

// 模块级单例：博客后台「设置」弹框的打开状态与定位目标（仿 useAppSettingsDialog 模式，非 Pinia）。
// BlogEditor 等入口调用 openBlogSettings('wechat') 打开并定位到对应分区。

/** 博客设置弹框要定位的分区；null = 默认（博客设置） */
export type BlogSettingsSection = 'settings' | 'categories' | 'tags' | 'wechat'

const showBlogSettings = shallowRef(false)
const blogSettingsTarget = shallowRef<BlogSettingsSection | null>(null)

export function useBlogSettingsDialog() {
  /**
   * 打开博客设置弹框。
   * @param section 可选：指定要定位的分区（如 'wechat'），不传默认「博客设置」。
   */
  const openBlogSettings = (section?: BlogSettingsSection) => {
    blogSettingsTarget.value = section ?? null
    showBlogSettings.value = true
  }
  const closeBlogSettings = () => {
    showBlogSettings.value = false
    blogSettingsTarget.value = null
  }
  /** 消费并清空定位目标（设置弹框打开后调用一次即可，避免下次打开沿用旧目标） */
  const consumeBlogSettingsTarget = (): BlogSettingsSection | null => {
    const t = blogSettingsTarget.value
    blogSettingsTarget.value = null
    return t
  }

  return {
    showBlogSettings: readonly(showBlogSettings),
    blogSettingsTarget: readonly(blogSettingsTarget),
    openBlogSettings,
    closeBlogSettings,
    consumeBlogSettingsTarget
  }
}

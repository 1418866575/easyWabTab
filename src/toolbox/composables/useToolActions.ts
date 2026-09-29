/**
 * 复制 / 下载的组合式封装（站内工具通用）
 * 复制成功会标记「已保存」，避免关闭弹框时的二次确认误触发。
 */

import { useToast } from '@/composables/useToast'
import { markSaved } from '../prefs/useToolDirty'
import { downloadBlob, downloadText } from '../core/download'

export function useToolActions() {
  const toast = useToast()

  /** 复制文本到剪贴板（失败回落到隐藏 textarea） */
  async function copy(text: string, label = '已复制到剪贴板'): Promise<void> {
    if (!text) {
      toast.warning('没有可复制的内容')
      return
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
      } else {
        legacyCopy(text)
      }
      markSaved()
      toast.success(label)
    } catch {
      try {
        legacyCopy(text)
        markSaved()
        toast.success(label)
      } catch {
        toast.error('复制失败，请手动选择内容复制')
      }
    }
  }

  function legacyCopy(text: string): void {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    if (!ok) throw new Error('copy failed')
  }

  /** 下载文本 */
  function save(filename: string, text: string, mime?: string): void {
    if (!text) {
      toast.warning('没有可下载的内容')
      return
    }
    downloadText(filename, text, mime)
    markSaved()
    toast.success(`已下载 ${filename}`)
  }

  /** 下载 Blob */
  function saveBlob(filename: string, blob: Blob): void {
    downloadBlob(filename, blob)
    markSaved()
    toast.success(`已下载 ${filename}`)
  }

  return { copy, save, saveBlob }
}

/** 读取文件为文本 */
export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(fr.error || new Error('读取失败'))
    fr.readAsText(file)
  })
}

/** 读取图片文件为 HTMLImageElement */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

/** 读取文件为 ArrayBuffer */
export function readFileAsBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result as ArrayBuffer)
    fr.onerror = () => reject(fr.error || new Error('读取失败'))
    fr.readAsArrayBuffer(file)
  })
}

/** 读取文件为 dataURL */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => reject(fr.error || new Error('读取失败'))
    fr.readAsDataURL(file)
  })
}

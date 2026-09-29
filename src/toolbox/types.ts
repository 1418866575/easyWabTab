/**
 * 工具箱类型定义
 *
 * 设计要点：
 * - 工具元数据（ToolboxToolMeta）与工具实现（component）分离：列表页只依赖元数据，
 *   工具组件按需懒加载，新增工具不会增大首屏包体。
 * - 每个工具一个目录（tools/<id>/），目录内 index.ts 导出 ToolboxToolEntry。
 * - 所有工具均为站内自建或站内已有模块，严禁站外 URL（见 kind 说明）。
 */

import type { Component } from 'vue'

/** 工具状态：active 可打开；maintenance 维护中；coming 即将上线（均置灰不可点） */
export type ToolboxToolStatus = 'active' | 'maintenance' | 'coming'

/**
 * 工具形态：
 * - internal：站内自建工具（本站自己实现的功能，在站内工具面板打开）
 * - module：站内已有模块（走站内路由跳转，url 为站内相对路径）
 */
export type ToolboxToolKind = 'internal' | 'module'

/** 分类元数据 */
export interface ToolboxCategory {
  id: string
  name: string
  icon: string
  order?: number
}

/** 工具元数据：新增工具只需追加一条（或新增一个目录并导出） */
export interface ToolboxToolMeta {
  /** 唯一 id（kebab-case），收藏/最近使用以此为键 */
  id: string
  /** 名称（参与搜索） */
  name: string
  /** 图标：emoji 或项目 Icon 组件 name */
  icon: string
  /** 一句话描述（参与搜索） */
  description: string
  /** 主分类 id */
  category: string
  /** 标签（参与搜索） */
  tags: string[]
  status: ToolboxToolStatus
  kind: ToolboxToolKind
  /**
   * 站内路由，仅 kind: 'module' 使用（如 /workbench、/business）。
   * 站内自建工具不需要该字段 —— 严禁填写站外 URL。
   */
  url?: string
  /** 排序，缺省 999（按配置顺序） */
  order?: number
}

/**
 * 站内自建工具的组件加载器（懒加载）。
 * 写成 `() => import('./XxxTool.vue')` 即可，由面板侧 defineAsyncComponent 包装。
 */
export type ToolboxToolLoader = () => Promise<Component | { default: Component }>

/**
 * 工具条目：元数据 + 站内自建工具的实现组件（懒加载）。
 * kind: 'module' 的工具没有 component（复用站内既有页面）。
 */
export interface ToolboxToolEntry {
  meta: ToolboxToolMeta
  component?: ToolboxToolLoader
}

/** 收藏/最近使用的持久化结构 */
export interface ToolboxPrefs {
  favorites: string[]
  recent: ToolboxRecentItem[]
}

/** 最近使用记录 */
export interface ToolboxRecentItem {
  id: string
  ts: number
}

/** 高亮片段：避免 v-html，交给模板按 hit 渲染 <mark> */
export interface HighlightPart {
  text: string
  hit: boolean
}

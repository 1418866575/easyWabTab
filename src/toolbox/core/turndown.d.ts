/**
 * turndown 未自带 TS 类型，统一在此声明（仅覆盖本项目用法）。
 */
declare module 'turndown' {
  interface TurndownServiceOptions {
    headingStyle?: 'setext' | 'atx'
    hr?: string
    bulletListMarker?: string
    codeBlockStyle?: 'indented' | 'fenced'
    fence?: string
    emDelimiter?: string
    strongDelimiter?: string
    linkStyle?: 'inlined' | 'referenced'
    [key: string]: unknown
  }
  class TurndownService {
    constructor(options?: TurndownServiceOptions)
    turndown(input: string | HTMLElement): string
    use(plugin: unknown): TurndownService
    addRule(name: string, rule: unknown): TurndownService
    remove(node: unknown): TurndownService
  }
  export default TurndownService
}

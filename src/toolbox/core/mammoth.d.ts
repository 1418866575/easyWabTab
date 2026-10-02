declare module 'mammoth' {
  export interface MammothResult { value: string; messages: any[] }
  export interface MammothInput { arrayBuffer?: ArrayBuffer; buffer?: ArrayBuffer; path?: string }
  export function convertToHtml(input: MammothInput): Promise<MammothResult>
  export function extractRawText(input: MammothInput): Promise<MammothResult>
  const _default: { convertToHtml: typeof convertToHtml; extractRawText: typeof extractRawText }
  export default _default
}

/**
 * node-forge 未自带 TS 类型，统一在此声明为默认导出（any）。
 * 仅用于工具箱内加解密相关工具，类型宽松不影响运行。
 */
declare module 'node-forge' {
  const forge: any
  export default forge
}

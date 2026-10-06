<script setup lang="ts">
/**
 * PDF 转 Office（纯前端，pdfjs 提取文本 + jszip 构造 OOXML）
 * 文本版转换：Word/Excel/PowerPoint 仅含纯文本（无版式/样式/图片），适合文字型 PDF。
 * 直接构造最小可用 OOXML（zip），无需后端、零上传。扫描件无文本层时提示需 OCR。
 */
import { ref } from 'vue'
import * as pdfjsLib from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import JSZip from 'jszip'
import { downloadBlob, humanSize } from '../../core/download'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

const fileInput = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const pageCount = ref(0)
const baseName = ref('doc')
const originalSize = ref(0)
const format = ref<'docx' | 'xlsx' | 'pptx'>('docx')
const smartHeading = ref(true)

let lastFile: File | null = null

interface Line { text: string; size: number; bold: boolean }

function xmlEsc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

async function extractPages(file: File): Promise<Line[][]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjsLib.getDocument({ data: buf }).promise
  const pages: Line[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const arr = (tc.items as any[])
      .map((it) => ({
        str: (it.str || '') as string,
        x: it.transform[4] as number,
        y: it.transform[5] as number,
        size: (it.height as number) || Math.abs(it.transform[3]) || 10,
        bold: /bold/i.test(it.fontName || '')
      }))
      .filter((it) => it.str != null)
    arr.sort((a, b) => b.y - a.y || a.x - b.x)
    const lines: { items: typeof arr }[] = []
    for (const it of arr) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.items[0].y - it.y) <= Math.max(2, last.items[0].size * 0.4)) {
        last.items.push(it)
      } else {
        lines.push({ items: [it] })
      }
    }
    pages.push(
      lines.map((l) => {
        const text = l.items.map((i) => i.str).join('').replace(/\s+/g, ' ').trim()
        const size = l.items.reduce((s, i) => s + i.size, 0) / l.items.length
        const bold = l.items.length > 0 && l.items.every((i) => i.bold)
        return { text, size, bold }
      })
    )
  }
  return pages
}

function bodySize(pages: Line[][]): number {
  const freq = new Map<number, number>()
  for (const pg of pages) for (const l of pg) {
    const k = Math.round(l.size)
    freq.set(k, (freq.get(k) || 0) + 1)
  }
  let best = 10
  let bestC = 0
  for (const [k, c] of freq) if (c > bestC) { bestC = c; best = k }
  return best
}

// ---------- DOCX ----------
async function buildDocx(pages: Line[][], smart: boolean): Promise<Blob> {
  const body = bodySize(pages)
  const paras: string[] = []
  const pushP = (text: string, style?: string, bold?: boolean) => {
    const rPr = bold ? '<w:rPr><w:b/></w:rPr>' : ''
    const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''
    paras.push(`<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`)
  }
  for (const pg of pages) {
    for (const l of pg) {
      if (!l.text) { paras.push('<w:p/>'); continue }
      if (smart && !/^\s*([-*+]|\d+[.)])\s+/.test(l.text)) {
        const r = l.size / body
        if (r >= 1.7) { pushP(l.text, 'Heading1', l.bold); continue }
        if (r >= 1.35) { pushP(l.text, 'Heading2', l.bold); continue }
        if (r >= 1.15) { pushP(l.text, 'Heading3', l.bold); continue }
      }
      pushP(l.text, undefined, l.bold)
    }
  }
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join('')}<w:sectPr/></w:body></w:document>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault/><w:pPrDefault/></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:sz w:val="32"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:sz w:val="26"/></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:sz w:val="22"/></w:style></w:styles>`
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PDF 转 Word</dc:title><dc:creator>easy-web-tab</dc:creator></cp:coreProperties>`
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>easy-web-tab</Application></Properties>`
  return zipBlob({
    '[Content_Types].xml': ct,
    '_rels/.rels': rootRels,
    'word/document.xml': document,
    'word/styles.xml': styles,
    'word/_rels/document.xml.rels': docRels,
    'docProps/core.xml': core,
    'docProps/app.xml': app
  })
}

// ---------- XLSX ----------
async function buildXlsx(pages: Line[][]): Promise<Blob> {
  const rows: string[] = []
  let r = 0
  for (const pg of pages) {
    for (const l of pg) {
      r++
      const cell = l.text
        ? `<c r="A${r}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(l.text)}</t></is></c>`
        : `<c r="A${r}"/>`
      rows.push(`<row r="${r}">${cell}</row>`)
    }
  }
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="PDF文本" sheetId="1" r:id="rId1"/></sheets></workbook>`
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PDF 转 Excel</dc:title><dc:creator>easy-web-tab</dc:creator></cp:coreProperties>`
  const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>easy-web-tab</Application></Properties>`
  return zipBlob({
    '[Content_Types].xml': ct,
    '_rels/.rels': rootRels,
    'xl/workbook.xml': workbook,
    'xl/_rels/workbook.xml.rels': wbRels,
    'xl/worksheets/sheet1.xml': sheet,
    'docProps/core.xml': core,
    'docProps/app.xml': app
  })
}

// ---------- PPTX ----------
async function buildPptx(pages: Line[][]): Promise<Blob> {
  const N = pages.length
  const W = 'http://schemas.openxmlformats.org/presentationml/2006/main'
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
  const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'

  const slideXml = (idx: number, lines: Line[]) => {
    const bodyPs = lines
      .map((l) => (l.text ? `<a:p><a:r><a:t xml:space="preserve">${xmlEsc(l.text)}</a:t></a:r></a:p>` : '<a:p/>'))
      .join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="${W}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr><p:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t xml:space="preserve">第 ${idx} 页</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Body"/><p:cNvSpPr><p:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${bodyPs}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  }

  // content types
  const ctOverrides = pages
    .map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join('')
  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${ctOverrides}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`

  // root rels
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="${PKG}/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/></Relationships>`

  // presentation.xml
  const sldIds = pages
    .map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`)
    .join('')
  const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="${W}" xmlns:r="${R}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`

  // presentation rels: rId1=master, rId2..rId{1+N}=slides, then theme/app/core
  const slideRels = pages
    .map((_, i) => `<Relationship Id="rId${i + 2}" Type="${R}/slide" Target="slides/slide${i + 1}.xml"/>`)
    .join('')
  const presRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRels}<Relationship Id="rId${2 + N}" Type="${R}/theme" Target="theme/theme1.xml"/><Relationship Id="rId${3 + N}" Type="${R}/extended-properties" Target="docProps/app.xml"/><Relationship Id="rId${4 + N}" Type="${PKG}/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`

  // slideMaster
  const master = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldMaster xmlns:p="${W}" xmlns:a="${A}" xmlns:r="${R}"><p:cSld><p:bg/><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`
  const masterRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${R}/theme" Target="../theme/theme1.xml"/></Relationships>`

  // slideLayout
  const layout = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sldLayout xmlns:p="${W}" xmlns:a="${A}" xmlns:r="${R}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
  const layoutRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${R}/slideMaster" Target="../slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${R}/theme" Target="../theme/theme1.xml"/></Relationships>`

  // theme
  const theme = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="${A}" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>`

  const files: Record<string, string> = {
    '[Content_Types].xml': ct,
    '_rels/.rels': rootRels,
    'ppt/presentation.xml': presentation,
    'ppt/_rels/presentation.xml.rels': presRels,
    'ppt/slideMasters/slideMaster1.xml': master,
    'ppt/slideMasters/_rels/slideMaster1.xml.rels': masterRels,
    'ppt/slideLayouts/slideLayout1.xml': layout,
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels': layoutRels,
    'ppt/theme/theme1.xml': theme,
    'docProps/core.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>PDF 转 PPT</dc:title><dc:creator>easy-web-tab</dc:creator></cp:coreProperties>`,
    'docProps/app.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>easy-web-tab</Application></Properties>`
  }
  pages.forEach((pg, i) => {
    files[`ppt/slides/slide${i + 1}.xml`] = slideXml(i + 1, pg)
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${R}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`
  })
  return zipBlob(files)
}

async function zipBlob(files: Record<string, string>): Promise<Blob> {
  const zip = new JSZip()
  for (const [path, content] of Object.entries(files)) zip.file(path, content)
  return zip.generateAsync({ type: 'blob', mimeType: 'application/octet-stream' })
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  errorMsg.value = ''
  infoMsg.value = ''
  lastFile = f
  baseName.value = f.name.replace(/\.pdf$/i, '')
  originalSize.value = f.size
  pageCount.value = 0
  try {
    const buf = new Uint8Array(await f.arrayBuffer())
    const probe = await pdfjsLib.getDocument({ data: buf }).promise
    pageCount.value = probe.numPages
    await probe.destroy()
  } catch (err) {
    errorMsg.value = '解析失败：' + (err as Error).message
  } finally {
    ;(e.target as HTMLInputElement).value = ''
  }
}

async function convert() {
  if (!lastFile) {
    errorMsg.value = '请先选择 PDF 文件'
    return
  }
  busy.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    const pages = await extractPages(lastFile)
    if (pages.flat().length === 0) {
      infoMsg.value = '未提取到文本层（可能是扫描件/图片型 PDF），需要 OCR 工具才能转写。'
      return
    }
    let blob: Blob
    let ext: string
    if (format.value === 'docx') {
      blob = await buildDocx(pages, smartHeading.value)
      ext = 'docx'
    } else if (format.value === 'xlsx') {
      blob = await buildXlsx(pages)
      ext = 'xlsx'
    } else {
      blob = await buildPptx(pages)
      ext = 'pptx'
    }
    downloadBlob(`${baseName.value}.${ext}`, blob)
    infoMsg.value = `转换完成：${pageCount.value} 页文本 → ${ext.toUpperCase()}（纯文本版，不含版式/样式/图片）。`
  } catch (err) {
    errorMsg.value = '转换失败：' + (err as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="tu-t2">
    <div class="tu-t1">
      <div class="tu-field">
        <label class="tu-label">选择 PDF</label>
        <input ref="fileInput" type="file" accept="application/pdf" hidden @change="onFile" />
        <button class="tu-btn" :disabled="busy" @click="fileInput?.click()">选择 PDF</button>
        <span v-if="pageCount" class="tu-hint" style="margin-left: 8px">共 {{ pageCount }} 页</span>
      </div>
      <div class="tu-field">
        <label class="tu-label">目标格式</label>
        <div class="tu-seg">
          <button :class="{ 'is-on': format === 'docx' }" @click="format = 'docx'">Word (.docx)</button>
          <button :class="{ 'is-on': format === 'xlsx' }" @click="format = 'xlsx'">Excel (.xlsx)</button>
          <button :class="{ 'is-on': format === 'pptx' }" @click="format = 'pptx'">PPT (.pptx)</button>
        </div>
      </div>
      <div v-if="format === 'docx'" class="tu-row">
        <label class="tu-check" :class="{ 'is-on': smartHeading }">
          <input type="checkbox" v-model="smartHeading" /> 智能标题（按字号映射为 Word 标题样式）
        </label>
      </div>
      <button type="button" class="tu-btn" :disabled="busy || !lastFile" @click="convert">
        {{ busy ? '转换中…' : '转换并下载' }}
      </button>
      <p v-if="errorMsg" class="tu-alert">{{ errorMsg }}</p>
      <p v-if="infoMsg" class="tu-alert ok">{{ infoMsg }}</p>
      <p class="tu-hint">纯前端构造 OOXML：仅提取文本层，丢失表格/图片/精确版式/字体样式。复杂排版的还原需专用转换引擎（规划中）。</p>
    </div>
    <div class="tu-t1">
      <div class="tu-preview">
        <p><strong>转换说明</strong></p>
        <ul style="margin: 6px 0 0 18px; line-height: 1.8">
          <li><strong>Word</strong>：每段文字一行；开启智能标题时按字号推断标题层级。</li>
          <li><strong>Excel</strong>：每行文本写入 A 列一行，按页连续。</li>
          <li><strong>PPT</strong>：每页 PDF 生成一页幻灯片（标题“第 N 页”+ 正文文本）。</li>
        </ul>
        <p class="tu-hint" style="margin-top: 10px">原文件 {{ originalSize ? humanSize(originalSize) : '—' }}</p>
      </div>
    </div>
  </div>
</template>

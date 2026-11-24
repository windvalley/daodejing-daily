/**
 * 问道回答的最小 Markdown 解析。
 *
 * 模型即使被要求写纯文本，也常把 `###` 标题、`**粗体**`、`*` 列表一起吐出来，
 * 这些符号原样显示在气泡里会盖过正文。这里只解析读回答时真正会遇到的那几类，
 * 输出数据结构交给 React 渲染，而不是拼 HTML 字符串：
 * 模型返回内容里的标签只会成为文本，不会被当成元素执行。
 *
 * 支持的范围刻意压得很小：
 * - 块级：段落、ATX 标题、无序与有序列表（嵌套保留）、引用、围栏代码块、分隔线。
 * - 行内：`**粗体**`、`*斜体*`、反引号代码、反斜杠转义。
 *
 * 不做表格、图片、脚注与原始 HTML。链接不渲染成可点标签，统一写成「文字（地址）」：
 * 面板在 APK 里是 WebView，可点外链会把读者带离当前页，这里先保住来源信息。
 */

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: InlineNode[] }
  | { type: 'em'; children: InlineNode[] }
  | { type: 'code'; text: string }

export interface ListItem {
  content: InlineNode[]
  children: BlockNode[]
}

export type BlockNode =
  | { type: 'paragraph'; content: InlineNode[] }
  | { type: 'heading'; level: number; content: InlineNode[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'quote'; blocks: BlockNode[] }
  | { type: 'code'; text: string }
  | { type: 'rule' }

const FENCE = /^ {0,3}(`{3,}|~{3,})/
const HEADING = /^ {0,3}(#{1,6})(?:\s+|$)(.*)$/
const RULE = /^ {0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/
const QUOTE = /^ {0,3}>\s?(.*)$/
const UL_ITEM = /^(\s*)[-*+]\s+(.*)$/
const OL_ITEM = /^(\s*)(\d{1,9})[.)]\s+(.*)$/

interface ListMarker {
  ordered: boolean
  /** 行首空格数，用来判断这一行是不是上一项的子内容 */
  indent: number
  content: string
  /** 有序列表的起始序号 */
  start: number
}

function matchListItem(line: string): ListMarker | null {
  const unordered = UL_ITEM.exec(line)
  if (unordered) return { ordered: false, indent: unordered[1].length, content: unordered[2], start: 1 }
  const ordered = OL_ITEM.exec(line)
  if (ordered) return { ordered: true, indent: ordered[1].length, content: ordered[3], start: Number(ordered[2]) }
  return null
}

/** 去掉标题末尾用于收口的 #，`## 标题 ##` 是合法写法 */
function headingText(raw: string): string {
  return raw.replace(/\s+#+\s*$/, '').trim()
}

/**
 * 软换行合并。
 * 中文之间不加空格，英文单词之间加，否则折行的英文会粘成一个词。
 */
function joinLines(lines: string[]): string {
  return lines.reduce((text, line) => {
    const piece = line.trim()
    if (!text) return piece
    if (/[A-Za-z0-9]$/.test(text) && /^[A-Za-z0-9]/.test(piece)) return `${text} ${piece}`
    return text + piece
  }, '')
}

function isBlank(line: string): boolean {
  return line.trim() === ''
}

function leadingSpaces(line: string): number {
  return line.length - line.trimStart().length
}

/** 去掉一组行共有的缩进，嵌套内容递归解析时按自己的基准重新计缩进 */
function dedent(lines: string[]): string[] {
  const indents = lines.filter((line) => !isBlank(line)).map(leadingSpaces)
  if (!indents.length) return lines
  const min = Math.min(...indents)
  return lines.map((line) => line.slice(Math.min(min, leadingSpaces(line))))
}

/** 判断这一行会不会开启新的块：段落遇到它们要收口，不能吞进同一段 */
function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    UL_ITEM.test(line) ||
    OL_ITEM.test(line)
  )
}

/** 反斜杠转义：Markdown 里 `\*` 表示字面量星号 */
const ESCAPABLE = new Set(['\\', '`', '*', '_', '[', ']', '(', ')', '#', '+', '-', '.', '!', '>', '~', '|'])

function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let buffer = ''
  let index = 0

  const flush = () => {
    if (buffer) {
      nodes.push({ type: 'text', text: buffer })
      buffer = ''
    }
  }

  while (index < text.length) {
    const char = text[index]

    if (char === '\\' && index + 1 < text.length && ESCAPABLE.has(text[index + 1])) {
      buffer += text[index + 1]
      index += 2
      continue
    }

    if (char === '`') {
      let run = 1
      while (text[index + run] === '`') run += 1
      const fence = '`'.repeat(run)
      const close = text.indexOf(fence, index + run)
      // 没有闭合的反引号只是普通字符，流式生成中途不会把后面整段吞成代码
      if (close > index + run) {
        flush()
        nodes.push({ type: 'code', text: text.slice(index + run, close) })
        index = close + run
        continue
      }
      buffer += fence
      index += run
      continue
    }

    if (char === '*') {
      // `***粗斜体***` 先按三层收口，否则会被拆成粗体加两个落单星号
      if (text.startsWith('***', index)) {
        const triple = text.indexOf('***', index + 3)
        if (triple > index + 3) {
          flush()
          nodes.push({
            type: 'strong',
            children: [{ type: 'em', children: parseInline(text.slice(index + 3, triple)) }],
          })
          index = triple + 3
          continue
        }
      }
      const marker = text[index + 1] === '*' ? '**' : '*'
      const close = text.indexOf(marker, index + marker.length)
      if (close > index + marker.length) {
        flush()
        const children = parseInline(text.slice(index + marker.length, close))
        nodes.push({ type: marker === '**' ? 'strong' : 'em', children })
        index = close + marker.length
        continue
      }
      // 未闭合按字面量显示：把后半段整体加粗会让读者看到中途突然变形
      buffer += marker
      index += marker.length
      continue
    }

    if (char === '[') {
      const link = /^\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/.exec(text.slice(index))
      if (link) {
        flush()
        // 不生成 a 标签：APK 里点外链会离开应用，来源信息用文字保留
        nodes.push({ type: 'text', text: `${link[1]}（${link[2]}）` })
        index += link[0].length
        continue
      }
    }

    buffer += char
    index += 1
  }

  flush()
  return nodes
}

/**
 * 一项列表。
 * 列表项自己的文字与缩进更深的子内容先一起收进 body，再交给 parseBlocks 递归：
 * 子列表、子引用、子代码块因此不需要各自单独写一套缩进规则。
 */
function buildItem(body: string[]): ListItem {
  const [first, ...rest] = body
  const blocks = parseBlocks([first, ...dedent(rest)].join('\n'))
  const [head, ...tail] = blocks
  // 项首永远是文字：`- **粗体**：说明` 这种写法解析出来是一段
  if (head && head.type === 'paragraph') return { content: head.content, children: tail }
  return { content: [], children: blocks }
}

/** 空行之后紧跟同级同类列表项时，这项仍属于同一个列表：模型常在要点之间空一行 */
function continuesList(lines: string[], from: number, ordered: boolean, indent: number): boolean {
  let index = from
  while (index < lines.length && isBlank(lines[index])) index += 1
  if (index >= lines.length) return false
  const marker = matchListItem(lines[index])
  if (!marker) return false
  return marker.ordered === ordered && marker.indent === indent
}

/** 列表的结束条件是缩进回到当前层、换了列表类型，或者遇到顶格的普通段落与终止空行 */
function parseList(lines: string[], startIndex: number, first: ListMarker): { block: BlockNode; next: number } {
  const { ordered, indent: rootIndent } = first
  const bodies: string[][] = []
  let start = first.start
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    if (isBlank(line)) {
      if (!continuesList(lines, index, ordered, rootIndent)) break
      index += 1
      continue
    }
    const marker = matchListItem(line)
    if (marker) {
      if (marker.indent < rootIndent) break
      if (marker.indent === rootIndent) {
        if (marker.ordered !== ordered) break
        if (!bodies.length) start = marker.start
        bodies.push([marker.content])
      } else {
        if (!bodies.length) break
        bodies[bodies.length - 1].push(line)
      }
      index += 1
      continue
    }
    // 顶格的行是列表之后的段落；缩进的行算当前项的子内容
    if (!bodies.length || leadingSpaces(line) <= rootIndent) break
    bodies[bodies.length - 1].push(line)
    index += 1
  }

  return { block: { type: 'list', ordered, start, items: bodies.map(buildItem) }, next: index }
}

function parseBlocks(source: string): BlockNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: BlockNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (isBlank(line)) {
      index += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1]
      const indent = line.indexOf(marker)
      const body: string[] = []
      index += 1
      while (index < lines.length) {
        const closing = lines[index]
        if (closing.trim().startsWith(marker[0].repeat(marker.length)) && /^\s*[`~]+\s*$/.test(closing)) {
          index += 1
          break
        }
        // 去掉与围栏同宽的缩进，模型在列表里嵌代码块时会多带空格
        body.push(indent ? closing.slice(Math.min(indent, closing.length)) : closing)
        index += 1
      }
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, content: parseInline(headingText(heading[2])) })
      index += 1
      continue
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' })
      index += 1
      continue
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = []
      while (index < lines.length) {
        const match = QUOTE.exec(lines[index])
        if (!match) break
        quoted.push(match[1])
        index += 1
      }
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted.join('\n')) })
      continue
    }

    const marker = matchListItem(line)
    if (marker) {
      const parsed = parseList(lines, index, marker)
      blocks.push(parsed.block)
      index = parsed.next
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && !isBlank(lines[index]) && (paragraph.length === 0 || !startsBlock(lines[index]))) {
      paragraph.push(lines[index])
      index += 1
    }
    blocks.push({ type: 'paragraph', content: parseInline(joinLines(paragraph)) })
  }

  return blocks
}

/** 解析一段回答。返回的节点可直接渲染，不需要再转 HTML */
export function parseMarkdown(source: string): BlockNode[] {
  if (!source.trim()) return []
  return parseBlocks(source)
}

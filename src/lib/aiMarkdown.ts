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
 * 单换行按硬换行保留（渲染成 `<br>`），只有空行才分段。
 * 早先的纯文本版本靠 `white-space: pre-wrap` 保留换行，解析时若把单换行合并成一段，
 * 模型用「1、2、3、」或 `•` 这类非 ASCII 编号写的要点会被并成一整行，比原样显示还难读。
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

/**
 * 嵌套解析的深度上限。
 * 引用与列表都是递归解析的，`'>'.repeat(2000)` 这种输入会把调用栈打爆；
 * 异常发生在 render 里，而全站没有 error boundary，抛出去就是整页白屏。
 * 超过上限的内容按普通段落收下，宁可少排版也不让页面挂掉。
 */
const MAX_DEPTH = 8

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

/**
 * 找强调的闭合标记。
 *
 * 闭合标记前一个字符不能是空白，否则「3 * 5 遍，坚持 2 * 7 天」会被读成一段斜体：
 * 这里的星号是乘号，不是强调。CommonMark 的对侧空白规则同理。
 */
function findClose(text: string, from: number, marker: string): number {
  let index = text.indexOf(marker, from)
  while (index >= 0) {
    const previous = text[index - 1]
    if (previous !== undefined && !/\s/.test(previous)) return index
    index = text.indexOf(marker, index + 1)
  }
  return -1
}

function parseInline(text: string, depth = 0): InlineNode[] {
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
        const triple = findClose(text, index + 3, '***')
        if (triple > index && !/\s/.test(text[index + 3] ?? ' ')) {
          flush()
          nodes.push({
            type: 'strong',
            children: [{ type: 'em', children: parseInline(text.slice(index + 3, triple), depth + 1) }],
          })
          index = triple + 3
          continue
        }
      }
      const marker = text[index + 1] === '*' ? '**' : '*'
      const next = text[index + marker.length]
      // 开符后面紧跟空白就不是强调：「3 * 5」里的星号按字面量留下
      if (next !== undefined && !/\s/.test(next)) {
        const close = findClose(text, index + marker.length, marker)
        if (close > index + marker.length) {
          flush()
          const children = parseInline(text.slice(index + marker.length, close), depth + 1)
          nodes.push({ type: marker === '**' ? 'strong' : 'em', children })
          index = close + marker.length
          continue
        }
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
 * 行内标记剥成纯文字。
 * 引用核查要拿模型引号里的原话去原文里比对，`「**上善若水**」` 里的星号是排版不是内容；
 * 不剥掉会把这句真实存在的原文判成「未在书中找到」。
 */
export function stripInlineMarks(text: string): string {
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
}

/** 一项列表。项自己的文字与缩进更深的子内容先一起收进 body，再交给 parseBlocks 递归 */
function buildItem(body: string[], depth: number): ListItem {
  const [first, ...rest] = body
  const blocks = parseBlocks([first, ...dedent(rest)].join('\n'), depth + 1)
  const [head, ...tail] = blocks
  // 项首永远是文字：`- **粗体**：说明` 这种写法解析出来是一段
  if (head && head.type === 'paragraph') return { content: head.content, children: tail }
  return { content: [], children: blocks }
}

/** 空行之后紧跟列表项时，这项仍属于同一个列表：模型常在要点之间空一行 */
function resumesList(lines: string[], from: number, ordered: boolean, indent: number): number {
  let index = from
  while (index < lines.length && isBlank(lines[index])) index += 1
  const marker = index < lines.length ? matchListItem(lines[index]) : null
  if (!marker) return -1
  // 缩进更深的是当前项的子列表，换不换类型都算；同级则必须同类型
  if (marker.indent > indent) return index
  if (marker.indent === indent && marker.ordered === ordered) return index
  return -1
}

/** 列表的结束条件是缩进回到当前层、换了列表类型，或者遇到顶格的普通段落与终止空行 */
function parseList(
  lines: string[],
  startIndex: number,
  first: ListMarker,
  depth: number,
): { block: BlockNode; next: number } {
  const { ordered, indent: rootIndent } = first
  const bodies: string[][] = []
  let start = first.start
  let index = startIndex

  while (index < lines.length) {
    const line = lines[index]
    if (isBlank(line)) {
      const resumed = resumesList(lines, index, ordered, rootIndent)
      if (resumed < 0) break
      index = resumed
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

  return {
    block: { type: 'list', ordered, start, items: bodies.map((body) => buildItem(body, depth)) },
    next: index,
  }
}

function parseBlocks(source: string, depth = 0): BlockNode[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: BlockNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    if (isBlank(line)) {
      index += 1
      continue
    }

    // 超深嵌套不再递归：整段当文字收下，避免调用栈溢出
    if (depth >= MAX_DEPTH) {
      blocks.push({ type: 'paragraph', content: [{ type: 'text', text: lines.slice(index).join('\n') }] })
      break
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
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted.join('\n'), depth + 1) })
      continue
    }

    const marker = matchListItem(line)
    if (marker) {
      const parsed = parseList(lines, index, marker, depth)
      blocks.push(parsed.block)
      index = parsed.next
      continue
    }

    const paragraph: string[] = []
    while (index < lines.length && !isBlank(lines[index]) && (paragraph.length === 0 || !startsBlock(lines[index]))) {
      paragraph.push(lines[index].trimEnd())
      index += 1
    }
    blocks.push({ type: 'paragraph', content: parseInline(paragraph.join('\n')) })
  }

  return blocks
}

/** 解析一段回答。返回的节点可直接渲染，不需要再转 HTML */
export function parseMarkdown(source: string): BlockNode[] {
  if (!source.trim()) return []
  return parseBlocks(source)
}

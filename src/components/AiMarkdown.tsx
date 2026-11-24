import { Fragment, useMemo, type ReactNode } from 'react'
import { parseMarkdown, type BlockNode, type InlineNode, type ListItem } from '../lib/aiMarkdown'

/**
 * 回答的排版渲染。
 *
 * 解析放在纯函数 `aiMarkdown.ts` 里，这里只负责把节点变成元素。
 * 不用 dangerouslySetInnerHTML：回答是模型生成的，一旦当 HTML 拼进页面，
 * 模型被诱导或服务被换掉都可能直接改写界面。
 */

const CARET = <span key="ai-caret" className="ai-caret" aria-hidden="true" />

/**
 * 文本节点里的换行渲染成 `<br>`。
 * 解析层保留单换行、不做软换行合并，这里负责把它显示出来。
 */
function withBreaks(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split('\n')
  if (parts.length === 1) return [text]
  const nodes: ReactNode[] = []
  parts.forEach((part, index) => {
    if (index > 0) nodes.push(<br key={`${keyPrefix}-br-${index}`} />)
    if (part) nodes.push(part)
  })
  return nodes
}

/**
 * 行内节点。
 * caret 表示流式光标挂在这一段的末尾，必须是行内元素：
 * 另起一个块会和正文隔开一行，读起来像回答已经换段。
 */
function inline(nodes: InlineNode[], caret = false, keyPrefix = 'i'): ReactNode[] {
  const rendered = nodes.map((node, index) => {
    if (node.type === 'text') return withBreaks(node.text, `${keyPrefix}-${index}`)
    if (node.type === 'code') return <code key={`${keyPrefix}-${index}`}>{node.text}</code>
    const children = inline(node.children, false, `${keyPrefix}-${index}`)
    return node.type === 'strong' ? (
      <strong key={`${keyPrefix}-${index}`}>{children}</strong>
    ) : (
      <em key={`${keyPrefix}-${index}`}>{children}</em>
    )
  })
  if (caret) rendered.push(CARET)
  return rendered
}

/** `#` 落到 h3 起步：面板标题本身不是标题元素，回答里再出现 h1 会打乱层级 */
function headingTag(level: number): 'h3' | 'h4' | 'h5' | 'h6' {
  const mapped = Math.min(level + 2, 6)
  return `h${mapped}` as 'h3' | 'h4' | 'h5' | 'h6'
}

/**
 * 列表项。
 * 子块直接渲染在 `<li>` 里，不再套一层 `<ul>/<ol>`：
 * 子块自身可能是列表、段落或引用，包一层列表会得到 `ul > ul`、`ul > p` 这种非法结构，
 * 读屏会把外层当成空列表，缩进也会每层多出一段。`li` 本来就允许流式内容。
 */
function listItems(items: ListItem[], caret: boolean, keyPrefix: string): ReactNode[] {
  return items.map((item, index) => {
    const last = caret && index === items.length - 1
    const children = item.children
    return (
      <li key={`${keyPrefix}-${index}`}>
        {inline(item.content, last && children.length === 0, `${keyPrefix}-${index}`)}
        {children.map((child, childIndex) =>
          block(child, `${keyPrefix}-${index}-${childIndex}`, last && childIndex === children.length - 1),
        )}
      </li>
    )
  })
}

/** caret 只在最后一块里出现一次，所以整棵树只有最末一条路径带它 */
function block(node: BlockNode, key: string, caret = false): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{inline(node.content, caret, key)}</p>
    case 'heading': {
      const Tag = headingTag(node.level)
      return <Tag key={key}>{inline(node.content, caret, key)}</Tag>
    }
    case 'list':
      return node.ordered ? (
        <ol key={key} start={node.start > 1 ? node.start : undefined}>
          {listItems(node.items, caret, key)}
        </ol>
      ) : (
        <ul key={key}>{listItems(node.items, caret, key)}</ul>
      )
    case 'quote':
      return (
        <blockquote key={key}>
          {node.blocks.map((child, index) =>
            block(child, `${key}-${index}`, caret && index === node.blocks.length - 1),
          )}
        </blockquote>
      )
    case 'code':
      return (
        <pre key={key}>
          <code>
            {node.text}
            {caret ? CARET : null}
          </code>
        </pre>
      )
    case 'rule':
      return (
        <Fragment key={key}>
          <hr />
          {caret ? CARET : null}
        </Fragment>
      )
  }
}

export function AiMarkdown({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const blocks = useMemo(() => parseMarkdown(content), [content])
  // 只有一个换行或只有 `>` 时解析不出块，光标不能跟着消失
  const fallbackCaret = streaming && blocks.length === 0
  return (
    <div className="ai-markdown">
      {fallbackCaret ? CARET : null}
      {blocks.map((node, index) => block(node, `b${index}`, streaming && index === blocks.length - 1))}
    </div>
  )
}

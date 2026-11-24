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
 * 行内节点。
 * caret 表示流式光标挂在这一段的末尾，必须是行内元素：
 * 另起一个块会和正文隔开一行，读起来像回答已经换段。
 */
function inline(nodes: InlineNode[], caret = false): ReactNode[] {
  const rendered = nodes.map((node, index) => {
    if (node.type === 'text') return node.text
    if (node.type === 'code') return <code key={index}>{node.text}</code>
    const children = inline(node.children)
    return node.type === 'strong' ? <strong key={index}>{children}</strong> : <em key={index}>{children}</em>
  })
  if (caret) rendered.push(CARET)
  return rendered
}

/** `#` 落到 h3 起步：面板标题本身不是标题元素，回答里再出现 h1 会打乱层级 */
function headingTag(level: number): 'h3' | 'h4' | 'h5' | 'h6' {
  const mapped = Math.min(level + 2, 6)
  return `h${mapped}` as 'h3' | 'h4' | 'h5' | 'h6'
}

function listItems(items: ListItem[], ordered: boolean, caret = false): ReactNode[] {
  const NestedList = ordered ? 'ol' : 'ul'
  return items.map((item, index) => {
    const last = caret && index === items.length - 1
    return (
      <li key={index}>
        {inline(item.content, last && !item.children.length)}
        {item.children.length ? (
          <NestedList>{item.children.map((child, childIndex) => block(child, childIndex, last))}</NestedList>
        ) : null}
      </li>
    )
  })
}

/** caret 只在最后一块里出现一次，所以整棵树只有最末一条路径带它 */
function block(node: BlockNode, key: number, caret = false): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{inline(node.content, caret)}</p>
    case 'heading': {
      const Tag = headingTag(node.level)
      return <Tag key={key}>{inline(node.content, caret)}</Tag>
    }
    case 'list':
      return node.ordered ? (
        <ol key={key} start={node.start > 1 ? node.start : undefined}>
          {listItems(node.items, true, caret)}
        </ol>
      ) : (
        <ul key={key}>{listItems(node.items, false, caret)}</ul>
      )
    case 'quote':
      return (
        <blockquote key={key}>
          {node.blocks.map((child, index) => block(child, index, caret && index === node.blocks.length - 1))}
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
  return (
    <div className="ai-markdown">
      {blocks.map((node, index) => block(node, index, streaming && index === blocks.length - 1))}
    </div>
  )
}

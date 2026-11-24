import { describe, expect, it } from 'vitest'
import { parseMarkdown, type BlockNode } from './aiMarkdown'

/** 单段纯文本的快捷断言：解析出来的内容应该原样是一段文字 */
function paragraph(text: string): BlockNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] }
}

describe('段落', () => {
  it('普通回答仍然是一段，与纯文本时代一致', () => {
    expect(parseMarkdown('第8章讲水，利万物而不争。')).toEqual([paragraph('第8章讲水，利万物而不争。')])
  })

  it('软换行合并成一段，中文之间不留空格', () => {
    expect(parseMarkdown('第一行中文\n第二行中文')).toEqual([paragraph('第一行中文第二行中文')])
  })

  it('英文软换行补空格，两个单词不会被粘成一串', () => {
    expect(parseMarkdown('hello\nworld')).toEqual([paragraph('hello world')])
  })

  it('空回答不产生空段落', () => {
    expect(parseMarkdown('')).toEqual([])
    expect(parseMarkdown('  \n\n ')).toEqual([])
  })

  it('段落与后面的列表分开，不会被吞进同一段', () => {
    const blocks = parseMarkdown('先看这几条：\n- 第一条\n- 第二条')
    expect(blocks.map((block) => block.type)).toEqual(['paragraph', 'list'])
  })
})

describe('标题', () => {
  it('### 是三级标题，符号不进正文', () => {
    expect(parseMarkdown('### 支持背诵的理由')).toEqual([
      { type: 'heading', level: 3, content: [{ type: 'text', text: '支持背诵的理由' }] },
    ])
  })

  it('标题开头连续的 # 决定层级，末尾收口的 # 去掉', () => {
    expect(parseMarkdown('## 标题 ##')).toEqual([
      { type: 'heading', level: 2, content: [{ type: 'text', text: '标题' }] },
    ])
    expect(parseMarkdown('###### 小标题')).toEqual([
      { type: 'heading', level: 6, content: [{ type: 'text', text: '小标题' }] },
    ])
  })
})

describe('列表', () => {
  it('星号列表识别成无序列表，项里的粗体保留', () => {
    const blocks = parseMarkdown('* **强化摄心与专注**：背诵要求心无杂念。\n* 深入理解经文。')
    expect(blocks).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          {
            content: [
              { type: 'strong', children: [{ type: 'text', text: '强化摄心与专注' }] },
              { type: 'text', text: '：背诵要求心无杂念。' },
            ],
            children: [],
          },
          { content: [{ type: 'text', text: '深入理解经文。' }], children: [] },
        ],
      },
    ])
  })

  it('要点之间的空行不会把列表切成两段', () => {
    const blocks = parseMarkdown('* 第一条\n\n* 第二条\n\n* 第三条')
    expect(blocks).toHaveLength(1)
    const list = blocks[0]
    if (list.type !== 'list') throw new Error('应当解析成列表')
    expect(list.items).toHaveLength(3)
  })

  it('列表之后隔一个空行的普通段落仍是独立段落', () => {
    const blocks = parseMarkdown('- 第一条\n\n这一段是列表之后的说明。')
    expect(blocks.map((block) => block.type)).toEqual(['list', 'paragraph'])
  })

  it('有序列表记住起始序号，不总是从 1 开始', () => {
    const blocks = parseMarkdown('3. 第三步\n4. 第四步')
    expect(blocks[0]).toMatchObject({ type: 'list', ordered: true, start: 3 })
  })

  it('缩进的项挂到上一项下面，不会拍平成同一层', () => {
    const blocks = parseMarkdown('- 一\n  - 一之一\n  - 一之二\n- 二')
    const list = blocks[0]
    if (list.type !== 'list') throw new Error('应当解析成列表')
    expect(list.items).toHaveLength(2)
    expect(list.items[0].children).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          { content: [{ type: 'text', text: '一之一' }], children: [] },
          { content: [{ type: 'text', text: '一之二' }], children: [] },
        ],
      },
    ])
    expect(list.items[1].children).toHaveLength(0)
  })

  it('有序列表里嵌无序列表时两种列表都保留', () => {
    const blocks = parseMarkdown('1. 先做这件事。\n   - 子项甲\n   - 子项乙\n2. 再做那件事。')
    const list = blocks[0]
    if (list.type !== 'list') throw new Error('应当解析成列表')
    expect(list.items).toHaveLength(2)
    expect(list.items[0].children[0]).toMatchObject({ type: 'list', ordered: false })
    expect(list.items[1].content).toEqual([{ type: 'text', text: '再做那件事。' }])
  })

  it('列表项的续行并进上一项，而不是另起一段', () => {
    const blocks = parseMarkdown('- **第一项**：前半句\n  后半句接着写。\n- 第二项')
    const list = blocks[0]
    if (list.type !== 'list') throw new Error('应当解析成列表')
    expect(list.items).toHaveLength(2)
    expect(list.items[0].content).toEqual([
      { type: 'strong', children: [{ type: 'text', text: '第一项' }] },
      { type: 'text', text: '：前半句后半句接着写。' },
    ])
  })
})

describe('块级排版', () => {
  it('引用块里的内容继续按块解析', () => {
    expect(parseMarkdown('> 第一行\n> 第二行')).toEqual([{ type: 'quote', blocks: [paragraph('第一行第二行')] }])
  })

  it('围栏代码块原样保留，围栏与语言标记都不进正文', () => {
    expect(parseMarkdown('```ts\nconst 道 = 1\n```')).toEqual([{ type: 'code', text: 'const 道 = 1' }])
  })

  it('流式生成中途还没闭合的围栏当成代码块，剩下的内容不丢', () => {
    expect(parseMarkdown('```\n还没写完')).toEqual([{ type: 'code', text: '还没写完' }])
  })

  it('三个连字符是分隔线，不是列表项', () => {
    expect(parseMarkdown('---')).toEqual([{ type: 'rule' }])
  })
})

describe('行内标记', () => {
  it('粗体与斜体拆成对应节点', () => {
    expect(parseMarkdown('**粗**然后*斜*')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'strong', children: [{ type: 'text', text: '粗' }] },
          { type: 'text', text: '然后' },
          { type: 'em', children: [{ type: 'text', text: '斜' }] },
        ],
      },
    ])
  })

  it('三个星号是粗斜体，不会留下落单的星号', () => {
    expect(parseMarkdown('***重点***')).toEqual([
      {
        type: 'paragraph',
        content: [
          {
            type: 'strong',
            children: [{ type: 'em', children: [{ type: 'text', text: '重点' }] }],
          },
        ],
      },
    ])
  })

  it('反引号里的内容原样保留，不再解析里面的标记', () => {
    expect(parseMarkdown('存进 `daodejing.data.v1` 这个键')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '存进 ' },
          { type: 'code', text: 'daodejing.data.v1' },
          { type: 'text', text: ' 这个键' },
        ],
      },
    ])
  })

  it('未闭合的粗体按字面量显示，不会把后半段整体加粗', () => {
    expect(parseMarkdown('这里有 **还没闭合的粗体')).toEqual([paragraph('这里有 **还没闭合的粗体')])
  })

  it('链接不生成可点标签，改成「文字（地址）」保留来源', () => {
    expect(parseMarkdown('可查 [《老子》](https://example.com/a) 这一条')).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '可查 ' },
          { type: 'text', text: '《老子》（https://example.com/a）' },
          { type: 'text', text: ' 这一条' },
        ],
      },
    ])
  })

  it('模型返回的 HTML 标签只当文字，不产生元素', () => {
    expect(parseMarkdown('<b>粗</b> 与 <img src=x onerror=alert(1)>')).toEqual([
      paragraph('<b>粗</b> 与 <img src=x onerror=alert(1)>'),
    ])
  })

  it('反斜杠转义的星号当普通字符', () => {
    expect(parseMarkdown('2 \\* 3 就是 6')).toEqual([paragraph('2 * 3 就是 6')])
  })
})

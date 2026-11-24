import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 移动端安全区属于纯样式约定，jsdom 不做真实布局，只能直接检查样式源。
 * 放在 src 之外，避免应用的类型环境为了读文件而引入 Node 类型。
 */
const css = readFileSync(resolve(process.cwd(), 'src/styles/index.css'), 'utf8')

function ruleBody(selector: string): string {
  const match = css.match(new RegExp(`${selector}\\s*{([^}]*)}`, 's'))
  return match?.[1] ?? ''
}

/** 取出某个媒体查询的块内容，按花括号配对，避免遇到内层规则就截断 */
function mediaBody(query: string): string {
  const open = css.indexOf(`@media ${query}`)
  if (open < 0) return ''
  const start = css.indexOf('{', open)
  let depth = 0
  for (let index = start; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(start + 1, index)
    }
  }
  return ''
}

describe('移动端安全区', () => {
  it('根节点定义了四个方向的避让变量', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(css).toContain(`--safe-${side}:`)
    }
  })

  it('顶栏让出状态栏，底栏让出系统手势区', () => {
    expect(ruleBody('\\.mobile-topbar')).toMatch(/padding:[^;]*var\(--safe-top\)/s)
    expect(ruleBody('\\.bottom-nav')).toMatch(/var\(--safe-bottom\)/s)
  })

  it('正文与浮层也不被固定栏遮挡', () => {
    expect(ruleBody('\\.content')).toMatch(/var\(--safe-bottom\)/s)
    expect(ruleBody('\\.toast-stack')).toMatch(/var\(--safe-bottom\)/s)
  })

  it('单行注释之外的样式里没有硬编码的 env(safe-area-inset)', () => {
    // 统一走 --safe-* 变量，避免一处改了一处漏
    const declarations = css
      .split('\n')
      .filter((line) => line.includes('env(safe-area-inset') && !line.trim().startsWith('--safe-'))
    expect(declarations).toEqual([])
  })
})

describe('布局收缩', () => {
  const gridColumns = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)].map((match) => match[1].trim())

  it('网格列不用裸 1fr，最小宽度由 minmax 显式声明', () => {
    expect(gridColumns.length).toBeGreaterThan(20)
    const risky = gridColumns.filter((value) => {
      // 去掉合法的 minmax(下限, 1fr) 后仍出现 1fr，说明这一列会按 max-content 计算最小宽度
      const rest = value.replace(/minmax\([^()]*\)/g, '')
      return /(^|[\s(])1fr([\s)]|$)/.test(rest)
    })
    expect(risky).toEqual([])
  })

  it('minmax 不嵌套，嵌套声明在浏览器里会整条失效', () => {
    // 嵌套 minmax 不合法，CSS.supports 返回 false，整条 grid-template-columns 被丢弃后退化为单列
    expect(css).not.toMatch(/minmax\([^()]*minmax\(/)
  })

  it('全篇目录按自适应列排布，手机端可落三列', () => {
    expect(ruleBody('\\.chapter-grid')).toMatch(/grid-template-columns:\s*repeat\(auto-fill, minmax\(104px, 1fr\)\)/)
    expect(mediaBody('(min-width: 640px)')).toMatch(/\.chapter-grid\s*{[^}]*minmax\(120px, 1fr\)/s)
    expect(mediaBody('(min-width: 900px)')).toMatch(/\.chapter-grid\s*{[^}]*minmax\(116px, 1fr\)/s)
  })

  it('背诵选章与概念索引同样使用自适应列', () => {
    expect(ruleBody('\\.chapter-picker')).toMatch(/repeat\(auto-fill, minmax\(64px, 1fr\)\)/)
    expect(ruleBody('\\.concept-grid')).toMatch(/repeat\(auto-fill, minmax\(160px, 1fr\)\)/)
  })

  it('手机端紧凑卡片去掉摘要与重复分卷脚注，只留章号、章名与状态', () => {
    const mobile = mediaBody('(max-width: 639px)')
    expect(mobile).toMatch(/\.chapter-card\.is-compact \.chapter-card-excerpt,[\s\S]*?display:\s*none/)
    expect(mobile).toMatch(/\.chapter-card\.is-compact \.chapter-card-status\.is-muted/)
  })

  it('网格与弹性容器允许收缩', () => {
    expect(ruleBody('\\.stack')).toMatch(/min-width:\s*0/)
  })

  it('body 兜底禁止横向滚动，固定底栏不会被挤出视口', () => {
    expect(ruleBody('body')).toMatch(/overflow-x:\s*hidden/)
  })

  it('全屏高度带 dvh 兜底，iOS 地址栏收放时不会留出空档', () => {
    // 旧浏览器不认 dvh，带兜底的顺序不能反，否则会在老 Safari 上整条失效
    for (const selector of ['body', '\\.app-shell']) {
      const body = ruleBody(selector)
      expect(body).toMatch(/min-height:\s*100vh;[\s\S]*min-height:\s*100dvh/)
    }
  })
})

describe('背诵主视觉', () => {
  it('使用独立的 hero 颜色变量，不随深色主题翻转强调色', () => {
    const feature = ruleBody('\\.memorize-feature')
    expect(feature).toMatch(/var\(--hero-bg\)/)
    expect(feature).toMatch(/var\(--hero-ink\)/)
    expect(css.match(/--hero-bg:/g)).toHaveLength(2)
    expect(css).toContain('--hero-ink:')
  })
})

describe('章页注音排版', () => {
  it('拼音占位两侧留白，相邻长音节在视觉上分得开', () => {
    // cháng 比汉字宽，两字相邻时 ::before 不留内边距会贴成 chángdào。
    // 留白写在伪元素上，em 取的是伪元素自身字号（下限 10px），不是正文的 --reading-size，
    // 只断言「大于 0」会放过远小于可辨阈值的取值，这里换算成实际像素再判。
    const rule = ruleBody('\\.original-text \\.zi::before')
    const padding = rule.match(/padding-inline:\s*([\d.]+)em/)
    const fontFloor = ruleBody('\\.original-text \\.zi::before,\\s*\\n\\.original-text \\.zi::after').match(
      /font-size:\s*max\((\d+)px/,
    )
    expect(padding).not.toBeNull()
    expect(fontFloor).not.toBeNull()
    // 两侧内边距之和即相邻两个音节的净间隙；2.4px 是实测能分开音节的下限
    const gap = Number(padding?.[1]) * Number(fontFloor?.[1]) * 2
    expect(gap).toBeGreaterThanOrEqual(2.4)
  })

  it('字与紧跟的标点同组，组内禁止换行', () => {
    // 汉字是 inline-block，不锁住标点时段末句号会单独掉到下一行行首
    const selector = '\\.original-text \\.no-break'
    expect(ruleBody(selector)).toMatch(/white-space:\s*nowrap/)
  })
})

describe('章页就近翻页', () => {
  it('打印时隐藏原文后的翻页条', () => {
    expect(mediaBody('print')).toMatch(/\.chapter-quicknav/)
  })

  it('首尾章的禁用态不接收指针事件，悬停时不会装成可点链接', () => {
    // 与页底翻页卡的 .pager-link.is-disabled 同一套语义，漏掉会让人以为能点
    expect(ruleBody('\\.quicknav-link\\.is-disabled')).toMatch(/pointer-events:\s*none/)
  })
})

describe('问道入口只有一个', () => {
  it('旧的侧栏按钮与浮动按钮类名都已删除', () => {
    // 两个入口靠断点切换，改一处容易漏另一处；类名残留往往意味着规则还在
    expect(css).not.toContain('.ai-entry')
    expect(css).not.toContain('.ai-fab')
    expect(css).toContain('.ai-launcher')
  })

  it('没有任何断点把入口藏起来', () => {
    // 之前宽屏用 display: none 隐藏浮动按钮、改走侧栏，这条断言专防它回来。
    // 打印样式本来就该藏，先摘掉再查，否则专防的那条会被它盖过去。
    const screenCss = css.replace(mediaBody('print'), '')
    const launcherRules = [...screenCss.matchAll(/\.ai-launcher[^{]*\{([^}]*)\}/g)].map((match) => match[1])
    const hiding = launcherRules.filter((body) => /display:\s*none/.test(body))
    expect(hiding).toEqual([])
  })

  it('打印时入口不出现', () => {
    expect(mediaBody('print')).toMatch(/\.ai-launcher/)
  })

  it('展开靠设备能力判断悬停，不靠视口宽度', () => {
    // 平板接鼠标、窄窗口接键盘同样需要「问道」这行字
    const hoverBlock = mediaBody('(hover: hover)')
    expect(hoverBlock).toMatch(/\.ai-launcher:hover/)
    expect(ruleBody('\\.ai-launcher:focus-visible')).toMatch(/width:/)
  })

  it('滚动收起用 visibility，隐藏后不再接收点击', () => {
    const hidden = ruleBody('\\.ai-launcher\\.is-hidden')
    expect(hidden).toMatch(/visibility:\s*hidden/)
    expect(hidden).toMatch(/pointer-events:\s*none/)
  })

  it('底部收起的命中区不小于 44px，且不被 .button-small 盖掉', () => {
    // .button-small 只有 34px；单手关闭靠的是这一颗，小了就又变成点不准的 X。
    // 两条规则都是 min-height，靠书写顺序取胜时挪一下位置命中区就悄悄掉回 34px，
    // 所以要求收起的规则用两个类提高权重，与先后顺序无关。
    const body = ruleBody('\\.ai-collapse')
    const minHeight = body.match(/min-height:\s*(\d+)px/)
    expect(minHeight).not.toBeNull()
    expect(Number(minHeight?.[1])).toBeGreaterThanOrEqual(44)
    expect(css).toMatch(/\.button\.ai-collapse\s*\{/)
  })

  it('引导页的按钮栏贴底、与输入框那一行同一套内边距', () => {
    // 删掉了 main 上的 .ai-empty .button { align-self: flex-start }，按钮改由这一栏承载：
    // 少了它，column flex 的默认 stretch 会把两颗按钮拉成两行满宽。
    const body = ruleBody('\\.ai-empty-foot')
    expect(body).toMatch(/display:\s*flex/)
    expect(body).toMatch(/align-items:\s*center/)
    expect(body).toMatch(/gap:/)
    const padding = body.match(/padding:\s*([^;]+);/)
    const composerPadding = ruleBody('\\.ai-composer').match(/padding:\s*([^;]+);/)
    expect(padding?.[1]).toBe(composerPadding?.[1])
  })

  it('输入框下方不再放隐私文案', () => {
    // 按钮占的正是原来那行文案的位置，类名残留会让人以为文案还在
    expect(css).not.toContain('.ai-privacy')
  })
})

describe('回答排版', () => {
  it('列表符号显式加回来，全站 reset 把 list-style 清空了', () => {
    // 真实渲染时发现：不写这两条，回答里的要点清单会变成没有符号的缩进块，
    // 只在 jsdom 里断言解析结果看不出来，所以在样式源上补一道。
    // 不能用 ruleBody：它按选择器子串匹配，会先命中 `.ai-markdown ul, .ai-markdown ol` 这条合并规则，
    // 拿到的是没有 list-style 的那份声明。
    const listStyle = [...css.matchAll(/\.ai-markdown (?:ul|ol)[^{]*{([^}]*)}/g)]
      .map((match) => match[1].match(/list-style:\s*(\w+)/)?.[1])
      .filter(Boolean)
    expect(listStyle).toContain('disc')
    expect(listStyle).toContain('decimal')
  })

  it('回答层改回 normal 换行，气泡的 pre-wrap 不会再制造硬折行', () => {
    // .ai-bubble 的 pre-wrap 是给读者提问留的；解析时已经合并掉软换行，
    // 这一层不覆盖回去，气泡里会出现解析后的额外断行
    expect(ruleBody('\\.ai-bubble')).toMatch(/white-space:\s*pre-wrap/)
    expect(ruleBody('\\.ai-markdown')).toMatch(/white-space:\s*normal/)
  })
})

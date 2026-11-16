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

  it('网格列的最小宽度由 minmax 显式声明，不用裸 1fr', () => {
    expect(gridColumns.length).toBeGreaterThan(20)
    const risky = gridColumns.filter((value) => {
      // 去掉合法的 minmax(下限, 1fr) 后仍出现 1fr，说明这一列会按 max-content 计算最小宽度
      const rest = value.replace(/minmax\([^()]*\)/g, '')
      return /(^|[\s(])1fr([\s)]|$)/.test(rest)
    })
    expect(risky).toEqual([])
  })

  it('minmax 不嵌套，嵌套声明会被浏览器整条丢弃', () => {
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
})

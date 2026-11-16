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
  const gridColumns = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)].map((m) => m[1].trim())

  it('网格列不用裸 1fr，最小宽度由 minmax 显式声明', () => {
    expect(gridColumns.length).toBeGreaterThan(20)
    const risky = gridColumns.filter((value) => {
      // 合法的 minmax(下限, 1fr) 整段去掉后，剩下的裸 1fr 会按 max-content 计算最小宽度
      const rest = value.replace(/minmax\([^()]*\)/g, '')
      return /(^|[\s(])1fr([\s)]|$)/.test(rest)
    })
    expect(risky).toEqual([])
  })

  it('minmax 不嵌套，嵌套声明在浏览器里会整条失效', () => {
    // 嵌套 minmax 不合法，CSS.supports 返回 false，整条 grid-template-columns 被丢弃后退化为单列
    expect(css).not.toMatch(/minmax\([^()]*minmax\(/)
  })

  it('网格与弹性容器允许收缩', () => {
    expect(ruleBody('\\.stack')).toMatch(/min-width:\s*0/)
  })

  it('body 兜底禁止横向滚动，固定底栏不会被挤出视口', () => {
    expect(ruleBody('body')).toMatch(/overflow-x:\s*hidden/)
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

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
  it('所有网格列都用 minmax(0, ...)，避免内容把容器撑破', () => {
    const declarations = [...css.matchAll(/grid-template-columns:\s*([^;]+);/g)].map((m) => m[1].trim())
    expect(declarations.length).toBeGreaterThan(20)
    const risky = declarations.filter((value) => {
      // 纯固定宽度或以 1fr 作为最大值都安全；风险在于裸 1fr / auto 会取 max-content 最小值
      return /(^|[\s(])1fr([\s)]|$)/.test(value) && !value.includes('minmax(0')
    })
    // 允许 repeat(3, 1fr) 这类写法单独存在前，先确认没有裸 1fr 列
    expect(risky).toEqual([])
  })

  it('网格与弹性容器允许收缩', () => {
    expect(ruleBody('\\.stack')).toMatch(/min-width:\s*0/)
  })

  it('body 兜底禁止横向滚动，固定底栏不会被挤出视口', () => {
    expect(ruleBody('body')).toMatch(/overflow-x:\s*hidden/)
  })
})

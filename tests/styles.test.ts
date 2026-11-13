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

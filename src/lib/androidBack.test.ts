import { describe, expect, it } from 'vitest'
import { resolveBackAction } from './androidBack'

describe('安卓返回键的落点', () => {
  it('面板开着时先收面板，即便能回上一页', () => {
    // 面板盖住整页，先翻走背后的页面会让读者以为自己按错了
    expect(resolveBackAction({ aiOpen: true, canGoBack: true })).toBe('close-ai')
    expect(resolveBackAction({ aiOpen: true, canGoBack: false })).toBe('close-ai')
  })

  it('面板关着时回上一页', () => {
    expect(resolveBackAction({ aiOpen: false, canGoBack: true })).toBe('go-back')
  })

  it('已经在第一页时才退出应用', () => {
    // 这一支漏掉就会变成「按了没反应」：注册监听后原生壳不再兜底退出
    expect(resolveBackAction({ aiOpen: false, canGoBack: false })).toBe('exit')
  })
})

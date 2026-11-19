import '@testing-library/jest-dom/vitest'

// jsdom 不支持 matchMedia，给外观设置一个稳定的默认值
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// jsdom 的 scrollTo 未实现，测试里直接替换为空实现
window.scrollTo = (() => {}) as typeof window.scrollTo

// jsdom 也没有 scrollIntoView。章页「跳到践行笔记」用 setTimeout 调用它，
// 测试跑得慢时定时器会在用例之间触发，缺这个方法会变成未捕获异常而不是用例失败
Element.prototype.scrollIntoView = (() => {}) as typeof Element.prototype.scrollIntoView

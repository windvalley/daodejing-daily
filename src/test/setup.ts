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

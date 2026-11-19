import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { ToastProvider } from '../components/Toast'
import { actions, createDefaultData } from '../lib/store'

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  )
}

interface Point {
  clientX: number
  clientY: number
}

/** 正文里的真实节点：touchstart 的 target 是它，不是 window */
function bodyTarget(): Element {
  const target = document.querySelector('.original-text')
  if (!(target instanceof Element)) throw new Error('找不到原文节点')
  return target
}

/** 让 performance.now 走一个可控的时钟，手势时长不靠真实等待 */
let clock = 0

beforeEach(() => {
  clock = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/**
 * jsdom 没有真实触摸，按浏览器派发顺序手动拼一遍：
 * touchstart 带 touches、touchend 带 changedTouches。
 */
function swipe(
  start: Point,
  end: Point,
  {
    durationMs = 150,
    target = bodyTarget(),
    touches = [start],
    endTouches = [end],
  }: { durationMs?: number; target?: Element | Window; touches?: Point[]; endTouches?: Point[] } = {},
) {
  fireEvent.touchStart(target, { touches, changedTouches: touches })
  clock += durationMs
  fireEvent.touchEnd(window, { touches: [], changedTouches: endTouches })
}

const leftSwipe = (options?: Parameters<typeof swipe>[2]) =>
  swipe({ clientX: 300, clientY: 500 }, { clientX: 150, clientY: 505 }, options)

const rightSwipe = (options?: Parameters<typeof swipe>[2]) =>
  swipe({ clientX: 150, clientY: 500 }, { clientX: 300, clientY: 505 }, options)

beforeEach(() => {
  window.localStorage.clear()
  actions.replaceAll(createDefaultData())
})

describe('章页左右滑翻章', () => {
  it('从正文左滑翻到下一章，右滑回到上一章', async () => {
    renderApp('/chapters/8')
    leftSwipe()
    expect(await screen.findByRole('heading', { level: 1, name: '第9章 运夷' })).toBeInTheDocument()

    rightSwipe()
    expect(await screen.findByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('纵向为主的滑动交给滚动，不翻章', () => {
    renderApp('/chapters/8')
    swipe({ clientX: 300, clientY: 200 }, { clientX: 250, clientY: 700 })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('横向位移不够时当成点按，不翻章', () => {
    renderApp('/chapters/8')
    swipe({ clientX: 300, clientY: 500 }, { clientX: 270, clientY: 502 })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('从屏幕左右边缘起手不翻章，留给系统返回手势', () => {
    renderApp('/chapters/8')
    // jsdom 的视口宽度是 1024，边缘保护带取 28
    swipe({ clientX: 10, clientY: 500 }, { clientX: 200, clientY: 505 })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
    swipe({ clientX: 1014, clientY: 500 }, { clientX: 800, clientY: 505 })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('慢慢拖动不翻章', () => {
    renderApp('/chapters/8')
    leftSwipe({ durationMs: 1200 })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('首章右滑、末章左滑都停在原章', () => {
    const first = renderApp('/chapters/1')
    rightSwipe()
    expect(screen.getByRole('heading', { level: 1, name: '第1章 体道' })).toBeInTheDocument()
    first.unmount()

    renderApp('/chapters/81')
    leftSwipe()
    expect(screen.getByRole('heading', { level: 1, name: '第81章 显质' })).toBeInTheDocument()
  })

  it('从链接、按钮或输入框上起手不翻章，点按与选字留给这些控件', () => {
    renderApp('/chapters/8')
    const quicknav = screen.getByRole('navigation', { name: '原文后翻页' })
    const nextLink = within(quicknav).getByRole('link', { name: /下一章/ })
    leftSwipe({ target: nextLink })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()

    leftSwipe({ target: screen.getByRole('button', { name: /标记已读/ }) })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()

    leftSwipe({ target: screen.getByLabelText('我的践行笔记') })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('问道面板开着时滑动不翻动背后的章节', () => {
    renderApp('/chapters/8')
    fireEvent.click(screen.getByRole('button', { name: '打开问道' }))
    leftSwipe()
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('双指按下后整段手势作废，缩放不被当成翻章', () => {
    renderApp('/chapters/8')
    const start = { clientX: 300, clientY: 500 }
    swipe(start, { clientX: 150, clientY: 505 }, { touches: [start, { clientX: 400, clientY: 500 }] })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('页面被捏合放大后不接管手势', () => {
    renderApp('/chapters/8')
    // 放大时单指位移先被浏览器吃进页面平移，clientX 差值不再等于屏幕位移
    const viewport = { scale: 2 }
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport })
    try {
      leftSwipe()
      expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
    } finally {
      Reflect.deleteProperty(window, 'visualViewport')
    }
  })

  it('手势期间页面滚动过就不翻章', () => {
    renderApp('/chapters/8')
    const start = { clientX: 300, clientY: 500 }
    fireEvent.touchStart(bodyTarget(), { touches: [start], changedTouches: [start] })
    // 浏览器开始滚动时不会发 touchcancel，只能自己盯着 scroll
    fireEvent.scroll(window)
    clock += 150
    fireEvent.touchEnd(window, { touches: [], changedTouches: [{ clientX: 100, clientY: 505 }] })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('浏览器取消手势后不翻章', () => {
    renderApp('/chapters/8')
    fireEvent.touchStart(bodyTarget(), {
      touches: [{ clientX: 300, clientY: 500 }],
      changedTouches: [{ clientX: 300, clientY: 500 }],
    })
    fireEvent.touchCancel(window, { touches: [], changedTouches: [] })
    fireEvent.touchEnd(window, { touches: [], changedTouches: [{ clientX: 150, clientY: 505 }] })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('选中原文后拖动不翻章', () => {
    renderApp('/chapters/8')
    const original = document.querySelector('.original-text')
    expect(original).not.toBeNull()
    const range = document.createRange()
    range.selectNodeContents(original as Node)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    try {
      leftSwipe()
      expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
    } finally {
      selection?.removeAllRanges()
    }
  })
})

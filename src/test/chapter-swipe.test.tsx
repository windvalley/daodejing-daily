import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
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

/**
 * jsdom 没有真实的触摸手势，只能按 webview 的派发顺序手动拼一遍：
 * touchstart 带 touches、touchend 带 changedTouches。
 * 时长用 Date.now 的桩固定，避免测试里靠真实等待凑时间。
 */
function swipe(
  start: Point,
  end: Point,
  { durationMs = 150, target = window }: { durationMs?: number; target?: Element | Window } = {},
) {
  const now = Date.now
  let clock = 1000
  Date.now = () => clock
  try {
    fireEvent.touchStart(target, { touches: [start], changedTouches: [start] })
    clock += durationMs
    fireEvent.touchEnd(window, { touches: [], changedTouches: [end] })
  } finally {
    Date.now = now
  }
}

function leftSwipe(options?: Parameters<typeof swipe>[2]) {
  // 从屏幕中间偏右往左滑，横向 150 像素、几乎不上下偏移
  swipe({ clientX: 300, clientY: 500 }, { clientX: 150, clientY: 505 }, options)
}

beforeEach(() => {
  window.localStorage.clear()
  actions.replaceAll(createDefaultData())
})

describe('章页左右滑翻章', () => {
  it('左滑翻到下一章，右滑回到上一章', async () => {
    renderApp('/chapters/8')
    leftSwipe()
    expect(await screen.findByRole('heading', { level: 1, name: '第9章 运夷' })).toBeInTheDocument()

    swipe({ clientX: 150, clientY: 500 }, { clientX: 300, clientY: 505 })
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
    swipe({ clientX: 150, clientY: 500 }, { clientX: 320, clientY: 505 })
    expect(screen.getByRole('heading', { level: 1, name: '第1章 体道' })).toBeInTheDocument()
    first.unmount()

    renderApp('/chapters/81')
    leftSwipe()
    expect(screen.getByRole('heading', { level: 1, name: '第81章 显质' })).toBeInTheDocument()
  })

  it('从链接或输入框上起手不翻章，点按与选字留给这些控件', () => {
    renderApp('/chapters/8')
    const quicknav = screen.getByRole('navigation', { name: '原文后翻页' })
    const nextLink = within(quicknav).getByRole('link', { name: /下一章/ })
    swipe({ clientX: 300, clientY: 500 }, { clientX: 150, clientY: 505 }, { target: nextLink })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()

    const textarea = screen.getByLabelText('我的践行笔记')
    swipe({ clientX: 300, clientY: 500 }, { clientX: 150, clientY: 505 }, { target: textarea })
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('问道面板开着时滑动不翻动背后的章节', () => {
    renderApp('/chapters/8')
    const launcher = screen.getByRole('button', { name: '打开问道' })
    fireEvent.click(launcher)
    leftSwipe()
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('浏览器开始滚动并取消手势后不翻章', () => {
    renderApp('/chapters/8')
    fireEvent.touchStart(window, {
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

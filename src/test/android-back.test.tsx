import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { ToastProvider } from '../components/Toast'
import { clearAiConfig } from '../lib/ai'
import { actions, createDefaultData } from '../lib/store'

const appMocks = vi.hoisted(() => ({
  listeners: [] as ((event: { canGoBack: boolean }) => void)[],
  remove: vi.fn(() => Promise.resolve()),
  exitApp: vi.fn(() => Promise.resolve()),
  /** 让注册可以延后 resolve，用来构造「卸载早于注册完成」的竞态 */
  holdRegistration: false,
  releaseRegistration: null as null | (() => void),
}))

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: {
    speak: () => Promise.resolve(),
    stop: () => Promise.resolve(),
    getSupportedVoices: () => Promise.resolve({ voices: [] }),
  },
}))

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (_event: string, listener: (event: { canGoBack: boolean }) => void) => {
      appMocks.listeners.push(listener)
      const handle = { remove: appMocks.remove }
      if (!appMocks.holdRegistration) return Promise.resolve(handle)
      return new Promise((resolve) => {
        appMocks.releaseRegistration = () => resolve(handle)
      })
    },
    exitApp: appMocks.exitApp,
  },
}))

function renderApp(path = '/chapters/8') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  )
}

/** 原生壳里由 Capacitor 注入 window.Capacitor，测试里照这个形状打桩 */
function stubNativePlatform() {
  Object.defineProperty(window, 'Capacitor', {
    configurable: true,
    value: { isNativePlatform: () => true },
  })
}

/** 等 hook 把 backButton 监听注册上；注册走的是插件桥的 Promise */
async function backButtonInstalled() {
  await waitFor(() => expect(appMocks.listeners).toHaveLength(1))
  return appMocks.listeners[0]
}

let backSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  window.localStorage.clear()
  actions.replaceAll(createDefaultData())
  clearAiConfig()
  appMocks.listeners.length = 0
  appMocks.remove.mockClear()
  appMocks.exitApp.mockClear()
  appMocks.holdRegistration = false
  appMocks.releaseRegistration = null
  Reflect.deleteProperty(window, 'Capacitor')
  backSpy = vi.fn()
  Object.defineProperty(window.history, 'back', { configurable: true, value: backSpy })
})

afterEach(() => {
  Reflect.deleteProperty(window, 'Capacitor')
  Reflect.deleteProperty(window.history, 'back')
})

describe('安卓返回键', () => {
  it('浏览器里不接管返回，交给浏览器自己的历史', async () => {
    renderApp()
    // 没有原生壳时连监听都不注册：网页与 PWA 的返回本来就该由浏览器处理
    await act(async () => {})
    expect(appMocks.listeners).toHaveLength(0)
    expect(appMocks.exitApp).not.toHaveBeenCalled()
  })

  it('问道面板开着时先收面板，不翻走背后的页面', async () => {
    stubNativePlatform()
    const user = userEvent.setup()
    renderApp()
    const backButton = await backButtonInstalled()

    await user.click(screen.getByRole('button', { name: '打开问道' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-hidden', 'false')

    // canGoBack 为真也不回退：面板盖住整页，读者要收的是眼前这一层
    act(() => backButton({ canGoBack: true }))

    await waitFor(() => expect(dialog).toHaveAttribute('aria-hidden', 'true'))
    expect(backSpy).not.toHaveBeenCalled()
    expect(appMocks.exitApp).not.toHaveBeenCalled()
    // 与点关闭按钮走同一条收尾路径，焦点回到入口
    expect(screen.getByRole('button', { name: '打开问道' })).toHaveFocus()
  })

  it('面板关着时回上一页', async () => {
    stubNativePlatform()
    renderApp()
    const backButton = await backButtonInstalled()

    act(() => backButton({ canGoBack: true }))

    expect(backSpy).toHaveBeenCalledTimes(1)
    expect(appMocks.exitApp).not.toHaveBeenCalled()
  })

  it('已经退到第一页才退出应用', async () => {
    stubNativePlatform()
    renderApp()
    const backButton = await backButtonInstalled()

    // 这一支漏掉就是「按了没反应」：注册监听后原生壳不再兜底退出
    act(() => backButton({ canGoBack: false }))

    await waitFor(() => expect(appMocks.exitApp).toHaveBeenCalledTimes(1))
    expect(backSpy).not.toHaveBeenCalled()
  })

  it('处理函数读到的是最新状态，不是注册那一刻的', async () => {
    stubNativePlatform()
    const user = userEvent.setup()
    renderApp()
    const backButton = await backButtonInstalled()

    // 注册发生在面板打开之前；监听只装一次，状态靠 ref 更新，
    // 否则这里会拿着 aiOpen:false 去回退历史
    await user.click(screen.getByRole('button', { name: '打开问道' }))
    // 收起来之后 role 查询会跳过 aria-hidden 的对话框，先拿住打开时那份引用
    const dialog = screen.getByRole('dialog')
    act(() => backButton({ canGoBack: true }))
    await waitFor(() => expect(dialog).toHaveAttribute('aria-hidden', 'true'))
    expect(backSpy).not.toHaveBeenCalled()
  })

  it('退出页面时摘掉监听，避免原生侧留着旧回调', async () => {
    stubNativePlatform()
    const view = renderApp()
    await backButtonInstalled()

    view.unmount()
    await waitFor(() => expect(appMocks.remove).toHaveBeenCalledTimes(1))
  })

  it('注册还没完成就卸载，回调到了也照样摘掉', async () => {
    stubNativePlatform()
    // 冷启动时插件桥的握手可能慢于一次导航，卸载早于 addListener resolve 是真实存在的顺序
    appMocks.holdRegistration = true
    const view = renderApp()
    await waitFor(() => expect(appMocks.listeners).toHaveLength(1))

    view.unmount()
    expect(appMocks.remove).not.toHaveBeenCalled()

    // 放行注册，回调此刻才拿到 handle，必须自己补一次 remove，否则监听留在原生侧
    act(() => appMocks.releaseRegistration?.())
    await waitFor(() => expect(appMocks.remove).toHaveBeenCalledTimes(1))
  })
})

describe('返回键与面板里的内容', () => {
  it('面板开着时即便没有历史，返回也是收面板而不是退出应用', async () => {
    stubNativePlatform()
    const user = userEvent.setup()
    renderApp()
    const backButton = await backButtonInstalled()

    await user.click(screen.getByRole('button', { name: '打开问道' }))
    const dialog = screen.getByRole('dialog')
    act(() => backButton({ canGoBack: false }))

    await waitFor(() => expect(dialog).toHaveAttribute('aria-hidden', 'true'))
    // 真机上这一下若落进 exit，读者会以为应用崩了
    expect(appMocks.exitApp).not.toHaveBeenCalled()
  })
})

describe('返回键与真实路由', () => {
  it('按返回真的回到上一个路由，不只是调用了一次 history.back', async () => {
    stubNativePlatform()
    const user = userEvent.setup()
    // 应用跑在 BrowserRouter 上，用 MemoryRouter 时 window.history.back() 与路由毫无关系，
    // 这条用例把 POP 的整条链路接通：backButton → history.back → popstate → 路由。
    // 不要预先 replaceState 造初始条目：那条没有 idx，React Router 会当成外部跳转去 reload。
    render(
      <BrowserRouter>
        <ToastProvider>
          <App />
        </ToastProvider>
      </BrowserRouter>,
    )

    await user.click(screen.getByRole('link', { name: /读这一章/ }))
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/chapters\/\d+$/))
    // 章页独有：原文后的就近翻页条
    expect(screen.getByRole('navigation', { name: '原文后翻页' })).toBeInTheDocument()

    const backButton = await backButtonInstalled()
    // 这个文件默认把 history.back 打桩成空实现，本用例要的是真实的后退，先把桩摘掉
    Reflect.deleteProperty(window.history, 'back')
    act(() => backButton({ canGoBack: true }))

    // 换成 MemoryRouter、把 goBack 改成空实现或历史没接上，这里都会停在章页
    await waitFor(() => expect(window.location.pathname).toBe('/'))
    expect(screen.queryByRole('navigation', { name: '原文后翻页' })).toBeNull()
    expect(screen.getByText(/今天读一章/)).toBeInTheDocument()
  })
})

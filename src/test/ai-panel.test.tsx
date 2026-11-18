import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { ToastProvider } from '../components/Toast'
import { actions, createDefaultData } from '../lib/store'
import { EMPTY_AI_CONFIG, clearAiConfig, saveAiConfig, type AiConfig } from '../lib/ai'

const aiMocks = vi.hoisted(() => ({ requestChat: vi.fn() }))

vi.mock('../lib/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai')>()
  return { ...actual, requestChat: aiMocks.requestChat }
})

const config: AiConfig = {
  endpoint: 'https://example.com/v1/chat/completions',
  model: 'test-model',
  apiKey: 'sk-test',
  economy: false,
}

function renderApp(path = '/chapters/1') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  )
}

/** 面板一直在 DOM 里，靠 aria-hidden 区分开关，查询统一限定在对话框内 */
function openPanel(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getByRole('button', { name: '问道' })).then(() => screen.getByRole('dialog'))
}

beforeEach(() => {
  window.localStorage.clear()
  actions.replaceAll(createDefaultData())
  aiMocks.requestChat.mockReset()
  clearAiConfig()
})

describe('问道入口', () => {
  it('未配置时点开是引导，不出现输入框', async () => {
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    expect(dialog).toHaveAttribute('aria-hidden', 'false')
    expect(within(dialog).getByText('还没有接入 AI')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: '去配置' })).toHaveAttribute('href', '/settings')
    expect(within(dialog).queryByRole('textbox', { name: '你的问题' })).toBeNull()
    expect(aiMocks.requestChat).not.toHaveBeenCalled()
  })

  it('配置后打开，标题写明当前章节', async () => {
    saveAiConfig(config)
    const user = userEvent.setup()
    renderApp('/chapters/8')
    const dialog = await openPanel(user)

    expect(within(dialog).getByText('正在读第8章 · 易性')).toBeInTheDocument()
    expect(within(dialog).getByRole('textbox', { name: '你的问题' })).toBeInTheDocument()
  })

  it('关闭按钮把面板收回，Esc 也能关', async () => {
    saveAiConfig(config)
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)
    expect(dialog).toHaveAttribute('aria-hidden', 'false')

    // 面板在 aria-hidden 之后 role 查询会跳过它，所以直接断言打开时拿到的那份引用
    await user.click(within(dialog).getByRole('button', { name: '关闭问道' }))
    await waitFor(() => expect(dialog).toHaveAttribute('aria-hidden', 'true'))

    await openPanel(user)
    await user.keyboard('{Escape}')
    await waitFor(() => expect(dialog).toHaveAttribute('aria-hidden', 'true'))
  })
})

describe('提问与回答', () => {
  it('种子问题来自本章注释，点一下直接发出去', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '第一个道是名词，第二个道是动词。' })
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    const seed = within(dialog).getByRole('button', { name: '「道可道」该怎样理解？' })
    await user.click(seed)

    await waitFor(() => expect(aiMocks.requestChat).toHaveBeenCalledTimes(1))
    const messages = aiMocks.requestChat.mock.calls[0][0] as { role: string; content: string }[]
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('【全书】')
    expect(messages[messages.length - 1].content).toContain('【当前位置】第1章 体道')
    expect(messages[messages.length - 1].content).toContain('【提问】「道可道」该怎样理解？')

    expect(await within(dialog).findByText('第一个道是名词，第二个道是动词。')).toBeInTheDocument()
  })

  it('回答里点到的章号渲染成可点链接', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '可以先看第8章，再对照第78章。' })
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '水和柔弱是什么关系？')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))

    expect(await within(dialog).findByRole('link', { name: '第8章' })).toHaveAttribute('href', '/chapters/8')
    expect(within(dialog).getByRole('link', { name: '第78章' })).toHaveAttribute('href', '/chapters/78')
    expect(within(dialog).getByText('依据：')).toBeInTheDocument()
  })

  it('引文对不上原文时给出未核实提示', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '第四十二章说「道法自然，无为而成」。' })
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '这句话出自哪里？')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))

    expect(await within(dialog).findByText('有 1 处引文未在书中找到，请以章页原文为准。')).toBeInTheDocument()
  })

  it('引文都对得上时不打扰读者', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '第八章说「上善若水，水善利万物而不争」。' })
    const user = userEvent.setup()
    renderApp('/chapters/8')
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '这一句怎么理解？')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))

    await within(dialog).findByText('第八章说「上善若水，水善利万物而不争」。')
    expect(within(dialog).queryByText(/未在原文中找到/)).toBeNull()
  })

  it('每次提问都会带上最近一轮的对话，第二问不会失忆', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '第一轮回答。' })
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '第一个问题')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))
    await within(dialog).findByText('第一轮回答。')

    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '第二轮回答。' })
    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '第二个问题')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))
    await within(dialog).findByText('第二轮回答。')

    const second = aiMocks.requestChat.mock.calls[1][0] as { role: string; content: string }[]
    expect(second.map((message) => message.content)).toContain('第一个问题')
    expect(second.map((message) => message.content)).toContain('第一轮回答。')
  })
})

describe('失败与降级', () => {
  it('网络失败时给出本地可用的相关章节', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'error', kind: 'network', message: 'Failed to fetch' })
    const user = userEvent.setup()
    renderApp('/chapters/8')
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '上善若水是什么意思')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))

    expect(await within(dialog).findByText('这次请求没有成功，检查服务地址与网络后重试。')).toBeInTheDocument()
    expect(within(dialog).getByText('书里的相关章节：')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: '第8章 易性' })).toHaveAttribute('href', '/chapters/8')
  })

  it('密钥失效时不推荐相关章节，直接指路去配置', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'error', kind: 'auth', message: 'Invalid API key' })
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '随便问问')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))

    expect(await within(dialog).findByText('密钥无效或已过期，去「我的」里检查。')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: '去检查配置' })).toHaveAttribute('href', '/settings')
    expect(within(dialog).queryByText('书里的相关章节：')).toBeNull()
  })

  it('失败的那一轮不进历史，下一问仍然只带两轮提问', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'error', kind: 'network', message: 'boom' })
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '第一次')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))
    await within(dialog).findByText('这次请求没有成功，检查服务地址与网络后重试。')

    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '恢复了。' })
    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '第二次')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))
    await within(dialog).findByText('恢复了。')

    const second = aiMocks.requestChat.mock.calls[1][0] as { role: string }[]
    // system + 上一次提问 + 本次提问，错误消息不该混进来
    expect(second).toHaveLength(3)
  })
})

describe('设置页', () => {
  it('保存后配置进独立的键，不写进学习数据', async () => {
    const user = userEvent.setup()
    renderApp('/settings')

    await user.type(screen.getByLabelText('服务地址'), config.endpoint)
    await user.type(screen.getByLabelText('模型名'), config.model)
    await user.type(screen.getByLabelText('密钥'), config.apiKey)
    await user.click(screen.getByRole('button', { name: '保存配置' }))

    expect(window.localStorage.getItem('daodejing.ai.v1')).toContain('test-model')
    expect(window.localStorage.getItem('daodejing.data.v1') ?? '').not.toContain('sk-test')
    expect(screen.getByText('已保存')).toBeInTheDocument()
  })

  it('清除后回到未配置状态', async () => {
    saveAiConfig(config)
    const user = userEvent.setup()
    renderApp('/settings')

    await user.click(screen.getByRole('button', { name: '清除配置' }))

    expect(window.localStorage.getItem('daodejing.ai.v1')).toBeNull()
    expect(screen.getByLabelText('服务地址')).toHaveValue(EMPTY_AI_CONFIG.endpoint)
  })
})

describe('无障碍与滚动', () => {
  it('关闭时面板不可聚焦，打开后焦点在输入框', async () => {
    saveAiConfig(config)
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    expect(dialog).not.toHaveAttribute('inert')
    expect(within(dialog).getByRole('textbox', { name: '你的问题' })).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(dialog).toHaveAttribute('inert'))
    expect(dialog).toHaveAttribute('aria-hidden', 'true')
  })

  it('打开时锁住背后页面的滚动，关闭后恢复', async () => {
    saveAiConfig(config)
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)
    expect(document.body.style.overflow).toBe('hidden')

    await user.click(within(dialog).getByRole('button', { name: '关闭问道' }))
    await waitFor(() => expect(document.body.style.overflow).toBe(''))
  })
})

describe('翻章后的会话边界', () => {
  it('在应用内翻到另一章会清空上一章的对话，不漏带旧材料', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '第八章的回答。' })
    const user = userEvent.setup()
    renderApp('/chapters/8')

    let dialog = await openPanel(user)
    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '第八章的问题')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))
    await within(dialog).findByText('第八章的回答。')

    // 关掉面板、用章页底部的翻页链接走进下一章，App 不卸载，只有路由变化
    await user.keyboard('{Escape}')
    await waitFor(() => expect(dialog).toHaveAttribute('aria-hidden', 'true'))
    await user.click(screen.getByRole('link', { name: /下一章/ }))

    dialog = await openPanel(user)
    expect(within(dialog).getByText('正在读第9章 · 运夷')).toBeInTheDocument()
    expect(within(dialog).queryByText('第八章的问题')).toBeNull()
    expect(within(dialog).queryByText('第八章的回答。')).toBeNull()

    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '第九章的回答。' })
    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '第九章的问题')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))
    await within(dialog).findByText('第九章的回答。')

    const sent = aiMocks.requestChat.mock.calls[1][0] as { role: string; content: string }[]
    // system + 本次提问，没有第八章的历史
    expect(sent).toHaveLength(2)
    expect(sent[1].content).toContain('【当前位置】第9章')
  })
})

describe('评审补充：重试与播报', () => {
  it('超时后给出重试按钮，并能把原问题重新发出去', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'error', kind: 'timeout', message: '等待回复超时。' })
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '这一章到底在讲什么')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))
    expect(await within(dialog).findByText('等待回复超时，可以重试。')).toBeInTheDocument()

    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '重试成功的回答。' })
    await user.click(within(dialog).getByRole('button', { name: '重试' }))
    await within(dialog).findByText('重试成功的回答。')

    const retried = aiMocks.requestChat.mock.calls[1][0] as { role: string; content: string }[]
    expect(retried[retried.length - 1].content).toContain('【提问】这一章到底在讲什么')
  })

  it('鉴权失败不给重试按钮，只给去配置的入口', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'error', kind: 'auth', message: 'Invalid API key' })
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '随便问问')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))

    await within(dialog).findByText('密钥无效或已过期，去「我的」里检查。')
    expect(within(dialog).queryByRole('button', { name: '重试' })).toBeNull()
  })

  it('回答区是 live region，读屏能听到新内容', async () => {
    saveAiConfig(config)
    const user = userEvent.setup()
    renderApp()
    const dialog = await openPanel(user)

    const log = within(dialog).getByRole('log')
    expect(log).toHaveAttribute('aria-live', 'polite')
    expect(log).toHaveAttribute('aria-busy', 'false')
  })
})

describe('评审补充：引文出处', () => {
  it('句子在书里但章号写错时要标注，不能当依据放行', async () => {
    saveAiConfig(config)
    aiMocks.requestChat.mockResolvedValue({ status: 'ok', content: '第四十二章说「上善若水，水善利万物而不争」。' })
    const user = userEvent.setup()
    renderApp('/chapters/8')
    const dialog = await openPanel(user)

    await user.type(within(dialog).getByRole('textbox', { name: '你的问题' }), '这句话在哪一章？')
    await user.click(within(dialog).getByRole('button', { name: '发送' }))

    expect(await within(dialog).findByText('有 1 处引文的章号对不上，请以章页原文为准。')).toBeInTheDocument()
  })
})

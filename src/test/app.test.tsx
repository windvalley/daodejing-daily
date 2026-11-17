import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { ToastProvider } from '../components/Toast'
import { actions, createDefaultData, getSnapshot } from '../lib/store'

const voiceMocks = vi.hoisted(() => ({ voices: [] as unknown[] }))

vi.mock('../lib/speechVoice', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/speechVoice')>()
  return {
    ...actual,
    loadVoiceOptions: () =>
      Promise.resolve(actual.toVoiceOptions(voiceMocks.voices as Parameters<typeof actual.toVoiceOptions>[0])),
  }
})

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  actions.replaceAll(createDefaultData())
})

describe('今日页', () => {
  it('展示当日章节与今日功课', () => {
    renderApp('/')
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(screen.getByText('今日功课')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /读这一章/ })).toBeInTheDocument()
  })

  it('一章未读时给出从第一章开始的入口，读过之后收起', () => {
    const { unmount } = renderApp('/')
    expect(screen.getByRole('link', { name: '从第一章开始' })).toHaveAttribute('href', '/chapters/1')
    unmount()

    actions.setRead(1, true)
    renderApp('/')
    expect(screen.queryByRole('link', { name: '从第一章开始' })).not.toBeInTheDocument()
  })
})

describe('全篇页', () => {
  it('搜索原文可以定位到第八章', async () => {
    const user = userEvent.setup()
    renderApp('/chapters')
    const input = screen.getByRole('searchbox', { name: '搜索道德经内容' })
    await user.type(input, '上善若水')
    expect(screen.getByText(/找到/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /第8章/ })).toBeInTheDocument()
  })

  it('可以按未读筛选', async () => {
    const user = userEvent.setup()
    actions.setRead(1, true)
    renderApp('/chapters')
    await user.click(screen.getByRole('button', { name: '未读' }))
    expect(screen.queryByRole('link', { name: /体道/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /养身/ }).length).toBeGreaterThan(0)
  })
})

describe('章页', () => {
  it('显示原文、译文与注释，并能标记已读', async () => {
    const user = userEvent.setup()
    const { container } = renderApp('/chapters/8')
    expect(screen.getByRole('heading', { level: 1, name: '易性' })).toBeInTheDocument()
    // 注音把原文拆成了逐字节点，按整段文本比对
    expect(container.querySelector('.original-text')?.textContent).toContain('上善若水。')
    expect(screen.getByText(/最高的善就像水/)).toBeInTheDocument()
    expect(screen.getByText('几于道')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /标记已读/ }))
    expect(getSnapshot().progress[8].read).toBe(true)
    expect(screen.getByRole('button', { name: /已读/ })).toBeInTheDocument()
  })

  it('可以给当前章写践行笔记', async () => {
    const user = userEvent.setup()
    renderApp('/chapters/8?focus=practice')
    const textarea = screen.getByLabelText('我的践行笔记')
    await user.type(textarea, '今天绕开一次硬碰硬。')
    await user.click(screen.getByRole('button', { name: /保存笔记/ }))
    expect(getSnapshot().practice[8].text).toBe('今天绕开一次硬碰硬。')
  })

  it('无效章号给出提示', () => {
    renderApp('/chapters/99')
    expect(screen.getByText(/没有找到第 99 章/)).toBeInTheDocument()
  })

  it('第一章可切换注音并展开逐字解析', async () => {
    const user = userEvent.setup()
    const { container } = renderApp('/chapters/1')
    // 拼音写在伪元素的 attr() 里，正文节点只留汉字，复制原文不会带出注音
    const annotated = container.querySelectorAll('.original-text .zi[data-pinyin="dào"]')
    expect(annotated.length).toBeGreaterThan(0)
    expect(container.querySelector('.original-text')?.textContent).not.toMatch(/[a-z]/)

    await user.click(screen.getByRole('button', { name: '注音' }))
    expect(container.querySelectorAll('.original-text .zi')).toHaveLength(0)
    expect(getSnapshot().settings.showPinyin).toBe(false)

    await user.click(screen.getByRole('button', { name: /逐字解析/ }))
    expect(screen.getByText(/宇宙的本原与根本规律/)).toBeInTheDocument()
    expect(screen.getByText('不读 jiǎo')).toBeInTheDocument()
  })
})

describe('背诵页', () => {
  it('没背过时从当日一章开始，并提供回到第一章的入口', () => {
    renderApp('/memorize')
    expect(screen.getByRole('heading', { level: 2, name: /第\d+章/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '从第一章开始' })).toHaveAttribute('href', '/memorize/1')
  })

  it('停在页面上跨过零点会换成新一天的章节', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 10, 17, 23, 59))
      renderApp('/memorize')
      const before = screen.getByRole('heading', { level: 2, name: /^第\d+章/ }).textContent
      vi.setSystemTime(new Date(2026, 10, 18, 0, 1))
      act(() => {
        vi.advanceTimersByTime(60_000)
      })
      expect(screen.getByRole('heading', { level: 2, name: /^第\d+章/ }).textContent).not.toBe(before)
    } finally {
      vi.useRealTimers()
    }
  })

  it('首字提示可以先遮住再翻开', async () => {
    const user = userEvent.setup()
    renderApp('/memorize/8')
    const clauses = screen.getAllByRole('button', { name: /翻开第/ })
    expect(clauses.length).toBeGreaterThan(3)
    await user.click(clauses[0])
    expect(screen.getByRole('button', { name: /遮住第 1 句/ })).toBeInTheDocument()
  })

  it('自评后记录成绩并加入复习', async () => {
    const user = userEvent.setup()
    renderApp('/memorize/8')
    await user.click(screen.getByRole('button', { name: /很熟/ }))
    expect(getSnapshot().recite[8].lastScore).toBe(95)
    expect(getSnapshot().review[8]).toBeDefined()
    expect(screen.getByText(/本次自评 95 分/)).toBeInTheDocument()
  })

  it('默写模式给出正确的起始提示，不残留模板占位符', async () => {
    const user = userEvent.setup()
    renderApp('/memorize/8')
    await user.click(screen.getByRole('button', { name: '默写' }))
    const textarea = screen.getByLabelText('默写第8章')
    const placeholder = textarea.getAttribute('placeholder') ?? ''
    expect(placeholder).toContain('上善若水')
    expect(placeholder).not.toContain('{')
  })

  it('填空模式检查答案后给出分数', async () => {
    const user = userEvent.setup()
    renderApp('/memorize/8')
    await user.click(screen.getByRole('button', { name: '填空' }))
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toBeGreaterThanOrEqual(3)
    await user.type(inputs[0], '上')
    await user.click(screen.getByRole('button', { name: /检查答案/ }))
    expect(await screen.findByText(/填对 \d+ \/ \d+ 空/)).toBeInTheDocument()
    expect(getSnapshot().recite[8]).toBeDefined()
    expect(getSnapshot().recite[8].lastMode).toBe('fill')
  })

  it('默写时写同字异体不算错，也不报成多写的字', async () => {
    const user = userEvent.setup()
    renderApp('/memorize/5')
    await user.click(screen.getByRole('button', { name: '默写' }))
    const textarea = screen.getByLabelText('默写第5章')
    // 第 5 章原文用「籥」，这里写同字异体「龠」
    await user.type(
      textarea,
      '天地不仁，以万物为刍狗；圣人不仁，以百姓为刍狗。天地之间，其犹橐龠乎？虚而不屈，动而愈出。多言数穷，不如守中。',
    )
    await user.click(screen.getByRole('button', { name: /对照原文/ }))
    expect(await screen.findByLabelText('得分 100 分')).toBeInTheDocument()
    expect(screen.queryByText(/多写的字/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^写错的位置：/)).not.toBeInTheDocument()
  })

  it('默写写错字时单列为写错的位置，不说成一字不差', async () => {
    const user = userEvent.setup()
    renderApp('/memorize/5')
    await user.click(screen.getByRole('button', { name: '默写' }))
    const textarea = screen.getByLabelText('默写第5章')
    // 45 个字的章节错 1 字正好四舍五入到 98 分
    await user.type(
      textarea,
      '天地不仁，以万物为刍狗；圣人不仁，以百姓为刍狗。天地之间，其犹橐籥乎？虚而不屈，动而愈出。多言数穷，不如宇中。',
    )
    await user.click(screen.getByRole('button', { name: /对照原文/ }))
    expect(await screen.findByLabelText('得分 98 分')).toBeInTheDocument()
    expect(screen.getByText(/^写错的位置：/)).toBeInTheDocument()
    expect(screen.queryByText(/多写的字/)).not.toBeInTheDocument()
    expect(screen.getByText(/写错 1 字，漏写 0 字，多写 0 字/)).toBeInTheDocument()
    expect(screen.queryByText(/一字不差/)).not.toBeInTheDocument()
  })
})

describe('复习页', () => {
  it('没有到期章节时展示空状态', () => {
    renderApp('/review')
    expect(screen.getByText('今天没有到期的复习')).toBeInTheDocument()
  })

  it('有到期章节时可以评分推进队列', async () => {
    const user = userEvent.setup()
    actions.addToReview(8)
    renderApp('/review')
    expect(screen.getByRole('heading', { level: 2, name: /第8章 · 易性/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /记得/ }))
    expect(getSnapshot().review[8].reps).toBe(1)
    expect(screen.getByText(/今天已完成 1 章复习/)).toBeInTheDocument()
  })
})

describe('设置页', () => {
  it('切换深色主题会写入设置并作用于根元素', async () => {
    const user = userEvent.setup()
    renderApp('/settings')
    await user.click(screen.getByRole('button', { name: '深色' }))
    expect(getSnapshot().settings.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('可以恢复默认设置', async () => {
    const user = userEvent.setup()
    actions.updateSettings({ fontSize: 22 })
    renderApp('/settings')
    await user.click(screen.getByRole('button', { name: /恢复默认设置/ }))
    expect(getSnapshot().settings.fontSize).toBe(18)
  })

  it('只有一个中文音色时不显示系统音色选择器', async () => {
    voiceMocks.voices = [
      { voiceURI: 'zh-Hans', name: 'Chinese China', lang: 'zh-Hans', localService: true },
      { voiceURI: 'en', name: 'English', lang: 'en', localService: true },
    ]
    // jsdom 没有 speechSynthesis，补一个空实现让试听按钮可用，才能看到音色说明
    Object.defineProperty(window, 'speechSynthesis', {
      value: { getVoices: () => [], cancel: () => {}, speak: () => {} },
      configurable: true,
    })
    try {
      renderApp('/settings')
      await screen.findByText(/这台设备只有这一个中文音色/)
      expect(screen.getByRole('group', { name: '选择朗读音色' })).toBeInTheDocument()
      expect(screen.queryByLabelText(/系统音色/)).not.toBeInTheDocument()
    } finally {
      delete (window as { speechSynthesis?: unknown }).speechSynthesis
    }
  })

  it('有多个中文音色时列出系统音色', async () => {
    voiceMocks.voices = [
      { voiceURI: 'cmn-cn-x-ccc-local', name: 'Chinese China', lang: 'zh-CN', localService: true },
      { voiceURI: 'cmn-cn-x-cce-local', name: 'Chinese China', lang: 'zh-CN', localService: true },
    ]
    renderApp('/settings')
    const select = await screen.findByLabelText(/系统音色/)
    expect(select).toBeInTheDocument()
    expect(within(select).getAllByRole('option')).toHaveLength(3)
  })

  it('音色三档写入设置', async () => {
    const user = userEvent.setup()
    voiceMocks.voices = []
    renderApp('/settings')
    await user.click(screen.getByRole('button', { name: '明亮' }))
    await waitFor(() => expect(getSnapshot().settings.speechTimbre).toBe('bright'))
  })
})

describe('导航与兜底', () => {
  it('底部导航包含五个主要入口，实践在列', () => {
    renderApp('/')
    const nav = screen.getByRole('navigation', { name: '底部导航' })
    const links = within(nav).getAllByRole('link')
    expect(links).toHaveLength(5)
    expect(within(nav).getByRole('link', { name: /实践/ })).toHaveAttribute('href', '/practice')
  })

  it('未知路径显示空状态', () => {
    renderApp('/nowhere')
    expect(screen.getByText('这里没有内容')).toBeInTheDocument()
  })
})

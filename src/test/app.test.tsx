import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../App'
import { ToastProvider } from '../components/Toast'
import { actions, createDefaultData, getSnapshot } from '../lib/store'

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
    renderApp('/chapters/8')
    expect(screen.getByRole('heading', { level: 1, name: '易性' })).toBeInTheDocument()
    expect(screen.getByText(/上善若水。/)).toBeInTheDocument()
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
})

describe('背诵页', () => {
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

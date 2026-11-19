import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { ToastProvider } from '../components/Toast'
import { actions, createDefaultData, getSnapshot } from '../lib/store'
import { getChapter } from '../data/chapters'
import { buildBlankExercise } from '../lib/memorize'

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

/** jsdom 没有 speechSynthesis，补一个空实现，让朗读相关文案按「支持朗读」渲染 */
function stubSpeechSynthesis() {
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      getVoices: () => [],
      cancel: () => {},
      speak: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    configurable: true,
  })
}

function restoreSpeechSynthesis() {
  delete (window as { speechSynthesis?: unknown }).speechSynthesis
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
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
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

  it('原文后就能翻到相邻章节，不必滚到页底', () => {
    renderApp('/chapters/8')
    const quicknav = screen.getByRole('navigation', { name: '原文后翻页' })
    expect(within(quicknav).getByRole('link', { name: /上一章/ })).toHaveAttribute('href', '/chapters/7')
    expect(within(quicknav).getByRole('link', { name: /下一章/ })).toHaveAttribute('href', '/chapters/9')
    // DOM 顺序就是阅读顺序：入口要落在原文之后、章旨之前，页底翻页卡仍然保留
    const gistHeading = screen.getByRole('heading', { level: 2, name: '章旨' })
    expect(quicknav.compareDocumentPosition(gistHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('navigation', { name: '章节导航' })).toBeInTheDocument()
  })

  it('首章的原文后翻页只给出下一章', () => {
    renderApp('/chapters/1')
    const quicknav = screen.getByRole('navigation', { name: '原文后翻页' })
    expect(within(quicknav).getByText('已是开头')).toBeInTheDocument()
    expect(within(quicknav).getByRole('link', { name: /下一章/ })).toHaveAttribute('href', '/chapters/2')
  })

  it('末章的原文后翻页只给出上一章', () => {
    renderApp('/chapters/81')
    const quicknav = screen.getByRole('navigation', { name: '原文后翻页' })
    expect(within(quicknav).getByText('已是结尾')).toBeInTheDocument()
    expect(within(quicknav).getByRole('link', { name: /上一章/ })).toHaveAttribute('href', '/chapters/80')
  })

  it('方向键翻到相邻章节，焦点落在新章标题上', async () => {
    const user = userEvent.setup()
    renderApp('/chapters/8')
    await user.keyboard('{ArrowRight}')
    expect(await screen.findByRole('heading', { level: 1, name: '第9章 运夷' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(await screen.findByRole('heading', { level: 1, name: '第8章 易性' })).toHaveFocus()
  })

  it('首次进入章页不抢焦点', () => {
    renderApp('/chapters/8')
    // 方向键翻章才把焦点交给标题；直接进入时焦点应留在文档上，否则读屏会跳过页头
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).not.toHaveFocus()
  })

  it('带修饰键的方向键不翻章', async () => {
    const user = userEvent.setup()
    renderApp('/chapters/8')
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}{Control>}{ArrowRight}{/Control}{Meta>}{ArrowRight}{/Meta}')
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('长按方向键产生的重复按键不再继续翻章', () => {
    renderApp('/chapters/8')
    // 系统对长按会按重复率连发 keydown，只认第一次
    expect(fireEvent.keyDown(window, { key: 'ArrowRight', repeat: true })).toBe(true)
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('章中方向键拦下默认滚动并翻章', async () => {
    const user = userEvent.setup()
    renderApp('/chapters/8')
    // fireEvent 返回 false 说明 preventDefault 生效，浏览器默认的横向滚动不会同时发生
    expect(fireEvent.keyDown(window, { key: 'ArrowRight' })).toBe(false)
    expect(await screen.findByRole('heading', { level: 1, name: '第9章 运夷' })).toBeInTheDocument()

    await user.keyboard('{ArrowLeft}')
    expect(await screen.findByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('首章按左方向键、末章按右方向键都停在原章，也不吃掉按键', () => {
    const first = renderApp('/chapters/1')
    // 边界键不 preventDefault，否则白白吞掉浏览器本来的滚动或光标移动
    expect(fireEvent.keyDown(window, { key: 'ArrowLeft' })).toBe(true)
    expect(screen.getByRole('heading', { level: 1, name: '第1章 体道' })).toBeInTheDocument()
    first.unmount()

    renderApp('/chapters/81')
    expect(fireEvent.keyDown(window, { key: 'ArrowRight' })).toBe(true)
    expect(screen.getByRole('heading', { level: 1, name: '第81章 显质' })).toBeInTheDocument()
  })

  it('在践行笔记里按方向键不会翻章', async () => {
    const user = userEvent.setup()
    renderApp('/chapters/8')
    const textarea = screen.getByLabelText('我的践行笔记')
    await user.click(textarea)
    await user.keyboard('{ArrowRight}{ArrowLeft}')
    expect(textarea).toHaveFocus()
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('问道面板开着时方向键不翻动背后的章节', async () => {
    const user = userEvent.setup()
    renderApp('/chapters/8')
    await user.click(screen.getByRole('button', { name: '打开问道' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-hidden', 'false')
    // 未配置 AI 时面板里没有输入框，焦点会停在入口上，事件目标落在面板外
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('heading', { level: 1, name: '第8章 易性' })).toBeInTheDocument()
  })

  it('注音模式下标点跟在前一个字后面，不单独落到行首', () => {
    const { container } = renderApp('/chapters/1')
    // 汉字是 inline-block，字与标点之间原本是可断行的两段；分组后标点必须留在同一组内
    const groups = [...container.querySelectorAll('.original-text .no-break')]
    // 逗号、分号、句号都要被并进前一个字，只处理其中一种说明分组逻辑坏了
    expect(groups.map((node) => node.textContent)).toEqual([
      '道，',
      '道；',
      '名，',
      '名。',
      '名，',
      '始；',
      '名，',
      '母。',
      '欲，',
      '妙；',
      '欲，',
      '徼。',
      '者，',
      '名，',
      '玄。',
      '玄，',
      '门。',
    ])
    for (const group of groups) expect(group.querySelector('.zi')).not.toBeNull()
  })

  it('冒号与引号连排时并入同一个字，引号不会孤零零留在行尾', () => {
    // 第 57 章的「：『」这类连排标点要跟前面的字同组，否则左引号会被挤到行尾或行首
    const { container } = renderApp('/chapters/57')
    const groups = [...container.querySelectorAll('.original-text .no-break')].map((node) => node.textContent ?? '')
    expect(groups.some((text) => text.endsWith('：“'))).toBe(true)
    expect(groups.some((text) => text.endsWith('。”'))).toBe(true)
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
    // 关掉注音后走纯文本分支，不留禁止换行的分组，普通阅读的断行不受影响
    expect(container.querySelectorAll('.original-text .no-break')).toHaveLength(0)
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
    const pair = screen.getByText(/^写错的位置：/)
    expect(pair).toHaveTextContent('宇 → 守')
    expect(pair.querySelector('em')).toHaveTextContent('宇')
    expect(pair.querySelector('strong')).toHaveTextContent('守')
    expect(screen.queryByText(/多写的字/)).not.toBeInTheDocument()
    expect(screen.getByText(/写错 1 字，漏写 0 字，多写 0 字/)).toBeInTheDocument()
    expect(screen.queryByText(/一字不差/)).not.toBeInTheDocument()
  })

  it('默写同时有写错和多写时两段分开报', async () => {
    const user = userEvent.setup()
    renderApp('/memorize/5')
    await user.click(screen.getByRole('button', { name: '默写' }))
    const textarea = screen.getByLabelText('默写第5章')
    await user.type(
      textarea,
      '天地不仁，以万物为刍狗；圣人不仁，以百姓为刍狗。天地之间，其犹橐籥乎？虚而不屈，动而愈出。多言数穷，不如宇中好。',
    )
    await user.click(screen.getByRole('button', { name: /对照原文/ }))
    expect(await screen.findByText(/^写错的位置：/)).toHaveTextContent('宇 → 守')
    expect(screen.getByText(/多写的字：/)).toHaveTextContent('多写的字：好')
    expect(screen.getByText(/写错 1 字，漏写 0 字，多写 1 字/)).toBeInTheDocument()
  })

  it('填空时写同字异体也算填对', async () => {
    const user = userEvent.setup()
    const chapter = getChapter(5)!
    // 换一组只是把种子加一，按同样的规则算出第几组会挖到「籥」
    let seed = chapter.number * 7919
    let clicks = 0
    while (!buildBlankExercise(chapter.text, seed).blanks.some((blank) => blank.answer === '籥')) {
      seed += 1
      clicks += 1
      expect(clicks).toBeLessThan(200)
    }
    const blank = buildBlankExercise(chapter.text, seed).blanks.find((item) => item.answer === '籥')!

    renderApp('/memorize/5')
    await user.click(screen.getByRole('button', { name: '填空' }))
    for (let index = 0; index < clicks; index += 1) {
      await user.click(screen.getByRole('button', { name: /换一组/ }))
    }
    const input = screen.getByLabelText(`第 ${blank.id + 1} 空`)
    await user.type(input, '龠')
    await user.click(screen.getByRole('button', { name: /检查答案/ }))
    expect(await screen.findByLabelText(`第 ${blank.id + 1} 空`)).toHaveClass('is-correct')
    expect(screen.queryByText(/龠 → 籥/)).not.toBeInTheDocument()
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
    stubSpeechSynthesis()
    try {
      renderApp('/settings')
      await screen.findByText(/这台设备只有这一个中文音色/)
      expect(screen.getByRole('group', { name: '选择朗读音色' })).toBeInTheDocument()
      expect(screen.queryByLabelText(/系统音色/)).not.toBeInTheDocument()
    } finally {
      restoreSpeechSynthesis()
    }
  })

  it('读不到音色时不再一直显示正在读取', async () => {
    // iOS 首次 getVoices() 为空，读完就要给结论，不能让文案卡在加载中
    voiceMocks.voices = []
    stubSpeechSynthesis()
    try {
      renderApp('/settings')
      await screen.findByText(/没有读取到中文音色/)
      expect(screen.queryByText(/正在读取系统音色/)).not.toBeInTheDocument()
    } finally {
      restoreSpeechSynthesis()
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

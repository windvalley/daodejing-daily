import { describe, expect, it } from 'vitest'
import { getChapter } from '../data/chapters'
import {
  AI_RULES,
  MAX_HISTORY_MESSAGES,
  buildAskMessages,
  buildBookMaterial,
  buildChapterOutline,
  buildSystemPrompt,
  focusFromPath,
  fallbackChapters,
  formatFocus,
  glossForSentence,
  seedQuestions,
} from './aiContext'
import type { ChatMessage } from './ai'

describe('全书材料', () => {
  it('八十一章都在前缀里，且拼一次之后复用同一份字符串', () => {
    const material = buildBookMaterial()
    expect(material).toContain('### 第1章 体道')
    expect(material).toContain('### 第81章')
    expect(material.match(/### 第/g)).toHaveLength(81)
    expect(buildBookMaterial()).toBe(material)
  })

  it('每章带齐原文、章旨、译文、注释与实践提示', () => {
    const chapter = getChapter(1)
    const material = buildBookMaterial()
    expect(material).toContain(chapter!.text[0])
    expect(material).toContain(`章旨：${chapter!.gist}`)
    expect(material).toContain(`译文：${chapter!.translation}`)
    expect(material).toContain(`实践提示：${chapter!.practice}`)
    chapter!.notes.forEach((note) => expect(material).toContain(`- ${note.term}：${note.text}`))
  })

  it('省流目录只到章题与章旨，不夹带译文', () => {
    const outline = buildChapterOutline()
    expect(outline.match(/^第\d+章 /gm)).toHaveLength(81)
    expect(outline).not.toContain('译文：')
  })
})

describe('system 提示词', () => {
  it('默认带全书材料与硬性约束', () => {
    const prompt = buildSystemPrompt()
    expect(prompt.startsWith(AI_RULES)).toBe(true)
    expect(prompt).toContain('【全书】')
    expect(prompt).toContain('### 第1章 体道')
  })

  it('省流模式只给目录，不给全书正文', () => {
    const prompt = buildSystemPrompt({ economy: true })
    expect(prompt).toContain('【全书目录】')
    expect(prompt).not.toContain('### 第1章 体道')
  })

  it('规则里写死了分级、分歧与不编造三条', () => {
    expect(AI_RULES).toContain('材料分级')
    expect(AI_RULES).toContain('训释分歧照实说')
    expect(AI_RULES).toContain('不要编造章句')
  })
})

describe('焦点块', () => {
  it('章节焦点只标位置，不重复正文（正文已在 system 里）', () => {
    const focus = formatFocus({ kind: 'chapter', chapter: 1 })
    expect(focus).toContain('【当前位置】第1章 体道')
    expect(focus).toContain('本章关联概念：道')
    expect(focus).not.toContain('道可道，非常道；名可名，非常名。')
  })

  it('省流模式下章节焦点自带正文，没有它就完全没材料', () => {
    const focus = formatFocus({ kind: 'chapter', chapter: 1 }, true)
    expect(focus).toContain('道可道，非常道；名可名，非常名。')
    expect(focus).toContain('译文：')
  })

  it('选中句会带上逐字注音与释义', () => {
    const focus = formatFocus({ kind: 'chapter', chapter: 1, sentence: '道可道，非常道' })
    expect(focus).toContain('【读者选中】道可道，非常道')
    expect(focus).toContain('【选中句的逐字注音与释义】')
    expect(focus).toContain('dào')
  })

  it('概念焦点带出概览、引文与相关章号', () => {
    const focus = formatFocus({ kind: 'concept', concept: 'shui' })
    expect(focus).toContain('【当前位置】概念：水')
    expect(focus).toContain('相关章节：')
  })

  it('找不到的章或概念返回空串而不是把 null 拼进提示词', () => {
    expect(formatFocus({ kind: 'chapter', chapter: 999 })).toBe('')
    expect(formatFocus({ kind: 'concept', concept: '不存在' })).toBe('')
    expect(formatFocus({ kind: 'none' })).toBe('')
  })
})

describe('注音定位', () => {
  it('按选中句找到同一行的注音，并按选区裁剪掉没选的字', () => {
    const gloss = glossForSentence(1, '无名，天地之始')
    expect(gloss).not.toBeNull()
    expect(gloss!.map((token) => token.char).join('')).toBe('无名，天地之始')

    const full = glossForSentence(1, '无名，天地之始；有名，万物之母。')
    expect(full!.map((token) => token.char).join('')).toBe('无名，天地之始；有名，万物之母。')
  })

  it('原文里没有的句子返回 null', () => {
    expect(glossForSentence(1, '这句根本不在第一章里')).toBeNull()
    expect(glossForSentence(999, '道可道')).toBeNull()
  })
})

describe('消息装配', () => {
  it('system 在最前，提问在最后，焦点块并进末条 user', () => {
    const messages = buildAskMessages('「徼」怎么读？', { kind: 'chapter', chapter: 1, sentence: '常有欲，以观其徼' })
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toContain('【全书】')
    const last = messages[messages.length - 1]
    expect(last.role).toBe('user')
    expect(last.content).toContain('【当前位置】第1章 体道')
    expect(last.content).toContain('【提问】「徼」怎么读？')
  })

  it('没有焦点时末条就是提问本身', () => {
    const messages = buildAskMessages('这一章在讲什么？', { kind: 'none' })
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: '这一章在讲什么？' })
  })

  it('历史只保留最近六条，超出的旧消息丢掉', () => {
    const history: ChatMessage[] = Array.from({ length: 9 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `第${index}条`,
    }))
    const messages = buildAskMessages('继续', { kind: 'none' }, history)
    expect(messages).toHaveLength(1 + MAX_HISTORY_MESSAGES + 1)
    expect(messages[1].content).toBe('第3条')
    expect(messages[6].content).toBe('第8条')
  })

  it('历史里的空内容与 system 不参与拼接', () => {
    const history: ChatMessage[] = [
      { role: 'system', content: '旧的 system' },
      { role: 'user', content: '   ' },
      { role: 'assistant', content: '上一轮回答' },
    ]
    const messages = buildAskMessages('再问一句', { kind: 'none' }, history)
    expect(messages.filter((message) => message.role === 'system')).toHaveLength(1)
    expect(messages.map((message) => message.content)).not.toContain('   ')
    expect(messages[1]).toEqual({ role: 'assistant', content: '上一轮回答' })
  })

  it('省流模式下 system 变短、焦点块带正文', () => {
    const full = buildAskMessages('问', { kind: 'chapter', chapter: 8 })
    const economy = buildAskMessages('问', { kind: 'chapter', chapter: 8 }, [], { economy: true })
    expect(economy[0].content.length).toBeLessThan(full[0].content.length)
    expect(economy[economy.length - 1].content).toContain('上善若水')
  })
})

describe('种子问题', () => {
  it('从本章注释与概念生成，不调用模型', () => {
    const questions = seedQuestions(1)
    expect(questions).toHaveLength(3)
    expect(questions[0]).toBe('「道可道」该怎样理解？')
    expect(questions[2]).toContain('道')
  })

  it('章号不存在时返回空数组', () => {
    expect(seedQuestions(999)).toEqual([])
  })
})

describe('路由到焦点', () => {
  it('章页与背诵页都落到章', () => {
    expect(focusFromPath('/chapters/8')).toEqual({ kind: 'chapter', chapter: 8 })
    expect(focusFromPath('/memorize/81')).toEqual({ kind: 'chapter', chapter: 81 })
    expect(focusFromPath('/chapters/8/')).toEqual({ kind: 'chapter', chapter: 8 })
  })

  it('概念页落到概念', () => {
    expect(focusFromPath('/concepts/shui')).toEqual({ kind: 'concept', concept: 'shui' })
  })

  it('书里没有的章号与概念不冒充焦点', () => {
    expect(focusFromPath('/chapters/99')).toEqual({ kind: 'none' })
    expect(focusFromPath('/concepts/不存在')).toEqual({ kind: 'none' })
  })

  it('其余页面没有焦点', () => {
    expect(focusFromPath('/')).toEqual({ kind: 'none' })
    expect(focusFromPath('/chapters')).toEqual({ kind: 'none' })
    expect(focusFromPath('/practice')).toEqual({ kind: 'none' })
  })
})

describe('本地兜底章节', () => {
  it('自然语言的提问也能定位到章，而不是把整句当成一个词', () => {
    const chapters = fallbackChapters('上善若水是什么意思', { kind: 'none' })
    expect(chapters[0]?.number).toBe(8)
  })

  it('问句里没有可用线索时，退回当前章', () => {
    const chapters = fallbackChapters('这一章怎么理解', { kind: 'chapter', chapter: 33 })
    expect(chapters.map((chapter) => chapter.number)).toEqual([33])
  })

  it('既无线索也没有焦点时返回空数组，界面据此不渲染兜底块', () => {
    expect(fallbackChapters('嗯', { kind: 'none' })).toEqual([])
  })
})

import { describe, expect, it } from 'vitest'
import { chapters } from '../data/chapters'
import { getChapterGloss } from '../data/glosses'
import { chapterSpeechBody, chapterSpeechText, homophoneEntries, speechChar, SPEECH_KEEP_AS_IS } from './speech'

describe('朗读读音校正', () => {
  it('多音字按注音替换成同音字', () => {
    expect(speechChar('见', 'xiàn')).toBe('现')
    expect(speechChar('为', 'wéi')).toBe('维')
    expect(speechChar('夫', 'fú')).toBe('扶')
    // 同一个字不同读音要分别处理
    expect(speechChar('数', 'shuò')).toBe('朔')
    expect(speechChar('数', 'shǔ')).toBe('暑')
    expect(speechChar('数', 'shù')).toBe('数')
  })

  it('普通读音与缺省读音保持原字', () => {
    expect(speechChar('道', 'dào')).toBe('道')
    expect(speechChar('见', 'jiàn')).toBe('见')
    expect(speechChar('子', 'zǐ')).toBe('子')
    expect(speechChar('天')).toBe('天')
  })

  it('替字与目标读音同音，且不与保留项冲突', () => {
    const keep = new Set<string>(SPEECH_KEEP_AS_IS)
    homophoneEntries().forEach(([key, replacement]) => {
      expect(key).toContain('|')
      expect(replacement.length).toBe(1)
      expect(replacement).not.toBe(key.split('|')[0])
      expect(keep.has(key)).toBe(false)
    })
  })

  it('第一章朗读把「不见可欲」的见读成 xiàn', () => {
    const chapter = chapters.find((item) => item.number === 3)!
    const body = chapterSpeechBody(chapter)
    expect(body).toContain('不现可欲')
    expect(body).not.toContain('不见可欲')
    // 其余文字保持不变，只是替换了需要校正的字
    expect(body.length).toBe(chapter.text.join('').length)
  })

  it('整章朗读文本包含章号与章题', () => {
    const chapter = chapters.find((item) => item.number === 3)!
    const text = chapterSpeechText(chapter)
    expect(text.startsWith('第3章，安民。')).toBe(true)
    expect(text).toContain('不现可欲')
  })

  it('八十一章朗读文本长度与原文一致', () => {
    chapters.forEach((chapter) => {
      const body = chapterSpeechBody(chapter)
      expect(body.length).toBe(chapter.text.join('').length)
    })
  })

  it('校正表里的每个字在书中都按该读音出现过', () => {
    const seen = new Set<string>()
    chapters.forEach((chapter) => {
      const gloss = getChapterGloss(chapter.number)
      gloss?.forEach((line) => {
        line.forEach((token) => {
          if (token.pinyin) seen.add(`${token.char}|${token.pinyin}`)
        })
      })
    })
    homophoneEntries().forEach(([key]) => {
      expect(seen.has(key), `${key} 在书中从未出现`).toBe(true)
    })
  })
})

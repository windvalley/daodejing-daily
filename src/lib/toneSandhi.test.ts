import { describe, expect, it } from 'vitest'
import { chapters } from '../data/chapters'
import { getChapterGloss } from '../data/glosses'
import { applyToneSandhi, changeTone, countSandhi, sandhiOf, toneOf } from './toneSandhi'

describe('变调规则', () => {
  it('能读出拼音的调号', () => {
    expect(toneOf('bù')).toBe(4)
    expect(toneOf('bú')).toBe(2)
    expect(toneOf('zhì')).toBe(4)
    expect(toneOf('kě')).toBe(3)
    expect(toneOf('yī')).toBe(1)
    expect(toneOf('de')).toBe(5)
    expect(toneOf()).toBeUndefined()
  })

  it('能改写拼音的调号', () => {
    expect(changeTone('bù', 2)).toBe('bú')
    expect(changeTone('yī', 4)).toBe('yì')
    expect(changeTone('yī', 2)).toBe('yí')
    expect(changeTone('zhì', 1)).toBe('zhī')
  })

  it('「不」在四声前变阳平', () => {
    const line = [
      { char: '不', pinyin: 'bù', gloss: '副词。表否定。' },
      { char: '治', pinyin: 'zhì', gloss: '动词。治理。' },
    ]
    expect(sandhiOf(line, 0)).toBe('bú')
  })

  it('「不」在非四声前保持本调', () => {
    const line = [
      { char: '不', pinyin: 'bù', gloss: '副词。表否定。' },
      { char: '争', pinyin: 'zhēng', gloss: '动词。争夺。' },
    ]
    expect(sandhiOf(line, 0)).toBeUndefined()
  })

  it('「一」只在作数词修饰名词时变调', () => {
    const numeral = [
      { char: '一', pinyin: 'yī', gloss: '数词。一个。' },
      { char: '毂', pinyin: 'gǔ', gloss: '名词。车轮中心的圆木。' },
    ]
    expect(sandhiOf(numeral, 0)).toBe('yì')

    const asDao = [
      { char: '一', pinyin: 'yī', gloss: '名词。指道，持守不散。' },
      { char: '为', pinyin: 'wéi', gloss: '动词。作为、成为。' },
    ]
    expect(sandhiOf(asDao, 0)).toBeUndefined()
  })

  it('标点会截断变调', () => {
    const line = [{ char: '不', pinyin: 'bù', gloss: '副词。表否定。' }, { char: '，' }]
    expect(sandhiOf(line, 0)).toBeUndefined()
  })

  it('整章应用后「则无不治」的「不」变为 bú', () => {
    const chapter = chapters.find((item) => item.number === 3)!
    const adjusted = applyToneSandhi(getChapterGloss(chapter.number)!)
    const flat = adjusted.flat()
    const index = flat.findIndex((token, i) => token.char === '不' && flat[i + 1]?.char === '治')
    expect(flat[index].pinyin).toBe('bú')
    expect(flat[index].hint).toBe('变调')
  })

  it('全书变调数量稳定，且不会改动其他字', () => {
    let total = 0
    chapters.forEach((chapter) => {
      const stored = getChapterGloss(chapter.number)!
      const adjusted = applyToneSandhi(stored)
      total += countSandhi(stored)
      // 结构不能变，只有「不」「一」的读音可以变
      expect(adjusted.length).toBe(stored.length)
      adjusted.forEach((line, lineIndex) => {
        line.forEach((token, tokenIndex) => {
          const before = stored[lineIndex][tokenIndex]
          expect(token.char).toBe(before.char)
          if (token.pinyin !== before.pinyin) {
            expect(['不', '一']).toContain(token.char)
          }
        })
      })
    })
    // 「不」在四声前 92 处，另有「共一毂」的「一」
    expect(total).toBe(93)
  })
})

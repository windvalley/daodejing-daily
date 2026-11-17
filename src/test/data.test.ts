import { beforeEach, describe, expect, it } from 'vitest'
import { chapters, getChapter, plainText, sections } from '../data/chapters'
import { concepts } from '../data/concepts'
import {
  actions,
  createDefaultData,
  exportData,
  getSnapshot,
  parseImport,
  sanitizeData,
  STORAGE_KEY,
} from '../lib/store'
import {
  dailyChapter,
  dailyChapterNumber,
  dueNumbers,
  practiceCountSince,
  recentActivity,
  streakDays,
} from '../lib/stats'
import { dayKey, monthStart } from '../lib/date'
import { searchChapters } from '../lib/search'
import { getChapterGloss, glossCharCount, glossMatchesChapter } from '../data/glosses'

beforeEach(() => {
  window.localStorage.clear()
  actions.replaceAll(createDefaultData())
})

describe('章节数据', () => {
  it('收录完整的八十一章且章号连续', () => {
    expect(chapters).toHaveLength(81)
    expect(chapters.map((chapter) => chapter.number)).toEqual(Array.from({ length: 81 }, (_, index) => index + 1))
  })

  it('每章都有原文、译文、章旨、注释与实践提示', () => {
    chapters.forEach((chapter) => {
      expect(chapter.title.length).toBeGreaterThan(0)
      expect(chapter.text.length).toBeGreaterThan(0)
      expect(chapter.translation.length).toBeGreaterThan(30)
      expect(chapter.gist.length).toBeGreaterThan(6)
      expect(chapter.notes.length).toBeGreaterThan(0)
      expect(chapter.practice.length).toBeGreaterThan(6)
      expect(plainText(chapter).length).toBeGreaterThan(20)
    })
  })

  it('道经三十七章、德经四十四章', () => {
    expect(chapters.filter((chapter) => chapter.section === 'dao')).toHaveLength(37)
    expect(chapters.filter((chapter) => chapter.section === 'de')).toHaveLength(44)
    expect(sections.map((section) => section.name)).toEqual(['道经', '德经'])
  })

  it('关键章句与通行本一致', () => {
    expect(plainText(getChapter(1)!)).toContain('道可道非常道名可名非常名')
    expect(plainText(getChapter(8)!)).toContain('上善若水')
    expect(plainText(getChapter(33)!)).toContain('知人者智自知者明')
    expect(plainText(getChapter(81)!)).toContain('天之道利而不害圣人之道为而不争')
  })

  it('每章的概念引用都指向存在的章节', () => {
    concepts.forEach((concept) => {
      expect(concept.chapters.length).toBeGreaterThan(0)
      concept.chapters.forEach((number) => {
        expect(getChapter(number)).toBeDefined()
      })
      concept.quotes.forEach((quote) => {
        expect(plainText(getChapter(quote.chapter)!)).toContain(quote.text.replace(/[，。；：！？、“”‘’]/g, ''))
      })
    })
  })

  it('译文不与注释、章旨的训释相左', () => {
    // 「不仁」是不偏私施恩，不是没有仁爱；「刍狗」不是弃绝万物
    const chapter5 = getChapter(5)!
    expect(chapter5.translation).toContain('不偏私')
    expect(chapter5.translation).not.toContain('不施仁爱')
    expect(chapter5.translation).not.toContain('自生自灭')

    // 「蔽不新成」从底本读作安于敝旧，不取「蔽而新成」
    const chapter15 = getChapter(15)!
    expect(chapter15.translation).not.toContain('去故更新')
    expect(chapter15.gist).not.toContain('去故更新')

    // 「长生久视」的「视」是存活，不是观照
    expect(getChapter(59)!.translation).toContain('长久存活')
  })
})

describe('注音与逐字解析', () => {
  const HAN = /^\p{Script=Han}$/u
  const PINYIN = /^[a-zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+$/

  it('八十一章都录入了注音，且与原文逐句逐字对齐', () => {
    const glossed = chapters.filter((chapter) => getChapterGloss(chapter.number))
    expect(glossed).toHaveLength(81)
    glossed.forEach((chapter) => {
      const gloss = getChapterGloss(chapter.number)!
      expect(glossMatchesChapter(gloss, chapter)).toBe(true)
      expect(glossCharCount(gloss)).toBe(plainText(chapter).length)
    })
  })

  it('汉字都有带声调拼音与释义，标点不注', () => {
    chapters.forEach((chapter) => {
      const gloss = getChapterGloss(chapter.number)!
      gloss.forEach((line) => {
        line.forEach((token) => {
          expect(Array.from(token.char)).toHaveLength(1)
          if (HAN.test(token.char)) {
            expect(token.pinyin).toMatch(PINYIN)
            // 释义统一写成「词性。释义。」，便于逐字阅读
            expect(token.gloss).toMatch(/^[\u4e00-\u9fff]{2,8}。[\s\S]{2,}$/)
            // 通假、旧读之类的提示要短，写成长句说明应并入释义
            expect(token.hint?.length ?? 0).toBeLessThanOrEqual(8)
          } else {
            expect(token.pinyin).toBeUndefined()
            expect(token.gloss).toBeUndefined()
            expect(token.hint).toBeUndefined()
          }
        })
      })
    })
  })

  it('每句都以带拼音的汉字开头，句首不会出现标点', () => {
    // 章页把标点并入它前面的字再禁止换行，行首标点没有前字可挂靠，会退回可断行的旧行为
    chapters.forEach((chapter) => {
      const gloss = getChapterGloss(chapter.number)!
      gloss.forEach((line) => {
        expect(line[0].pinyin).toBeDefined()
      })
    })
  })
})

describe('store', () => {
  it('默认数据为空且带默认设置', () => {
    const data = getSnapshot()
    expect(data.progress).toEqual({})
    expect(data.settings.theme).toBe('system')
  })

  it('标记已读会写入时间并累计今日活动', () => {
    actions.setRead(8, true)
    const data = getSnapshot()
    expect(data.progress[8].read).toBe(true)
    expect(data.progress[8].readAt).toBeTypeOf('number')
    expect(data.activity[dayKey()]?.read).toBe(1)
    actions.setRead(8, true)
    expect(getSnapshot().activity[dayKey()]?.read).toBe(1)
    actions.setRead(8, false)
    expect(getSnapshot().progress[8].read).toBe(false)
    expect(getSnapshot().progress[8].readAt).toBeNull()
  })

  it('收藏可切换', () => {
    actions.toggleFavorite(11)
    expect(getSnapshot().progress[11].favorite).toBe(true)
    actions.toggleFavorite(11)
    expect(getSnapshot().progress[11].favorite).toBe(false)
  })

  it('背诵达到 60 分会自动加入复习队列', () => {
    actions.recordRecite(8, 55, 'fill')
    expect(getSnapshot().review[8]).toBeUndefined()
    actions.recordRecite(8, 88, 'write')
    const record = getSnapshot().review[8]
    expect(record).toBeDefined()
    expect(getSnapshot().recite[8].mastered).toBe(true)
    expect(getSnapshot().recite[8].bestScore).toBe(88)
  })

  it('复习评分会更新到期时间与今日复习数', () => {
    actions.addToReview(8)
    const before = getSnapshot().review[8].dueAt
    actions.gradeReview(8, 2)
    const after = getSnapshot().review[8]
    expect(after.dueAt).toBeGreaterThan(before)
    expect(getSnapshot().activity[dayKey()]?.review).toBe(1)
  })

  it('笔记为空时删除条目', () => {
    actions.savePractice(8, '今天让了一次路。')
    expect(getSnapshot().practice[8].text).toBe('今天让了一次路。')
    actions.savePractice(8, '   ')
    expect(getSnapshot().practice[8]).toBeUndefined()
  })

  it('朗读音色默认跟随系统，可保存音色 URI', () => {
    expect(getSnapshot().settings.speechVoiceURI).toBeNull()
    actions.updateSettings({ speechVoiceURI: 'cmn-cn-x-cce-local' })
    expect(getSnapshot().settings.speechVoiceURI).toBe('cmn-cn-x-cce-local')
    // 清空即回到跟随系统
    actions.updateSettings({ speechVoiceURI: null })
    expect(getSnapshot().settings.speechVoiceURI).toBeNull()
    // 非法值退回默认
    actions.updateSettings({ speechVoiceURI: 42 as never })
    expect(getSnapshot().settings.speechVoiceURI).toBeNull()
  })

  it('朗读音色三档默认系统原声，非法值退回默认', () => {
    expect(getSnapshot().settings.speechTimbre).toBe('normal')
    actions.updateSettings({ speechTimbre: 'low' })
    expect(getSnapshot().settings.speechTimbre).toBe('low')
    actions.updateSettings({ speechTimbre: 'bright' })
    expect(getSnapshot().settings.speechTimbre).toBe('bright')
    actions.updateSettings({ speechTimbre: 'robot' as never })
    expect(getSnapshot().settings.speechTimbre).toBe('normal')
  })

  it('设置写入后会被规范化', () => {
    actions.updateSettings({ fontSize: 100, dailyReviewGoal: -3, theme: 'dark' })
    const settings = getSnapshot().settings
    expect(settings.fontSize).toBe(24)
    expect(settings.dailyReviewGoal).toBe(1)
    expect(settings.theme).toBe('dark')
  })

  it('每次修改都会写入 localStorage', () => {
    actions.toggleFavorite(3)
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    expect(JSON.parse(raw!).progress['3'].favorite).toBe(true)
  })

  it('清除学习数据保留设置', () => {
    actions.updateSettings({ theme: 'dark' })
    actions.setRead(1, true)
    actions.resetLearningData()
    const data = getSnapshot()
    expect(data.progress).toEqual({})
    expect(data.settings.theme).toBe('dark')
  })
})

describe('sanitizeData', () => {
  it('忽略非法章节号与脏字段', () => {
    const clean = sanitizeData({
      progress: { 0: { read: true }, 99: { read: true }, 5: { read: 'yes', favorite: true } },
      practice: { 5: { text: '   ' }, 6: { text: '写一条', updatedAt: 1 } },
      recite: { 7: { attempts: -2, bestScore: 400, lastScore: 66, mastered: 'x' } },
      activity: { 'not-a-date': { read: 3 }, '2026-11-12': { read: 2, review: 1 } },
    })
    expect(Object.keys(clean.progress)).toEqual(['5'])
    expect(clean.progress[5].read).toBe(false)
    expect(clean.progress[5].favorite).toBe(true)
    expect(Object.keys(clean.practice)).toEqual(['6'])
    expect(clean.recite[7].attempts).toBe(0)
    expect(clean.recite[7].bestScore).toBe(100)
    expect(clean.recite[7].mastered).toBe(false)
    expect(Object.keys(clean.activity)).toEqual(['2026-11-12'])
  })

  it('完全无效的输入回退为默认数据', () => {
    expect(sanitizeData(null).progress).toEqual({})
    expect(sanitizeData('学道').settings.theme).toBe('system')
  })
})

describe('导入导出', () => {
  it('备份可以完整往返', () => {
    actions.setRead(2, true)
    actions.savePractice(2, '少说一句。')
    actions.recordRecite(2, 92, 'hint')
    const text = exportData()
    const parsed = parseImport(text)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.data.progress[2].read).toBe(true)
    expect(parsed.data.practice[2].text).toBe('少说一句。')
    expect(parsed.data.recite[2].bestScore).toBe(92)
  })

  it('损坏的文件给出可读错误', () => {
    const result = parseImport('{不是 json')
    expect(result.ok).toBe(false)
  })

  it('没有学习数据的 JSON 会被拒绝', () => {
    const result = parseImport(JSON.stringify({ hello: 'world' }))
    expect(result.ok).toBe(false)
  })
})

describe('搜索', () => {
  it('原文检索命中对应章节', () => {
    const results = searchChapters('上善若水')
    expect(results[0]?.chapter.number).toBe(8)
    expect(results[0]?.field).toBe('原文')
  })

  it('支持译文与注释检索', () => {
    const results = searchChapters('水善利万物')
    expect(results.map((result) => result.chapter.number)).toContain(8)
  })

  it('多关键词按相关度排序，空查询返回空', () => {
    expect(searchChapters('   ')).toEqual([])
    const results = searchChapters('无为 治国')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0].chapter.number).toBeGreaterThan(0)
  })
})

describe('统计', () => {
  it('每日推荐固定在 1 至 81 之间，且同一天稳定', () => {
    const date = new Date(2026, 10, 12)
    const first = dailyChapterNumber(date)
    expect(first).toBeGreaterThanOrEqual(1)
    expect(first).toBeLessThanOrEqual(81)
    expect(dailyChapterNumber(new Date(2026, 10, 12, 23, 59))).toBe(first)
    expect(dailyChapter(date).number).toBe(first)
  })

  it('每日推荐逐日推进，81 天正好走完一轮', () => {
    const start = new Date(2026, 0, 1)
    const numbers: number[] = []
    for (let offset = 0; offset < 82; offset += 1) {
      const date = new Date(start)
      date.setDate(date.getDate() + offset)
      numbers.push(dailyChapterNumber(date))
    }
    const cycle = numbers.slice(0, 81)
    // 一轮里不重不漏，相邻两天只能 +1 或从 81 回到 1
    expect(new Set(cycle).size).toBe(81)
    for (let index = 1; index < cycle.length; index += 1) {
      expect(cycle[index]).toBe(cycle[index - 1] === 81 ? 1 : cycle[index - 1] + 1)
    }
    expect(numbers[81]).toBe(numbers[0])
  })

  it('2024 年之前的日期仍落在 1 至 81 之间', () => {
    expect(dailyChapterNumber(new Date(2023, 11, 31))).toBe(81)
    expect(dailyChapterNumber(new Date(2023, 11, 30))).toBe(80)
  })

  it('轮转起点仍是 2024-01-01 的第 1 章', () => {
    expect(dailyChapterNumber(new Date(2024, 0, 1))).toBe(1)
    expect(dailyChapterNumber(new Date(2024, 0, 2))).toBe(2)
  })

  it('连续天数会把今天未学习的情况回退到昨天', () => {
    const today = new Date(2026, 10, 12, 10)
    const yesterday = new Date(2026, 10, 11, 10)
    const dayBefore = new Date(2026, 10, 10, 10)
    actions.replaceAll({
      ...createDefaultData(),
      activity: {
        [dayKey(yesterday)]: { read: 1, recite: 0, review: 0, practice: 0 },
        [dayKey(dayBefore)]: { read: 0, recite: 1, review: 0, practice: 0 },
      },
    })
    expect(streakDays(getSnapshot(), today.getTime())).toBe(2)
  })

  it('到期队列按到期时间排序', () => {
    const now = Date.now()
    actions.replaceAll({
      ...createDefaultData(),
      review: {
        9: { ease: 2.5, intervalDays: 0, dueAt: now - 1000, reps: 0, lapses: 0, lastGrade: 2, lastAt: now },
        3: { ease: 2.5, intervalDays: 0, dueAt: now - 9000, reps: 0, lapses: 0, lastGrade: 2, lastAt: now },
        5: { ease: 2.5, intervalDays: 4, dueAt: now + 86400000, reps: 1, lapses: 0, lastGrade: 2, lastAt: now },
      },
    })
    expect(dueNumbers(getSnapshot(), now)).toEqual([3, 9])
  })
})

describe('学习轨迹对齐', () => {
  it('前面补位后总格数是 7 的倍数', () => {
    const cells = recentActivity(getSnapshot(), 28, new Date(2026, 10, 12).getTime())
    expect(cells.length % 7).toBe(0)
    expect(cells.filter((cell) => !cell.placeholder)).toHaveLength(28)
  })

  it('补位格不计入活动', () => {
    const cells = recentActivity(getSnapshot(), 35, new Date(2026, 10, 12).getTime())
    expect(cells.filter((cell) => cell.placeholder).every((cell) => cell.count === 0)).toBe(true)
  })

  it('近 35 天是连续日历日，末格就是今天', () => {
    const cells = recentActivity(getSnapshot(), 35, new Date(2026, 10, 12, 10).getTime())
    const keys = cells.filter((cell) => !cell.placeholder).map((cell) => dayKey(cell.date))
    expect(keys).toHaveLength(35)
    expect(new Set(keys).size).toBe(35)
    expect(keys[keys.length - 1]).toBe('2026-11-12')
  })
})

describe('本月笔记统计', () => {
  it('只统计本月写入的笔记', () => {
    const now = new Date(2026, 10, 12, 10).getTime()
    const early = new Date(2026, 10, 1, 9).getTime()
    const lastMonth = new Date(2026, 9, 28, 9).getTime()
    actions.savePractice(8, '本月笔记')
    const data = getSnapshot()
    data.practice[8].updatedAt = early
    data.practice[11] = { text: '上月笔记', updatedAt: lastMonth }
    expect(practiceCountSince(data, monthStart(now))).toBe(1)
    expect(monthStart(now)).toBe(new Date(2026, 10, 1).getTime())
  })
})

import { chapters, type Chapter } from '../data/chapters'
import { DAY_MS, dayKey, startOfDay } from './date'
import type { AppData, DayActivity } from './store'

const DAILY_EPOCH = startOfDay(new Date(2024, 0, 1))

/** 每天推荐一章，按 81 天循环 */
export function dailyChapterNumber(date: Date = new Date()): number {
  const offset = Math.floor((startOfDay(date) - DAILY_EPOCH) / DAY_MS)
  return (((offset % 81) + 81) % 81) + 1
}

export function dailyChapter(date: Date = new Date()): Chapter {
  return chapters[dailyChapterNumber(date) - 1]
}

/**
 * 每日一句：优先取当日章节里第一句完整、且不过长的句子。
 * 只取逗号片段会读起来像半句话，所以以句号、问号、叹号为界。
 */
export function dailyQuote(date: Date = new Date()): { chapter: number; text: string } {
  const chapter = dailyChapter(date)
  const sentences = chapter.text
    .flatMap((paragraph) => paragraph.split(/(?<=[。！？])/))
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  const suitable = sentences.find((sentence) => {
    const length = sentence.replace(/[，。；：！？]/g, '').length
    return length >= 8 && length <= 34
  })
  return { chapter: chapter.number, text: suitable ?? sentences[0] ?? chapter.text[0] }
}

export function readCount(data: AppData): number {
  return Object.values(data.progress).filter((progress) => progress.read).length
}

export function favoriteNumbers(data: AppData): number[] {
  return Object.entries(data.progress)
    .filter(([, progress]) => progress.favorite)
    .map(([key]) => Number(key))
    .sort((a, b) => a - b)
}

export function practiceNumbers(data: AppData): number[] {
  return Object.entries(data.practice)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .map(([key]) => Number(key))
}

export function reciteNumbers(data: AppData): number[] {
  return Object.keys(data.recite)
    .map(Number)
    .sort((a, b) => a - b)
}

export function dueNumbers(data: AppData, now = Date.now()): number[] {
  return Object.entries(data.review)
    .filter(([, record]) => record.dueAt <= now)
    .sort((a, b) => a[1].dueAt - b[1].dueAt)
    .map(([key]) => Number(key))
}

export function nextDueAt(data: AppData, now = Date.now()): number | null {
  const upcoming = Object.values(data.review)
    .filter((record) => record.dueAt > now)
    .map((record) => record.dueAt)
  return upcoming.length ? Math.min(...upcoming) : null
}

/** 本月某一天起写入的笔记条数，用于实践页概览 */
export function practiceCountSince(data: AppData, since: number): number {
  return Object.values(data.practice).filter((entry) => entry.updatedAt >= since).length
}

export function todayActivity(data: AppData, date: Date = new Date()): DayActivity {
  return data.activity[dayKey(date)] ?? { read: 0, recite: 0, review: 0, practice: 0 }
}

export function streakDays(data: AppData, now = Date.now()): number {
  const cursor = new Date(now)
  if (!data.activity[dayKey(cursor)]) {
    cursor.setDate(cursor.getDate() - 1)
  }
  let streak = 0
  for (let guard = 0; guard < 3650; guard += 1) {
    const activity = data.activity[dayKey(cursor)]
    const total = activity ? activity.read + activity.recite + activity.review + activity.practice : 0
    if (total <= 0) break
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface Stats {
  read: number
  total: number
  favorites: number
  practices: number
  recited: number
  mastered: number
  due: number
  streak: number
  todayRead: number
  todayReview: number
  todayRecite: number
  todayPractice: number
  nextDue: number | null
}

export function getStats(data: AppData, now = Date.now()): Stats {
  const today = todayActivity(data, new Date(now))
  return {
    read: readCount(data),
    total: chapters.length,
    favorites: favoriteNumbers(data).length,
    practices: practiceNumbers(data).length,
    recited: reciteNumbers(data).length,
    mastered: Object.values(data.recite).filter((record) => record.mastered).length,
    due: dueNumbers(data, now).length,
    streak: streakDays(data, now),
    todayRead: today.read,
    todayReview: today.review,
    todayRecite: today.recite,
    todayPractice: today.practice,
    nextDue: nextDueAt(data, now),
  }
}

export function activityLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0
  if (count <= 2) return 1
  if (count <= 5) return 2
  return 3
}

export interface HeatmapCell {
  key: string
  date: Date
  count: number
  level: 0 | 1 | 2 | 3
  /** 补位格，用于让每周从周一开始对齐 */
  placeholder?: boolean
}

/**
 * 最近若干天的活动热力数据，供今日页和统计使用。
 * 以周一为一周起点，前面补空格，使每一列对应同一个星期几。
 */
export function recentActivity(data: AppData, days = 28, now = Date.now()): HeatmapCell[] {
  const cells: HeatmapCell[] = []
  const end = startOfDay(now)
  const start = end - (days - 1) * DAY_MS
  const leading = (new Date(start).getDay() + 6) % 7
  for (let index = 0; index < leading; index += 1) {
    cells.push({ key: `pad-${index}`, date: new Date(start), count: 0, level: 0, placeholder: true })
  }
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(end - offset * DAY_MS)
    const activity = data.activity[dayKey(date)]
    const count = activity ? activity.read + activity.recite + activity.review + activity.practice : 0
    cells.push({ key: dayKey(date), date, count, level: activityLevel(count) })
  }
  // 末尾补齐，让每一行都是完整的一周
  while (cells.length % 7 !== 0) {
    cells.push({ key: `pad-end-${cells.length}`, date: new Date(end), count: 0, level: 0, placeholder: true })
  }
  return cells
}

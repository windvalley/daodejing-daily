import { dayKey } from '../lib/date'
import { initialReview, scheduleReview, type Grade, type ReviewRecord } from '../lib/srs'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  theme: ThemeMode
  /** 正文字号，单位 px */
  fontSize: number
  /** 原文使用宋体 */
  serif: boolean
  /** 朗读语速 */
  speechRate: number
  /** 章页默认展开译文 */
  showTranslation: boolean
  /** 章页原文显示拼音 */
  showPinyin: boolean
  /** 每日复习目标 */
  dailyReviewGoal: number
}

export interface ChapterProgress {
  read: boolean
  readAt: number | null
  favorite: boolean
}

export interface PracticeEntry {
  text: string
  updatedAt: number
}

export interface ReciteRecord {
  attempts: number
  bestScore: number
  lastScore: number
  lastAt: number
  mastered: boolean
  lastMode: string
}

export type { Grade, ReviewRecord }

export interface DayActivity {
  read: number
  recite: number
  review: number
  practice: number
}

export interface AppData {
  version: 1
  createdAt: number
  settings: Settings
  progress: Record<number, ChapterProgress>
  practice: Record<number, PracticeEntry>
  recite: Record<number, ReciteRecord>
  review: Record<number, ReviewRecord>
  activity: Record<string, DayActivity>
}

export const STORAGE_KEY = 'daodejing.data.v1'

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  fontSize: 18,
  serif: true,
  speechRate: 0.9,
  showTranslation: true,
  showPinyin: true,
  dailyReviewGoal: 10,
}

export function createDefaultData(now = Date.now()): AppData {
  return {
    version: 1,
    createdAt: now,
    settings: { ...DEFAULT_SETTINGS },
    progress: {},
    practice: {},
    recite: {},
    review: {},
    activity: {},
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validChapterNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(number) && number >= 1 && number <= 81 ? number : null
}

function sanitizeSettings(input: unknown): Settings {
  if (!isRecord(input)) return { ...DEFAULT_SETTINGS }
  const theme: ThemeMode =
    input.theme === 'light' || input.theme === 'dark' || input.theme === 'system' ? input.theme : DEFAULT_SETTINGS.theme
  return {
    theme,
    fontSize: clamp(Number(input.fontSize) || DEFAULT_SETTINGS.fontSize, 15, 24),
    serif: typeof input.serif === 'boolean' ? input.serif : DEFAULT_SETTINGS.serif,
    speechRate: clamp(Number(input.speechRate) || DEFAULT_SETTINGS.speechRate, 0.5, 1.5),
    showTranslation:
      typeof input.showTranslation === 'boolean' ? input.showTranslation : DEFAULT_SETTINGS.showTranslation,
    showPinyin: typeof input.showPinyin === 'boolean' ? input.showPinyin : DEFAULT_SETTINGS.showPinyin,
    dailyReviewGoal: clamp(Math.round(Number(input.dailyReviewGoal) || DEFAULT_SETTINGS.dailyReviewGoal), 1, 30),
  }
}

/** 把任意来源的数据整理成可用的结构，丢弃非法章节和字段 */
export function sanitizeData(input: unknown, now = Date.now()): AppData {
  const base = createDefaultData(now)
  if (!isRecord(input)) return base
  const source = isRecord(input.data) ? input.data : input

  const data: AppData = {
    ...base,
    settings: sanitizeSettings(source.settings),
    createdAt: typeof source.createdAt === 'number' ? source.createdAt : base.createdAt,
  }

  if (isRecord(source.progress)) {
    Object.entries(source.progress).forEach(([key, value]) => {
      const number = validChapterNumber(key)
      if (!number || !isRecord(value)) return
      data.progress[number] = {
        read: value.read === true,
        readAt: typeof value.readAt === 'number' ? value.readAt : null,
        favorite: value.favorite === true,
      }
    })
  }

  if (isRecord(source.practice)) {
    Object.entries(source.practice).forEach(([key, value]) => {
      const number = validChapterNumber(key)
      if (!number || !isRecord(value) || typeof value.text !== 'string' || !value.text.trim()) return
      data.practice[number] = {
        text: value.text.slice(0, 20000),
        updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
      }
    })
  }

  if (isRecord(source.recite)) {
    Object.entries(source.recite).forEach(([key, value]) => {
      const number = validChapterNumber(key)
      if (!number || !isRecord(value)) return
      data.recite[number] = {
        attempts: Math.max(0, Math.round(Number(value.attempts) || 0)),
        bestScore: clamp(Math.round(Number(value.bestScore) || 0), 0, 100),
        lastScore: clamp(Math.round(Number(value.lastScore) || 0), 0, 100),
        lastAt: typeof value.lastAt === 'number' ? value.lastAt : now,
        mastered: value.mastered === true,
        lastMode: typeof value.lastMode === 'string' ? value.lastMode : 'hint',
      }
    })
  }

  if (isRecord(source.review)) {
    Object.entries(source.review).forEach(([key, value]) => {
      const number = validChapterNumber(key)
      if (!number || !isRecord(value)) return
      const grade = Number(value.lastGrade)
      data.review[number] = {
        ease: clamp(Number(value.ease) || 2.5, 1.3, 2.8),
        intervalDays: Math.max(0, Number(value.intervalDays) || 0),
        dueAt: typeof value.dueAt === 'number' ? value.dueAt : now,
        reps: Math.max(0, Math.round(Number(value.reps) || 0)),
        lapses: Math.max(0, Math.round(Number(value.lapses) || 0)),
        lastGrade: (grade >= 0 && grade <= 3 ? grade : 2) as Grade,
        lastAt: typeof value.lastAt === 'number' ? value.lastAt : now,
      }
    })
  }

  if (isRecord(source.activity)) {
    Object.entries(source.activity).forEach(([key, value]) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !isRecord(value)) return
      const read = Math.max(0, Math.round(Number(value.read) || 0))
      const recite = Math.max(0, Math.round(Number(value.recite) || 0))
      const review = Math.max(0, Math.round(Number(value.review) || 0))
      const practice = Math.max(0, Math.round(Number(value.practice) || 0))
      if (read + recite + review + practice > 0) data.activity[key] = { read, recite, review, practice }
    })
  }

  return data
}

function loadInitial(): AppData {
  if (typeof window === 'undefined') return createDefaultData()
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultData()
    return sanitizeData(JSON.parse(raw))
  } catch {
    return createDefaultData()
  }
}

let state: AppData = loadInitial()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

function persist(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch (error) {
    console.error('保存学习数据失败', error)
  }
}

function commit(next: AppData): void {
  state = next
  persist()
  emit()
}

function update(updater: (draft: AppData) => void): void {
  const draft = JSON.parse(JSON.stringify(state)) as AppData
  updater(draft)
  commit(draft)
}

function bumpActivity(draft: AppData, kind: keyof DayActivity, amount = 1): void {
  const key = dayKey()
  const current = draft.activity[key] ?? { read: 0, recite: 0, review: 0, practice: 0 }
  draft.activity[key] = { ...current, [kind]: current[kind] + amount }
}

function setProgress(draft: AppData, number: number, patch: Partial<ChapterProgress>): void {
  const current = draft.progress[number] ?? { read: false, readAt: null, favorite: false }
  draft.progress[number] = { ...current, ...patch }
}

export const actions = {
  setRead(number: number, read: boolean): void {
    update((draft) => {
      const current = draft.progress[number]
      const wasRead = current?.read === true
      setProgress(draft, number, { read, readAt: read ? (current?.readAt ?? Date.now()) : null })
      if (read && !wasRead) bumpActivity(draft, 'read')
    })
  },

  toggleFavorite(number: number): void {
    update((draft) => {
      const current = draft.progress[number] ?? { read: false, readAt: null, favorite: false }
      setProgress(draft, number, { favorite: !current.favorite })
    })
  },

  savePractice(number: number, text: string): void {
    const trimmed = text.trim()
    update((draft) => {
      const previous = draft.practice[number]
      if (!trimmed) {
        delete draft.practice[number]
        return
      }
      draft.practice[number] = { text: trimmed.slice(0, 20000), updatedAt: Date.now() }
      if (previous?.text !== trimmed) bumpActivity(draft, 'practice')
    })
  },

  deletePractice(number: number): void {
    update((draft) => {
      delete draft.practice[number]
    })
  },

  recordRecite(number: number, score: number, mode: string): void {
    const safeScore = clamp(Math.round(score), 0, 100)
    update((draft) => {
      const now = Date.now()
      const previous = draft.recite[number]
      draft.recite[number] = {
        attempts: (previous?.attempts ?? 0) + 1,
        bestScore: Math.max(previous?.bestScore ?? 0, safeScore),
        lastScore: safeScore,
        lastAt: now,
        mastered: (previous?.mastered ?? false) || safeScore >= 85,
        lastMode: mode,
      }
      bumpActivity(draft, 'recite')
      if (safeScore >= 60 && !draft.review[number]) {
        draft.review[number] = initialReview(now)
      }
    })
  },

  addToReview(number: number): void {
    update((draft) => {
      if (draft.review[number]) {
        draft.review[number] = { ...draft.review[number], dueAt: Date.now() }
      } else {
        draft.review[number] = { ...initialReview(), dueAt: Date.now() }
      }
    })
  },

  gradeReview(number: number, grade: Grade): void {
    update((draft) => {
      draft.review[number] = scheduleReview(draft.review[number], grade)
      bumpActivity(draft, 'review')
    })
  },

  updateSettings(patch: Partial<Settings>): void {
    update((draft) => {
      draft.settings = sanitizeSettings({ ...draft.settings, ...patch })
    })
  },

  resetLearningData(): void {
    update((draft) => {
      draft.progress = {}
      draft.practice = {}
      draft.recite = {}
      draft.review = {}
      draft.activity = {}
    })
  },

  resetSettings(): void {
    update((draft) => {
      draft.settings = { ...DEFAULT_SETTINGS }
    })
  },

  replaceAll(data: AppData): void {
    commit({ ...data, version: 1 })
  },
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getSnapshot(): AppData {
  return state
}

export function exportData(): string {
  return JSON.stringify(
    {
      app: 'daodejing',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: state,
    },
    null,
    2,
  )
}

export function parseImport(text: string): { ok: true; data: AppData } | { ok: false; error: string } {
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed)) return { ok: false, error: '备份内容不是有效的 JSON 对象。' }
    const candidate = isRecord(parsed.data) ? parsed.data : parsed
    if (!isRecord(candidate.progress) && !isRecord(candidate.settings) && !isRecord(candidate.review)) {
      return { ok: false, error: '没有找到可导入的学习数据。' }
    }
    return { ok: true, data: sanitizeData(candidate) }
  } catch {
    return { ok: false, error: '无法解析这个文件，请确认它是本站导出的 JSON 备份。' }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      state = sanitizeData(JSON.parse(event.newValue))
      emit()
    } catch {
      // 忽略其他标签页写入的残缺数据
    }
  })
}

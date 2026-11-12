export type Section = 'dao' | 'de'

export interface ChapterNote {
  term: string
  text: string
}

export interface Chapter {
  /** 章号，1 至 81 */
  number: number
  /** 河上公章题，如「体道」 */
  title: string
  section: Section
  /** 原文，按句分段 */
  text: string[]
  /** 一句话章旨 */
  gist: string
  /** 白话译文 */
  translation: string
  /** 重点字词注释 */
  notes: ChapterNote[]
  /** 一句可执行的实践提示 */
  practice: string
  /** 关联的概念 slug */
  concepts: string[]
}

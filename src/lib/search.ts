import { chapters, type Chapter } from '../data/chapters'
import { normalize } from './memorize'

export interface SearchResult {
  chapter: Chapter
  score: number
  field: '原文' | '译文' | '注释' | '章旨' | '章题'
  snippet: string
}

interface Field {
  name: SearchResult['field']
  weight: number
  text: string
}

function fieldsOf(chapter: Chapter): Field[] {
  return [
    { name: '原文', weight: 6, text: chapter.text.join('') },
    { name: '章题', weight: 4, text: `第${chapter.number}章 ${chapter.title}` },
    { name: '译文', weight: 2, text: chapter.translation },
    { name: '章旨', weight: 2, text: chapter.gist },
    { name: '注释', weight: 1, text: chapter.notes.map((note) => `${note.term} ${note.text}`).join(' ') },
  ]
}

function makeSnippet(text: string, query: string): string {
  const index = text.indexOf(query)
  if (index < 0) return text.slice(0, 46) + (text.length > 46 ? '…' : '')
  const start = Math.max(0, index - 14)
  const end = Math.min(text.length, index + query.length + 26)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

/**
 * 本地全文检索：按空白拆分关键词，关键词命中越多的章节排得越前。
 * 原文命中权重最高，其次是章题、译文、章旨与注释。
 */
export function searchChapters(query: string, limit = 40): SearchResult[] {
  const terms = Array.from(new Set(query.trim().split(/\s+/).filter(Boolean)))
  if (!terms.length) return []

  const results: SearchResult[] = []
  chapters.forEach((chapter) => {
    const fields = fieldsOf(chapter).map((field) => ({ ...field, plain: normalize(field.text) }))
    let totalScore = 0
    let matchedTerms = 0
    let best: { field: Field; score: number } | null = null

    terms.forEach((term) => {
      const plainTerm = normalize(term)
      if (!plainTerm) return
      let termMatched = false
      fields.forEach((field) => {
        if (!field.plain.includes(plainTerm)) return
        termMatched = true
        const bonus = field.plain.startsWith(plainTerm) ? 2 : 1
        const score = field.weight * bonus
        totalScore += score
        if (!best || score > best.score) best = { field, score }
      })
      if (termMatched) matchedTerms += 1
    })

    if (matchedTerms === 0) return
    if (matchedTerms === terms.length) totalScore += 10
    totalScore += matchedTerms * 3
    const chosen = best as { field: Field; score: number } | null
    const rawTerm = terms.find((term) => normalize(chosen?.field.text ?? '').includes(normalize(term))) ?? terms[0]
    results.push({
      chapter,
      score: totalScore,
      field: chosen?.field.name ?? '原文',
      snippet: makeSnippet(chosen?.field.text ?? chapter.text[0], rawTerm),
    })
  })

  return results.sort((a, b) => b.score - a.score || a.chapter.number - b.chapter.number).slice(0, limit)
}

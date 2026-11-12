import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChapterCard } from '../components/ChapterCard'
import { Icon } from '../components/Icon'
import { EmptyState, PageHeader, ProgressBar, Segmented } from '../components/common'
import { chapters, sections } from '../data/chapters'
import { usePageTitle } from '../hooks/usePageTitle'
import { useNow } from '../hooks/useNow'
import { useAppData } from '../hooks/useAppData'
import { normalize } from '../lib/memorize'
import { searchChapters } from '../lib/search'

type Filter = 'all' | 'unread' | 'read' | 'favorite' | 'recited'

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'unread', label: '未读' },
  { value: 'read', label: '已读' },
  { value: 'favorite', label: '收藏' },
  { value: 'recited', label: '背过' },
]

function Highlight({ text, term }: { text: string; term: string }) {
  const clean = term.trim()
  if (!clean) return <>{text}</>
  const index = text.indexOf(clean)
  if (index < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, index)}
      <mark>{text.slice(index, index + clean.length)}</mark>
      {text.slice(index + clean.length)}
    </>
  )
}

export function ChaptersPage() {
  usePageTitle('全篇')
  const data = useAppData()
  const now = useNow()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const stats = useMemo(() => {
    const read = chapters.filter((chapter) => data.progress[chapter.number]?.read).length
    return { read, total: chapters.length }
  }, [data.progress])

  const searchTerm = normalize(query)
  const results = useMemo(() => (searchTerm ? searchChapters(query, 40) : []), [query, searchTerm])

  const isVisible = (number: number): boolean => {
    const progress = data.progress[number]
    if (filter === 'read') return progress?.read === true
    if (filter === 'unread') return progress?.read !== true
    if (filter === 'favorite') return progress?.favorite === true
    if (filter === 'recited') return Boolean(data.recite[number])
    return true
  }

  const filtered = chapters.filter((chapter) => isVisible(chapter.number))

  return (
    <div className="page chapters-page">
      <PageHeader
        eyebrow="全篇"
        title="八十一章"
        description="道经三十七章，德经四十四章。读原文，看译文，随手标记。"
        actions={
          <Link className="button button-ghost button-small" to="/concepts">
            <Icon name="compass" size={16} />
            概念索引
          </Link>
        }
      />

      <section className="catalog-progress panel panel-flat">
        <div className="catalog-progress-copy">
          <strong>
            已读 {stats.read} / {stats.total}
          </strong>
          <span>一天一章，八十一天走完一遍。</span>
        </div>
        <ProgressBar value={stats.read} max={stats.total} label="全篇阅读进度" />
      </section>

      <div className="catalog-toolbar">
        <div className="search-field">
          <Icon name="search" size={18} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜原文、译文或注释，如「上善若水」"
            aria-label="搜索道德经内容"
          />
          {query ? (
            <button type="button" className="icon-button" onClick={() => setQuery('')} aria-label="清空搜索">
              <Icon name="x" size={16} />
            </button>
          ) : null}
        </div>
        <Segmented options={filters} value={filter} onChange={setFilter} ariaLabel="筛选章节" />
      </div>

      {searchTerm ? (
        <section className="search-results" aria-live="polite">
          <div className="search-summary">
            <span>
              找到 <strong>{results.length}</strong> 章与「{query.trim()}」相关
            </span>
          </div>
          {results.length ? (
            <ul className="result-list">
              {results.map((result) => (
                <li key={result.chapter.number}>
                  <Link className="result-item" to={`/chapters/${result.chapter.number}`}>
                    <span className="result-no">{result.chapter.number}</span>
                    <span className="result-copy">
                      <span className="result-title">
                        第{result.chapter.number}章 · {result.chapter.title}
                        <em>{result.field}</em>
                      </span>
                      <span className="result-snippet">
                        <Highlight text={result.snippet} term={query.trim()} />
                      </span>
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="search"
              title="没有找到"
              description="试试更短的关键词，比如「水」「无为」「知足」。"
              action={
                <button type="button" className="button button-small" onClick={() => setQuery('')}>
                  清空搜索
                </button>
              }
            />
          )}
        </section>
      ) : (
        <>
          {sections.map((section) => {
            const list = filtered.filter((chapter) => chapter.section === section.id)
            return (
              <section className="chapter-section" key={section.id}>
                <div className="section-heading section-heading-large">
                  <div>
                    <h2>{section.name}</h2>
                    <p>{section.subtitle}</p>
                  </div>
                  <span className="section-count">{list.length} 章</span>
                </div>
                {list.length ? (
                  <div className="chapter-grid">
                    {list.map((chapter) => (
                      <ChapterCard
                        key={chapter.number}
                        chapter={chapter}
                        compact
                        read={data.progress[chapter.number]?.read}
                        favorite={data.progress[chapter.number]?.favorite}
                        recite={data.recite[chapter.number]}
                        review={data.review[chapter.number]}
                        now={now}
                      />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon="book"
                    title={filter === 'favorite' ? '还没有收藏' : '这里还没有章节'}
                    description={
                      filter === 'favorite' ? '在章页点一下心形，稍后就能在这里找到。' : '换一个筛选条件看看。'
                    }
                  />
                )}
              </section>
            )
          })}
        </>
      )}

      <section className="concepts-banner">
        <span className="concepts-banner-icon">
          <Icon name="compass" size={22} />
        </span>
        <div>
          <strong>按概念读，串起八十一章</strong>
          <p>道、德、无为、柔弱、不争、知足、朴、反、水、婴儿，这些词在不同章节里互相照亮。</p>
        </div>
        <Link className="text-link with-icon" to="/concepts">
          去看看
          <Icon name="arrowRight" size={15} />
        </Link>
      </section>
    </div>
  )
}

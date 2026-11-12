import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { EmptyState, PageHeader, Segmented } from '../components/common'
import { getChapter } from '../data/chapters'
import { concepts } from '../data/concepts'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAppData } from '../hooks/useAppData'
import { useNow } from '../hooks/useNow'
import { formatRelative, monthStart } from '../lib/date'
import { practiceCountSince, practiceNumbers, recentActivity } from '../lib/stats'
import { actions } from '../lib/store'

type Tab = 'notes' | 'prompts' | 'calendar'

const tabs: { value: Tab; label: string }[] = [
  { value: 'notes', label: '我的笔记' },
  { value: 'prompts', label: '践行提示' },
  { value: 'calendar', label: '打卡' },
]

export function PracticePage() {
  usePageTitle('实践')
  const data = useAppData()
  const now = useNow()
  const [tab, setTab] = useState<Tab>('notes')
  const numbers = practiceNumbers(data)
  const total = numbers.length
  const monthCount = practiceCountSince(data, monthStart(now))
  const heatmap = recentActivity(data, 35, now)
  const prompts = useMemo(
    () => concepts.slice(0, 6).map((concept) => ({ concept, chapter: getChapter(concept.chapters[0]) })),
    [],
  )

  return (
    <div className="page practice-page">
      <PageHeader
        eyebrow="实践"
        title="把一章用进今天"
        description="读懂了不算数，用过才算。每章都可以写一条践行笔记，记下场景、做法和结果。"
        actions={
          <Link className="button button-small button-primary" to="/chapters">
            <Icon name="book" size={16} />
            去挑一章
          </Link>
        }
      />

      <div className="practice-summary">
        <div className="panel practice-summary-card">
          <strong>{total}</strong>
          <span>条践行笔记</span>
        </div>
        <div className="panel practice-summary-card">
          <strong>{monthCount}</strong>
          <span>本月新增</span>
        </div>
        <div className="panel practice-summary-card">
          <strong>{heatmap.filter((cell) => cell.level > 0).length}</strong>
          <span>近 35 天有学习</span>
        </div>
      </div>

      <div className="catalog-toolbar">
        <Segmented options={tabs} value={tab} onChange={setTab} ariaLabel="实践页切换" />
      </div>

      {tab === 'notes' ? (
        numbers.length ? (
          <ul className="note-cards">
            {numbers.map((number) => {
              const chapter = getChapter(number)
              const entry = data.practice[number]
              if (!chapter || !entry) return null
              return (
                <li key={number} className="panel note-card">
                  <div className="note-card-head">
                    <Link to={`/chapters/${number}`} className="note-card-title">
                      <span className="compact-no">{number}</span>
                      <span>
                        第{number}章 · {chapter.title}
                      </span>
                    </Link>
                    <span className="muted-text">{formatRelative(entry.updatedAt)}</span>
                  </div>
                  <p className="note-card-body">{entry.text}</p>
                  <div className="note-card-foot">
                    <span className="note-card-prompt" title={chapter.practice}>
                      第{number}章提示：{chapter.practice}
                    </span>
                    <div className="row gap-sm">
                      <Link className="text-link" to={`/chapters/${number}?focus=practice`}>
                        编辑
                      </Link>
                      <button
                        type="button"
                        className="text-link is-danger"
                        onClick={() => {
                          if (window.confirm(`确定删除第${number}章的践行笔记吗？`)) actions.deletePractice(number)
                        }}
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : (
          <EmptyState
            icon="leaf"
            title="还没有践行笔记"
            description="挑一章今天读到的，写一句「我打算怎么做」。"
            action={
              <Link className="button button-primary" to="/chapters">
                去选一章
              </Link>
            }
          />
        )
      ) : null}

      {tab === 'prompts' ? (
        <div className="prompt-groups">
          <section className="panel">
            <div className="section-heading">
              <h2>按概念找落点</h2>
            </div>
            <ul className="prompt-list">
              {prompts.map(({ concept, chapter }) => (
                <li key={concept.slug}>
                  <Link className="prompt-item" to={`/concepts/${concept.slug}`}>
                    <span className="prompt-tag">{concept.name}</span>
                    <span className="prompt-copy">
                      <strong>{chapter ? chapter.practice : concept.summary}</strong>
                      <small>{chapter ? `第${chapter.number}章 · ${chapter.title}` : ''}</small>
                    </span>
                    <Icon name="chevronRight" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>一周练习建议</h2>
            </div>
            <ol className="week-plan">
              <li>
                <strong>周一</strong>
                <span>读一章，标出最打动你的一句。</span>
              </li>
              <li>
                <strong>周二</strong>
                <span>把那一句用首字提示背下来。</span>
              </li>
              <li>
                <strong>周三</strong>
                <span>在生活里找一个能用它的场景。</span>
              </li>
              <li>
                <strong>周四</strong>
                <span>写一条践行笔记，记下做法和结果。</span>
              </li>
              <li>
                <strong>周五</strong>
                <span>复习本周的章节，看看有没有变化。</span>
              </li>
              <li>
                <strong>周六</strong>
                <span>翻翻收藏夹，重读最喜欢的三章。</span>
              </li>
              <li>
                <strong>周日</strong>
                <span>不读新章，只回顾与休息。</span>
              </li>
            </ol>
          </section>
        </div>
      ) : null}

      {tab === 'calendar' ? (
        <section className="panel">
          <div className="section-heading">
            <h2>近 35 天</h2>
            <span className="muted-text">颜色越深，学习次数越多</span>
          </div>
          <div className="heatmap is-large">
            {heatmap.map((cell) =>
              cell.placeholder ? (
                <span key={cell.key} className="heatmap-cell is-placeholder" aria-hidden="true" />
              ) : (
                <span
                  key={cell.key}
                  className={`heatmap-cell level-${cell.level}`}
                  title={`${cell.date.getMonth() + 1}月${cell.date.getDate()}日 · ${cell.count} 次`}
                />
              ),
            )}
          </div>
          <div className="heatmap-weekdays is-large" aria-hidden="true">
            <span>一</span>
            <span>二</span>
            <span>三</span>
            <span>四</span>
            <span>五</span>
            <span>六</span>
            <span>日</span>
          </div>
          <div className="heatmap-legend">
            <span>少</span>
            <span className="heatmap-cell level-0" />
            <span className="heatmap-cell level-1" />
            <span className="heatmap-cell level-2" />
            <span className="heatmap-cell level-3" />
            <span>多</span>
          </div>
        </section>
      ) : null}
    </div>
  )
}

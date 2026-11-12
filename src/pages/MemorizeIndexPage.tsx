import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { PageHeader, ProgressBar, Segmented } from '../components/common'
import { chapters } from '../data/chapters'
import { usePageTitle } from '../hooks/usePageTitle'
import { useAppData } from '../hooks/useAppData'
import { formatRelative } from '../lib/date'
import { dailyChapter } from '../lib/stats'

type Filter = 'all' | 'todo' | 'done'

const filters: { value: Filter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'todo', label: '未背' },
  { value: 'done', label: '背过' },
]

export function MemorizeIndexPage() {
  usePageTitle('背诵')
  const data = useAppData()
  const [filter, setFilter] = useState<Filter>('all')
  const today = dailyChapter()

  const lastRecited = useMemo(() => {
    const entries = Object.entries(data.recite).sort((a, b) => b[1].lastAt - a[1].lastAt)
    if (!entries.length) return null
    return { number: Number(entries[0][0]), record: entries[0][1] }
  }, [data.recite])

  const doneCount = Object.keys(data.recite).length
  const listed = chapters.filter((chapter) => {
    if (filter === 'todo') return !data.recite[chapter.number]
    if (filter === 'done') return Boolean(data.recite[chapter.number])
    return true
  })

  return (
    <div className="page memorize-index-page">
      <PageHeader
        eyebrow="背诵"
        title="一章一章，背下来"
        description="先露首字，再挖空，最后整章默写。每次练习都会自动记录，并进入间隔复习。"
      />

      <div className="memorize-top">
        <section className="memorize-feature">
          <p className="feature-eyebrow">{lastRecited ? '继续背诵' : '从今天开始'}</p>
          {lastRecited ? (
            <>
              <h2>
                第{lastRecited.number}章 · {chapters[lastRecited.number - 1].title}
              </h2>
              <p className="feature-quote">{chapters[lastRecited.number - 1].text[0]}</p>
              <div className="feature-meta">
                <span>最佳 {lastRecited.record.bestScore} 分</span>
                <span>练过 {lastRecited.record.attempts} 次</span>
                <span>{formatRelative(lastRecited.record.lastAt)}</span>
              </div>
              <div className="feature-actions">
                <Link className="button button-primary" to={`/memorize/${lastRecited.number}`}>
                  继续这一章
                  <Icon name="arrowRight" size={17} />
                </Link>
                <Link className="button button-ghost" to={`/chapters/${lastRecited.number}`}>
                  回原文
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2>
                第{today.number}章 · {today.title}
              </h2>
              <p className="feature-quote">{today.text[0]}</p>
              <p className="feature-desc">背之前不必全懂。先读三遍，再用首字提示试一次。</p>
              <div className="feature-actions">
                <Link className="button button-primary" to={`/memorize/${today.number}`}>
                  开始背诵
                  <Icon name="arrowRight" size={17} />
                </Link>
                <Link className="button button-ghost" to={`/chapters/${today.number}`}>
                  先读原文
                </Link>
              </div>
            </>
          )}
        </section>

        <section className="memorize-modes">
          <h2>三种练法</h2>
          <div className="mode-item">
            <span className="mode-icon">
              <Icon name="eye" size={19} />
            </span>
            <div>
              <strong>首字提示</strong>
              <p>每句只露第一个字，想起整句再翻开。适合刚读熟的阶段。</p>
            </div>
          </div>
          <div className="mode-item">
            <span className="mode-icon">
              <Icon name="pencil" size={19} />
            </span>
            <div>
              <strong>关键字填空</strong>
              <p>随机挖去若干字，逐字填写。用来检查字句是否真的记住。</p>
            </div>
          </div>
          <div className="mode-item">
            <span className="mode-icon">
              <Icon name="spark" size={19} />
            </span>
            <div>
              <strong>整章默写</strong>
              <p>不看原文写完整章，自动对照，标出漏字与多字。</p>
            </div>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>选择章节</h2>
            <p className="section-sub">已背 {doneCount} / 81</p>
          </div>
          <Segmented options={filters} value={filter} onChange={setFilter} ariaLabel="筛选背诵章节" />
        </div>
        <ProgressBar value={doneCount} max={81} label="背诵进度" />
        <div className="chapter-picker">
          {listed.map((chapter) => {
            const record = data.recite[chapter.number]
            return (
              <Link
                key={chapter.number}
                to={`/memorize/${chapter.number}`}
                className={record ? 'picker-item is-done' : 'picker-item'}
                title={`第${chapter.number}章 ${chapter.title}`}
              >
                <span className="picker-no">{chapter.number}</span>
                <span className="picker-score">{record ? `${record.bestScore}` : chapter.title}</span>
              </Link>
            )
          })}
        </div>
        {!listed.length ? <p className="muted-text center-text">这个筛选下暂时没有章节。</p> : null}
      </section>
    </div>
  )
}

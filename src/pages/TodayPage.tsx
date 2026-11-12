import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { ProgressBar, Ring, SectionHeading } from '../components/common'
import { getChapter } from '../data/chapters'
import { usePageTitle } from '../hooks/usePageTitle'
import { useNow } from '../hooks/useNow'
import { useAppData } from '../hooks/useAppData'
import { dayKey, formatDate, formatRelative, formatDue, greeting } from '../lib/date'
import { dailyChapter, dailyQuote, dueNumbers, getStats, recentActivity } from '../lib/stats'

export function TodayPage() {
  usePageTitle()
  const data = useAppData()
  const now = useNow()
  const stats = getStats(data, now)
  const chapter = dailyChapter()
  const quote = dailyQuote()
  const due = dueNumbers(data, now)
  const heatmap = recentActivity(data, 35, now)

  const lastRead = useMemo(() => {
    const entries = Object.entries(data.progress)
      .filter(([, progress]) => progress.read && progress.readAt)
      .sort((a, b) => (b[1].readAt ?? 0) - (a[1].readAt ?? 0))
    if (!entries.length) return null
    const number = Number(entries[0][0])
    return { chapter: getChapter(number), readAt: entries[0][1].readAt as number }
  }, [data.progress])

  const tasksDone = [stats.todayRead > 0, stats.todayReview > 0, stats.todayRecite > 0].filter(Boolean).length
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(
    new Date(now),
  )

  return (
    <div className="page today-page">
      <section className="today-hero">
        <div className="today-hero-main">
          <p className="today-date">
            {dateLabel}
            <span className="dot-sep">·</span>
            {greeting()}，今天读一章
          </p>
          <h1 className="today-title">
            <span className="chapter-number">第{chapter.number}章</span>
            <span className="chapter-title-text">{chapter.title}</span>
          </h1>
          <blockquote className="today-quote">
            <span className="quote-mark" aria-hidden="true">
              “
            </span>
            <p>{quote.text}</p>
            <cite>
              第{quote.chapter}章 · {chapter.gist}
            </cite>
          </blockquote>
          <div className="today-actions">
            <Link className="button button-primary" to={`/chapters/${chapter.number}`}>
              读这一章
              <Icon name="arrowRight" size={17} />
            </Link>
            <Link className="button button-ghost" to={`/memorize/${chapter.number}`}>
              <Icon name="spark" size={17} />
              开始背诵
            </Link>
          </div>
        </div>

        <aside className="today-hero-side">
          <div className="today-side-head">
            <span>今日功课</span>
            <span className="today-side-date">{dayKey()}</span>
          </div>
          <div className="today-side-body">
            <Ring value={tasksDone} max={3} size={88} label={`今日完成 ${tasksDone} 项，共 3 项`}>
              <strong>{tasksDone}</strong>
              <span>/ 3</span>
            </Ring>
            <ul className="today-tasks">
              <li className={stats.todayRead > 0 ? 'is-done' : ''}>
                <Icon name={stats.todayRead > 0 ? 'checkCircle' : 'book'} size={17} />
                <span>读一章</span>
                <small>{stats.todayRead > 0 ? '已完成' : '待开始'}</small>
              </li>
              <li className={stats.todayReview > 0 ? 'is-done' : ''}>
                <Icon name={stats.todayReview > 0 ? 'checkCircle' : 'repeat'} size={17} />
                <span>复习</span>
                <small>{stats.due > 0 ? `${stats.due} 章待复习` : '暂无到期'}</small>
              </li>
              <li className={stats.todayRecite > 0 ? 'is-done' : ''}>
                <Icon name={stats.todayRecite > 0 ? 'checkCircle' : 'spark'} size={17} />
                <span>背诵一段</span>
                <small>{stats.todayRecite > 0 ? '已完成' : '待开始'}</small>
              </li>
            </ul>
          </div>
          {stats.due > 0 ? (
            <Link className="today-side-cta" to="/review">
              去复习 {stats.due} 章
              <Icon name="arrowRight" size={16} />
            </Link>
          ) : (
            <p className="today-side-note">
              下一次复习：{stats.nextDue ? formatDue(stats.nextDue, now) : '背完一章后自动安排'}
            </p>
          )}
        </aside>
      </section>

      <div className="today-grid">
        <div className="stack">
          {lastRead?.chapter ? (
            <section className="panel continue-panel">
              <SectionHeading
                title="接着上次"
                extra={
                  <Link className="text-link" to="/chapters">
                    全部章节
                  </Link>
                }
              />
              <Link className="continue-card" to={`/chapters/${lastRead.chapter.number}`}>
                <span className="continue-no">{lastRead.chapter.number}</span>
                <span className="continue-copy">
                  <strong>
                    第{lastRead.chapter.number}章 · {lastRead.chapter.title}
                  </strong>
                  <span>{lastRead.chapter.text[0]}</span>
                  <small>{formatRelative(lastRead.readAt, now)}读过</small>
                </span>
                <Icon name="chevronRight" size={18} />
              </Link>
            </section>
          ) : null}

          <section className="panel">
            <SectionHeading title="学习轨迹" extra={<span className="muted-text">近 35 天</span>} />
            <div className="heatmap-block">
              <div className="heatmap" aria-label="最近 35 天学习记录">
                {heatmap.map((cell) =>
                  cell.placeholder ? (
                    <span key={cell.key} className="heatmap-cell is-placeholder" aria-hidden="true" />
                  ) : (
                    <span
                      key={cell.key}
                      className={`heatmap-cell level-${cell.level}`}
                      title={`${formatDate(cell.date.getTime())} · ${cell.count} 次学习`}
                    />
                  ),
                )}
              </div>
              <div className="heatmap-weekdays" aria-hidden="true">
                <span>一</span>
                <span>二</span>
                <span>三</span>
                <span>四</span>
                <span>五</span>
                <span>六</span>
                <span>日</span>
              </div>
              <p className="heatmap-note">
                近 35 天里有 <strong>{heatmap.filter((cell) => !cell.placeholder && cell.count > 0).length}</strong>{' '}
                天留下记录
              </p>
            </div>
            <div className="stat-strip">
              <div>
                <strong>{stats.streak}</strong>
                <span>连续天数</span>
              </div>
              <div>
                <strong>{stats.read}</strong>
                <span>已读章节</span>
              </div>
              <div>
                <strong>{stats.mastered}</strong>
                <span>已背熟</span>
              </div>
              <div>
                <strong>{stats.practices}</strong>
                <span>践行笔记</span>
              </div>
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <SectionHeading
              title={due.length ? '待复习' : '复习计划'}
              extra={
                <Link className="text-link" to="/review">
                  查看全部
                </Link>
              }
            />
            {due.length ? (
              <ul className="compact-list">
                {due.slice(0, 3).map((number) => {
                  const item = getChapter(number)
                  if (!item) return null
                  return (
                    <li key={number}>
                      <Link to={`/chapters/${number}`} className="compact-item">
                        <span className="compact-no">{number}</span>
                        <span className="compact-copy">
                          <strong>{item.title}</strong>
                          <small>{item.gist}</small>
                        </span>
                        <Icon name="chevronRight" size={16} />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="calm-note">
                <Icon name="checkCircle" size={20} />
                <div>
                  <strong>今天没有到期的复习</strong>
                  <p>
                    {stats.nextDue
                      ? `下一章将在 ${formatDue(stats.nextDue, now)}到期。`
                      : '背完一章后，会自动加入复习队列。'}
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="panel practice-teaser">
            <SectionHeading
              title="今日实践"
              extra={
                <Link className="text-link" to="/practice">
                  实践笔记
                </Link>
              }
            />
            <p className="practice-prompt">{chapter.practice}</p>
            <div className="practice-teaser-foot">
              <span className="muted-text">
                第{chapter.number}章 · {chapter.title}
              </span>
              <Link className="button button-small" to={`/chapters/${chapter.number}?focus=practice`}>
                <Icon name="pencil" size={15} />
                写一条
              </Link>
            </div>
          </section>

          <section className="panel">
            <SectionHeading title="读到哪儿了" extra={<span className="muted-text">{stats.read} / 81</span>} />
            <ProgressBar value={stats.read} max={stats.total} label="全篇阅读进度" />
            <p className="progress-note">
              {stats.read === 0
                ? '从今天这一章开始，读一遍就标记已读。'
                : stats.read === stats.total
                  ? '八十一章已读完，接下来交给复习与背诵。'
                  : `还剩 ${stats.total - stats.read} 章。不必赶，一天一章刚好。`}
            </p>
            <Link className="text-link with-icon" to="/chapters">
              去全篇
              <Icon name="arrowRight" size={15} />
            </Link>
          </section>
        </div>
      </div>
    </div>
  )
}

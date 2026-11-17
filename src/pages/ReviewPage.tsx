import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toast-context'
import { EmptyState, PageHeader, ProgressBar, Ring } from '../components/common'
import { getChapter } from '../data/chapters'
import { usePageTitle } from '../hooks/usePageTitle'
import { useNow } from '../hooks/useNow'
import { useAppData } from '../hooks/useAppData'
import { formatDue } from '../lib/date'
import { firstCharsOf } from '../lib/memorize'
import { GRADES, scheduleReview, type Grade } from '../lib/srs'
import { dueNumbers, getStats, nextDueAt } from '../lib/stats'
import { actions } from '../lib/store'

export function ReviewPage() {
  usePageTitle('复习')
  const data = useAppData()
  const now = useNow()
  const toast = useToast()
  const stats = getStats(data, now)
  const [queue, setQueue] = useState<number[]>(() => dueNumbers(data))
  const [showOriginal, setShowOriginal] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [reviewedCount, setReviewedCount] = useState(0)
  const currentNumber = queue[0]
  const chapter = currentNumber ? getChapter(currentNumber) : undefined
  const record = currentNumber ? data.review[currentNumber] : undefined
  const upcoming = useMemo(() => nextDueAt(data, now), [data, now])

  const grade = (value: Grade) => {
    if (!currentNumber || !chapter) return
    const next = scheduleReview(data.review[currentNumber], value, now)
    actions.gradeReview(currentNumber, value)
    setQueue((current) => current.slice(1))
    setReviewedCount((count) => count + 1)
    setShowOriginal(false)
    setShowHint(false)
    toast(`已记录：${GRADES[value].label}，下次 ${formatDue(next.dueAt, now)}`)
  }

  if (!chapter) {
    return (
      <div className="page review-page">
        <PageHeader eyebrow="复习" title="今天的复习" description="按遗忘曲线，把快要忘的章节重新过一遍。" />
        <section className="panel review-done-panel">
          <EmptyState
            icon="checkCircle"
            title={reviewedCount > 0 ? `今天已完成 ${reviewedCount} 章复习` : '今天没有到期的复习'}
            description={
              upcoming
                ? `下一章将在 ${formatDue(upcoming, now)} 到期。也可以现在多背一章，提前积累。`
                : '背完一章后，系统会自动安排第一次复习。'
            }
            action={
              <div className="row gap-sm wrap">
                <Link className="button button-primary" to="/memorize">
                  <Icon name="spark" size={16} />
                  去背一章
                </Link>
                <Link className="button button-ghost" to="/chapters">
                  浏览全篇
                </Link>
              </div>
            }
          />
        </section>

        <div className="review-stats-grid">
          <div className="panel stat-card">
            <span className="stat-label">今日复习</span>
            <strong className="stat-value">
              {stats.todayReview}
              <small> / {data.settings.dailyReviewGoal}</small>
            </strong>
            <ProgressBar
              value={Math.min(stats.todayReview, data.settings.dailyReviewGoal)}
              max={data.settings.dailyReviewGoal}
              label="今日复习目标"
            />
          </div>
          <div className="panel stat-card">
            <span className="stat-label">下次到期</span>
            <strong className="stat-value">{upcoming ? formatDue(upcoming, now) : '暂无'}</strong>
            <p className="muted-text">到期后会出现在这里。</p>
          </div>
          <div className="panel stat-card">
            <span className="stat-label">连续学习</span>
            <strong className="stat-value">
              {stats.streak}
              <small> 天</small>
            </strong>
            <p className="muted-text">读、背、复习、写笔记都算。</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page review-page">
      <PageHeader
        eyebrow="复习"
        title="今天的复习"
        description="先在心里过一遍，再决定记得多少。评分会决定下一次见面的时间。"
        actions={
          <div className="review-goal">
            <Ring
              value={stats.todayReview}
              max={data.settings.dailyReviewGoal}
              size={54}
              stroke={4}
              label="今日复习目标"
            >
              <strong>{stats.todayReview}</strong>
              <span>/{data.settings.dailyReviewGoal}</span>
            </Ring>
            <span className="muted-text">今日目标</span>
          </div>
        }
      />

      <div className="review-layout">
        <section className="review-card">
          <div className="review-card-head">
            <div>
              <p className="page-eyebrow">队列中还有 {queue.length} 章</p>
              <h2>
                第{chapter.number}章 · {chapter.title}
              </h2>
            </div>
            <button
              type="button"
              className="button button-small button-ghost"
              onClick={() => {
                setQueue((current) => current.slice(1))
                setShowOriginal(false)
                setShowHint(false)
              }}
            >
              稍后再看
            </button>
          </div>

          <div className="review-recall">
            <p className="review-instruction">先不开原文，试着在脑中把这一章过一遍。</p>
            {showHint ? (
              <p className="review-hint">
                {firstCharsOf(chapter.text).map((chars, index) => (
                  <span key={index}>{chars.join(' ')}</span>
                ))}
              </p>
            ) : null}
            {showOriginal ? (
              <div className="review-original">
                {chapter.text.map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
                <p className="review-gist">章旨：{chapter.gist}</p>
              </div>
            ) : null}
            <div className="row gap-sm wrap">
              <button type="button" className="button button-small" onClick={() => setShowHint((value) => !value)}>
                <Icon name="eye" size={15} />
                {showHint ? '收起首字' : '看首字'}
              </button>
              <button type="button" className="button button-small" onClick={() => setShowOriginal((value) => !value)}>
                <Icon name="book" size={15} />
                {showOriginal ? '收起原文' : '看原文'}
              </button>
            </div>
          </div>

          <div className="review-grade">
            <p>这一章，你记得怎么样？</p>
            <div className="grade-buttons">
              {GRADES.map((item) => {
                const preview = scheduleReview(record, item.grade, now)
                return (
                  <button
                    type="button"
                    key={item.grade}
                    className={`grade-button grade-${item.grade}`}
                    onClick={() => grade(item.grade)}
                  >
                    <strong>{item.label}</strong>
                    <span>{formatDue(preview.dueAt, now)}</span>
                  </button>
                )
              })}
            </div>
          </div>
        </section>

        <aside className="review-aside">
          <section className="aside-card">
            <h2>这一章的底子</h2>
            <dl className="mini-facts">
              <div>
                <dt>复习次数</dt>
                <dd>{record?.reps ?? 0} 次</dd>
              </div>
              <div>
                <dt>忘记次数</dt>
                <dd>{record?.lapses ?? 0} 次</dd>
              </div>
              <div>
                <dt>当前间隔</dt>
                <dd>{record && record.intervalDays > 0 ? `${record.intervalDays} 天` : '初次'}</dd>
              </div>
              <div>
                <dt>上次评分</dt>
                <dd>{record ? GRADES[record.lastGrade].label : '尚未复习'}</dd>
              </div>
            </dl>
            <Link className="text-link with-icon" to={`/chapters/${chapter.number}`}>
              回原文细读
              <Icon name="arrowRight" size={15} />
            </Link>
          </section>

          <section className="aside-card aside-quiet">
            <h2>评分怎么选</h2>
            <ul className="plain-list">
              <li>
                <strong>忘了</strong>：只记得题目或开头，10 分钟后再来。
              </li>
              <li>
                <strong>模糊</strong>：能背出大半，但中间卡住。
              </li>
              <li>
                <strong>记得</strong>：基本完整，个别字句不稳。
              </li>
              <li>
                <strong>熟练</strong>：不假思索，间隔会拉长。
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toast-context'
import { getChapter, chapterLabel, type Chapter } from '../data/chapters'
import { conceptsForChapter } from '../data/concepts'
import { getChapterGloss, glossCharCount, glossMatchesChapter } from '../data/glosses'
import { usePageTitle } from '../hooks/usePageTitle'
import { useNow } from '../hooks/useNow'
import { useAppData } from '../hooks/useAppData'
import { useSpeech } from '../hooks/useSpeech'
import { formatDateTime, formatDue, formatRelative } from '../lib/date'
import { actions } from '../lib/store'

function InvalidChapter({ number }: { number: string }) {
  usePageTitle('章节不存在')
  return (
    <div className="page">
      <div className="empty-state standalone">
        <span className="empty-icon">
          <Icon name="book" size={26} />
        </span>
        <h3>没有找到第 {number} 章</h3>
        <p>《道德经》共八十一章，可以从全篇目录进入。</p>
        <Link className="button button-primary" to="/chapters">
          回到全篇
        </Link>
      </div>
    </div>
  )
}

function ChapterView({ chapter }: { chapter: Chapter }) {
  usePageTitle(`${chapterLabel(chapter.number)} ${chapter.title}`)
  const data = useAppData()
  const now = useNow()
  const toast = useToast()
  const speech = useSpeech()
  const [searchParams] = useSearchParams()
  const progress = data.progress[chapter.number]
  const recite = data.recite[chapter.number]
  const review = data.review[chapter.number]
  const savedPractice = data.practice[chapter.number]
  const [note, setNote] = useState(savedPractice?.text ?? '')
  const [showTranslation, setShowTranslation] = useState(data.settings.showTranslation)
  const [showPinyin, setShowPinyin] = useState(data.settings.showPinyin)
  const [showGloss, setShowGloss] = useState(false)
  const [practiceSavedAt, setPracticeSavedAt] = useState<number | null>(savedPractice?.updatedAt ?? null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const practiceRef = useRef<HTMLElement>(null)
  const previous = getChapter(chapter.number - 1)
  const next = getChapter(chapter.number + 1)
  const relatedConcepts = conceptsForChapter(chapter.number)
  const storedGloss = getChapterGloss(chapter.number)
  const gloss = storedGloss && glossMatchesChapter(storedGloss, chapter) ? storedGloss : null

  useEffect(() => {
    if (searchParams.get('focus') !== 'practice') return undefined
    const timer = window.setTimeout(() => {
      practiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      textareaRef.current?.focus({ preventScroll: true })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [searchParams, chapter.number])

  const speechText = useMemo(() => `第${chapter.number}章，${chapter.title}。${chapter.text.join('')}`, [chapter])

  const savePractice = () => {
    actions.savePractice(chapter.number, note)
    const now = Date.now()
    setPracticeSavedAt(note.trim() ? now : null)
    toast(note.trim() ? '践行笔记已保存' : '践行笔记已清空')
  }

  const toggleRead = () => {
    const nextRead = !progress?.read
    actions.setRead(chapter.number, nextRead)
    toast(nextRead ? `第${chapter.number}章已标记为已读` : '已取消已读标记')
  }

  const toggleFavorite = () => {
    actions.toggleFavorite(chapter.number)
    toast(progress?.favorite ? '已取消收藏' : '已收藏这一章')
  }

  const togglePinyin = () => {
    const next = !showPinyin
    setShowPinyin(next)
    actions.updateSettings({ showPinyin: next })
  }

  const speak = () => {
    if (speech.speaking) {
      speech.stop()
      return
    }
    speech.speak(speechText, data.settings.speechRate)
  }

  return (
    <article className="page chapter-page">
      <nav className="crumbs" aria-label="面包屑">
        <Link to="/chapters" className="crumb-back">
          <Icon name="chevronLeft" size={16} />
          全篇
        </Link>
        <span className="crumb-divider">/</span>
        <span>{chapter.section === 'dao' ? '道经' : '德经'}</span>
        <span className="crumb-divider">/</span>
        <span>第{chapter.number}章</span>
      </nav>

      <header className="chapter-header">
        <div className="chapter-heading">
          <span className="chapter-seal" aria-hidden="true">
            {chapter.number}
          </span>
          <div>
            <p className="page-eyebrow">
              {chapter.section === 'dao' ? '道经' : '德经'} · 第{chapter.number}章
            </p>
            <h1>{chapter.title}</h1>
            <p className="chapter-gist-inline">{chapter.gist}</p>
          </div>
        </div>

        <div className="chapter-actions">
          <button
            type="button"
            className={progress?.favorite ? 'icon-button is-active' : 'icon-button'}
            onClick={toggleFavorite}
            aria-label={progress?.favorite ? '取消收藏' : '收藏这一章'}
            aria-pressed={Boolean(progress?.favorite)}
          >
            <Icon name="heart" size={18} filled={Boolean(progress?.favorite)} />
          </button>
          <button
            type="button"
            className={progress?.read ? 'button button-small is-done' : 'button button-small'}
            onClick={toggleRead}
            aria-pressed={Boolean(progress?.read)}
          >
            <Icon name={progress?.read ? 'checkCircle' : 'check'} size={16} />
            {progress?.read ? '已读' : '标记已读'}
          </button>
          <button
            type="button"
            className="button button-small"
            onClick={speak}
            disabled={!speech.supported}
            title={speech.supported ? '朗读原文' : '当前浏览器不支持朗读'}
          >
            <Icon name={speech.speaking ? 'stop' : 'volume'} size={16} />
            {speech.speaking ? '停止' : '朗读'}
          </button>
          <Link className="button button-small button-primary" to={`/memorize/${chapter.number}`}>
            <Icon name="spark" size={16} />
            背诵
          </Link>
        </div>
      </header>

      <div className="reading-layout">
        <div className="reading-main">
          <section className="original-card" aria-label="原文">
            <div className="original-toolbar">
              <span className="original-label">原文</span>
              <div className="original-tools">
                {gloss ? (
                  <button
                    type="button"
                    className={showPinyin ? 'font-button is-on' : 'font-button'}
                    onClick={togglePinyin}
                    aria-pressed={showPinyin}
                    title={showPinyin ? '隐藏拼音' : '显示拼音'}
                  >
                    注音
                  </button>
                ) : null}
                <div className="font-controls" aria-label="调整字号">
                  <button
                    type="button"
                    className="font-button"
                    onClick={() => actions.updateSettings({ fontSize: Math.max(15, data.settings.fontSize - 1) })}
                    aria-label="缩小字号"
                  >
                    A−
                  </button>
                  <button
                    type="button"
                    className="font-button"
                    onClick={() => actions.updateSettings({ fontSize: Math.min(24, data.settings.fontSize + 1) })}
                    aria-label="放大字号"
                  >
                    A+
                  </button>
                </div>
              </div>
            </div>
            <div className={gloss && showPinyin ? 'original-text has-pinyin' : 'original-text'}>
              {gloss
                ? gloss.map((line, lineIndex) => (
                    <p key={lineIndex}>
                      {line.map((token, tokenIndex) =>
                        // 拼音走 CSS 伪元素，正文只留汉字，复制原文时不会带出注音
                        showPinyin && token.pinyin ? (
                          <span
                            className={lineIndex === 0 && tokenIndex === 0 ? 'zi is-first' : 'zi'}
                            data-pinyin={token.pinyin}
                            key={tokenIndex}
                          >
                            {token.char}
                          </span>
                        ) : (
                          token.char
                        ),
                      )}
                    </p>
                  ))
                : chapter.text.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>章旨</h2>
            </div>
            <p className="gist-text">{chapter.gist}</p>
          </section>

          <section className="panel">
            <button
              type="button"
              className="collapse-trigger"
              onClick={() => setShowTranslation((value) => !value)}
              aria-expanded={showTranslation}
            >
              <span className="section-heading-inline">白话译文</span>
              <span className="collapse-meta">
                {showTranslation ? '收起' : '展开'}
                <Icon name="chevronDown" size={17} className={showTranslation ? 'rotate-180' : ''} />
              </span>
            </button>
            {showTranslation ? <p className="translation-text">{chapter.translation}</p> : null}
          </section>

          <section className="panel">
            <div className="section-heading">
              <h2>重点字词</h2>
            </div>
            <dl className="notes-list">
              {chapter.notes.map((noteItem) => (
                <div className="note-row" key={noteItem.term}>
                  <dt>{noteItem.term}</dt>
                  <dd>{noteItem.text}</dd>
                </div>
              ))}
            </dl>
          </section>

          {gloss ? (
            <section className="panel">
              <button
                type="button"
                className="collapse-trigger"
                onClick={() => setShowGloss((value) => !value)}
                aria-expanded={showGloss}
              >
                <span className="section-heading-inline">逐字解析</span>
                <span className="collapse-meta">
                  {glossCharCount(gloss)} 字 · {showGloss ? '收起' : '展开'}
                  <Icon name="chevronDown" size={17} className={showGloss ? 'rotate-180' : ''} />
                </span>
              </button>
              {showGloss ? (
                <div className="gloss-lines">
                  {gloss.map((line, lineIndex) => (
                    <div className="gloss-line" key={lineIndex}>
                      <p className="gloss-source">{chapter.text[lineIndex]}</p>
                      <dl className="gloss-grid">
                        {line.map((token, tokenIndex) =>
                          token.gloss ? (
                            <div className="gloss-item" key={tokenIndex}>
                              <dt>
                                <span className="gloss-char">{token.char}</span>
                                <span className="gloss-pinyin">{token.pinyin}</span>
                              </dt>
                              <dd>
                                {token.hint ? <span className="gloss-hint">{token.hint}</span> : null}
                                {token.gloss}
                              </dd>
                            </div>
                          ) : null,
                        )}
                      </dl>
                    </div>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {relatedConcepts.length ? (
            <section className="panel">
              <div className="section-heading">
                <h2>关联概念</h2>
              </div>
              <div className="tag-row">
                {relatedConcepts.map((concept) => (
                  <Link className="tag" key={concept.slug} to={`/concepts/${concept.slug}`}>
                    {concept.name}
                    <span>{concept.chapters.length} 章</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <section className="panel practice-panel" ref={practiceRef} id="practice-note">
            <div className="section-heading">
              <h2>今日实践</h2>
              <span className="muted-text">
                {practiceSavedAt ? `上次保存 ${formatRelative(practiceSavedAt, now)}` : '写一句就够'}
              </span>
            </div>
            <p className="practice-prompt">{chapter.practice}</p>
            <label className="field-label" htmlFor="practice-input">
              我的践行笔记
            </label>
            <textarea
              id="practice-input"
              ref={textareaRef}
              className="textarea"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="这一章落到今天，可以怎么做？记下具体的场景、做法和结果。"
              rows={4}
              maxLength={2000}
            />
            <div className="practice-editor-foot">
              <span className="muted-text">{note.length} / 2000</span>
              <button type="button" className="button button-small button-primary" onClick={savePractice}>
                <Icon name="pencil" size={15} />
                保存笔记
              </button>
            </div>
          </section>

          <nav className="chapter-pager" aria-label="章节导航">
            {previous ? (
              <Link className="pager-link" to={`/chapters/${previous.number}`}>
                <span className="pager-direction">
                  <Icon name="chevronLeft" size={15} />
                  上一章
                </span>
                <strong>
                  第{previous.number}章 · {previous.title}
                </strong>
              </Link>
            ) : (
              <span className="pager-link is-disabled">
                <span className="pager-direction">已是开头</span>
                <strong>道经第一章</strong>
              </span>
            )}
            {next ? (
              <Link className="pager-link is-next" to={`/chapters/${next.number}`}>
                <span className="pager-direction">
                  下一章
                  <Icon name="chevronRight" size={15} />
                </span>
                <strong>
                  第{next.number}章 · {next.title}
                </strong>
              </Link>
            ) : (
              <span className="pager-link is-next is-disabled">
                <span className="pager-direction">已是结尾</span>
                <strong>德经第八十一章</strong>
              </span>
            )}
          </nav>
        </div>

        <aside className="reading-aside">
          <section className="aside-card">
            <h2>背诵与复习</h2>
            {recite ? (
              <div className="recite-summary">
                <div className="recite-score">
                  <strong>{recite.bestScore}</strong>
                  <span>最佳</span>
                </div>
                <dl className="mini-facts">
                  <div>
                    <dt>练习次数</dt>
                    <dd>{recite.attempts} 次</dd>
                  </div>
                  <div>
                    <dt>最近成绩</dt>
                    <dd>{recite.lastScore} 分</dd>
                  </div>
                  <div>
                    <dt>最近练习</dt>
                    <dd>{formatDateTime(recite.lastAt)}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <p className="aside-copy">先读两遍，再用首字提示或填空练一次。系统会记录成绩，并安排复习。</p>
            )}

            {review ? (
              <div className="review-status">
                <span className="status-dot" />
                <div>
                  <strong>{review.dueAt <= now ? '现在可以复习' : '下次复习'}</strong>
                  <p>
                    {review.dueAt <= now
                      ? '已经到期，可以现在过一遍，评分后再安排下一次。'
                      : `下次时间：${formatDue(review.dueAt, now)}`}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="aside-actions">
              <Link className="button button-small button-primary" to={`/memorize/${chapter.number}`}>
                <Icon name="spark" size={15} />
                {recite ? '再背一次' : '开始背诵'}
              </Link>
              {!review ? (
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => {
                    actions.addToReview(chapter.number)
                    toast('已加入复习队列')
                  }}
                >
                  <Icon name="repeat" size={15} />
                  加入复习
                </button>
              ) : review.dueAt <= now ? (
                <Link className="button button-small" to="/review">
                  <Icon name="repeat" size={15} />
                  去复习
                </Link>
              ) : (
                <button
                  type="button"
                  className="button button-small"
                  onClick={() => {
                    actions.addToReview(chapter.number)
                    toast('已调整为现在复习')
                  }}
                >
                  <Icon name="repeat" size={15} />
                  提前复习
                </button>
              )}
            </div>
          </section>

          <section className="aside-card aside-quiet">
            <h2>读法建议</h2>
            <ol className="reading-tips">
              <li>先读原文一遍，不求全懂。</li>
              <li>看译文和注释，只挑一两处记住。</li>
              <li>合上书，用首字提示背一遍。</li>
              <li>把章旨落到今天的一件小事上。</li>
            </ol>
          </section>
        </aside>
      </div>
    </article>
  )
}

export function ChapterPage() {
  const { number } = useParams<{ number: string }>()
  const chapter = number ? getChapter(Number(number)) : undefined
  if (!chapter || !Number.isInteger(Number(number))) {
    return <InvalidChapter number={number ?? ''} />
  }
  // 以章号作 key：切章时重置笔记草稿与展开状态，无需在 effect 里同步
  return <ChapterView chapter={chapter} key={chapter.number} />
}

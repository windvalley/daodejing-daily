import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toast-context'
import { getChapter, chapterLabel, type Chapter } from '../data/chapters'
import { conceptsForChapter } from '../data/concepts'
import { getChapterGloss, glossCharCount, glossMatchesChapter, type CharGloss, type GlossLine } from '../data/glosses'
import { usePageTitle } from '../hooks/usePageTitle'
import { useNow } from '../hooks/useNow'
import { useAppData } from '../hooks/useAppData'
import { useSpeech } from '../hooks/useSpeech'
import { useSwipePager } from '../hooks/useSwipePager'
import { formatDateTime, formatDue, formatRelative } from '../lib/date'
import { chapterSpeechText } from '../lib/speech'
import type { SwipeDirection } from '../lib/swipe'
import { applyToneSandhi } from '../lib/toneSandhi'
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

/**
 * 原文后的就近翻页。
 * 读者常常读完原文就想换章，而页底翻页卡要穿过章旨、译文、注释与践行笔记才够得到；
 * 这里只给方向与章号，视觉重量低于页底卡片，不抢「学完这一章」的语义。
 */
function QuickPager({ previous, next }: { previous: Chapter | undefined; next: Chapter | undefined }) {
  return (
    <nav className="chapter-quicknav" aria-label="原文后翻页">
      {previous ? (
        <Link
          className="quicknav-link"
          to={`/chapters/${previous.number}`}
          aria-label={`上一章：第${previous.number}章 ${previous.title}`}
        >
          <Icon name="chevronLeft" size={15} />
          <span>
            第{previous.number}章 {previous.title}
          </span>
        </Link>
      ) : (
        <span className="quicknav-link is-disabled">已是开头</span>
      )}
      {next ? (
        <Link
          className="quicknav-link"
          to={`/chapters/${next.number}`}
          aria-label={`下一章：第${next.number}章 ${next.title}`}
        >
          <span>
            第{next.number}章 {next.title}
          </span>
          <Icon name="chevronRight" size={15} />
        </Link>
      ) : (
        <span className="quicknav-link is-disabled">已是结尾</span>
      )}
    </nav>
  )
}

interface GlossGroup {
  /** 组内第一个字在本句中的序号，首字高亮要按原序号判断 */
  start: number
  tokens: CharGloss[]
}

/**
 * 把标点并入它前面的字。注音模式下汉字是 inline-block，
 * 浏览器会把「字」与紧跟的标点当成可断行的两段，窄屏上句号会被挤到行首，
 * 而中文标点不允许出现在行首。
 */
function groupByPunctuation(line: GlossLine): GlossGroup[] {
  const groups: GlossGroup[] = []
  line.forEach((token, index) => {
    const previous = groups[groups.length - 1]
    if (previous && !token.pinyin) previous.tokens.push(token)
    else groups.push({ start: index, tokens: [token] })
  })
  return groups
}

function GlossChar({ token, first }: { token: CharGloss; first: boolean }) {
  // 拼音走 CSS 伪元素，正文只留汉字，复制原文时不会带出注音
  if (!token.pinyin) return <>{token.char}</>
  return (
    <span className={first ? 'zi is-first' : 'zi'} data-pinyin={token.pinyin}>
      {token.char}
    </span>
  )
}

/** 注音行：标点与它前面的字同组，组内禁止换行 */
function AnnotatedLine({ line, first }: { line: GlossLine; first: boolean }) {
  return groupByPunctuation(line).map((group) =>
    group.tokens.length > 1 ? (
      <span className="no-break" key={group.start}>
        {group.tokens.map((token, offset) => (
          <GlossChar key={group.start + offset} token={token} first={first && group.start + offset === 0} />
        ))}
      </span>
    ) : (
      <GlossChar key={group.start} token={group.tokens[0]} first={first && group.start === 0} />
    ),
  )
}

function ChapterView({ chapter, headingRef }: { chapter: Chapter; headingRef: RefObject<HTMLHeadingElement | null> }) {
  usePageTitle(`${chapterLabel(chapter.number)} ${chapter.title}`)
  const data = useAppData()
  const now = useNow()
  const toast = useToast()
  const speech = useSpeech()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
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
  // 数据存本调，展示与朗读前按上下文推导「不」「一」的变调
  const gloss = useMemo(() => {
    const stored = getChapterGloss(chapter.number)
    if (!stored || !glossMatchesChapter(stored, chapter)) return null
    return applyToneSandhi(stored)
  }, [chapter])

  useEffect(() => {
    if (searchParams.get('focus') !== 'practice') return undefined
    const timer = window.setTimeout(() => {
      practiceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      textareaRef.current?.focus({ preventScroll: true })
    }, 120)
    return () => window.clearTimeout(timer)
  }, [searchParams, chapter.number])

  /*
   * 左右方向键翻章：桌面端读完一段不用回到页首或页底找链接。
   * 输入框、可编辑区与问道面板里不接管，带修饰键的组合留给浏览器与系统；
   * 首尾章的边界键不 preventDefault，免得白白吃掉一次滚动；
   * 长按产生的重复按键也跳过，否则会一路跨掉十几章。
   * 面板开着时按 document 判断而不是按事件目标：入口没配置 AI 时输入框不出现，
   * 焦点会停在悬浮球上，事件目标落在面板外，只看目标会翻动背后被遮住的章节。
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      // 长按时系统会按重复率连发 keydown，不拦会一路跨掉十几章
      if (event.repeat) return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      )
        return
      if (document.querySelector('[role="dialog"]:not([aria-hidden="true"])')) return
      const destination = event.key === 'ArrowLeft' ? previous : next
      if (!destination) return
      event.preventDefault()
      navigate(`/chapters/${destination.number}`)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, previous, next])

  const swipeTo = useCallback(
    (direction: SwipeDirection) => {
      const destination = direction === 'previous' ? previous : next
      if (destination) navigate(`/chapters/${destination.number}`)
    },
    [navigate, previous, next],
  )

  // 左右滑翻章：手机上读完一段不用去找那行翻页链接
  useSwipePager({ onSwipe: swipeTo })

  // 朗读文本走注音校正：多音字换成同音字再交给 TTS，避免引擎读错
  const speechText = useMemo(() => chapterSpeechText(chapter), [chapter])

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
    speech.speak(speechText, data.settings.speechRate, data.settings.speechVoiceURI, data.settings.speechTimbre)
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
            {/* 焦点在翻章后落到标题，读屏才会播报「已换到第几章」；标题可聚焦但不进 Tab 顺序 */}
            <h1 ref={headingRef} tabIndex={-1} aria-label={`${chapterLabel(chapter.number)} ${chapter.title}`}>
              {chapter.title}
            </h1>
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
                      {showPinyin ? (
                        <AnnotatedLine line={line} first={lineIndex === 0} />
                      ) : (
                        line.map((token) => token.char)
                      )}
                    </p>
                  ))
                : chapter.text.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </section>

          <QuickPager previous={previous} next={next} />

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
  const headingRef = useRef<HTMLHeadingElement>(null)
  const lastNumberRef = useRef<number | null>(null)

  useEffect(() => {
    const current = chapter?.number ?? null
    const last = lastNumberRef.current
    lastNumberRef.current = current
    // 首次进入章页不抢焦点；只有在本页内翻到另一章时，把焦点交给新标题，读屏才知道已经换章
    if (last === null || current === null || last === current) return
    headingRef.current?.focus({ preventScroll: true })
  }, [chapter?.number])

  if (!chapter || !Number.isInteger(Number(number))) {
    return <InvalidChapter number={number ?? ''} />
  }
  // 以章号作 key：切章时重置笔记草稿与展开状态，无需在 effect 里同步
  return <ChapterView chapter={chapter} headingRef={headingRef} key={chapter.number} />
}

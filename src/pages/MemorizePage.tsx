import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Icon } from '../components/Icon'
import { useToast } from '../components/toast-context'
import { Ring, Segmented } from '../components/common'
import { getChapter, type Chapter } from '../data/chapters'
import { usePageTitle } from '../hooks/usePageTitle'
import { useNow } from '../hooks/useNow'
import { useAppData } from '../hooks/useAppData'
import {
  buildBlankExercise,
  diffText,
  evaluateBlanks,
  hintForClause,
  normalize,
  scoreComment,
  splitClauses,
  type BlankEvaluation,
  type DiffResult,
} from '../lib/memorize'
import { formatDue } from '../lib/date'
import { actions } from '../lib/store'

type Mode = 'hint' | 'fill' | 'write'

const modeOptions: { value: Mode; label: string }[] = [
  { value: 'hint', label: '首字提示' },
  { value: 'fill', label: '填空' },
  { value: 'write', label: '默写' },
]

const modeHints: Record<Mode, string> = {
  hint: '每句只露第一个字。想不起时点一下句子，翻开对照。',
  fill: '随机挖去若干字，逐格填写。检查后会把错处标出来。',
  write: '合上原文，整章写下来。标点不必计较，只看字句是否记得。',
}

function AttemptResult({
  score,
  detail,
  onRetry,
  chapterNumber,
}: {
  score: number
  detail: string
  onRetry: () => void
  chapterNumber: number
}) {
  return (
    <div className="attempt-result" role="status">
      <Ring value={score} max={100} size={82} label={`得分 ${score} 分`}>
        <strong>{score}</strong>
        <span>分</span>
      </Ring>
      <div className="attempt-copy">
        <h3>{score >= 85 ? '这一章很稳了' : score >= 60 ? '基本记住，再补几处' : '还需要多读两遍'}</h3>
        <p>{scoreComment(score)}</p>
        <p className="attempt-detail">{detail}</p>
      </div>
      <div className="attempt-actions">
        <button type="button" className="button button-small" onClick={onRetry}>
          <Icon name="refresh" size={15} />
          再练一次
        </button>
        <Link className="button button-small button-primary" to="/review">
          去复习
          <Icon name="arrowRight" size={15} />
        </Link>
        <Link className="button button-small button-ghost" to={`/chapters/${chapterNumber}`}>
          回原文
        </Link>
      </div>
    </div>
  )
}

function HintMode({ chapter }: { chapter: Chapter }) {
  const toast = useToast()
  const data = useAppData()
  const clauses = useMemo(() => splitClauses(chapter.text), [chapter])
  const [revealed, setRevealed] = useState<Set<number>>(new Set())
  const [rated, setRated] = useState<number | null>(null)

  const toggle = (index: number) => {
    setRevealed((current) => {
      const next = new Set(current)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const revealAll = () => setRevealed(new Set(clauses.map((_, index) => index)))

  const rate = (score: number) => {
    if (rated !== null) return
    setRated(score)
    actions.recordRecite(chapter.number, score, 'hint')
    toast(`已记录本次自评：${score} 分`)
  }

  const record = data.recite[chapter.number]

  return (
    <div className="exercise">
      <div className="exercise-toolbar">
        <span className="muted-text">
          已翻开 {revealed.size} / {clauses.length} 句
        </span>
        <div className="row gap-sm">
          <button type="button" className="button button-small" onClick={revealAll}>
            <Icon name="eye" size={15} />
            全部翻开
          </button>
          <button type="button" className="button button-small button-ghost" onClick={() => setRevealed(new Set())}>
            重新遮住
          </button>
        </div>
      </div>

      <ol className="hint-list">
        {clauses.map((clause, index) => {
          const hint = hintForClause(clause)
          const isRevealed = revealed.has(index)
          return (
            <li key={`${clause}-${index}`}>
              <button
                type="button"
                className={isRevealed ? 'hint-clause is-revealed' : 'hint-clause'}
                onClick={() => toggle(index)}
                aria-label={isRevealed ? `遮住第 ${index + 1} 句` : `翻开第 ${index + 1} 句`}
              >
                {isRevealed ? (
                  <span className="clause-text">{clause}</span>
                ) : (
                  <>
                    <span className="hint-first">{hint.first}</span>
                    <span className="hint-dots" aria-hidden="true">
                      {'○'.repeat(Math.max(0, Math.min(12, hint.length - 1)))}
                      {hint.length - 1 > 12 ? '…' : ''}
                    </span>
                    <span className="hint-count">{hint.length} 字</span>
                  </>
                )}
              </button>
            </li>
          )
        })}
      </ol>

      <div className="self-grade">
        <p>合上提示，整章回想一遍，再给自己一个判断：</p>
        <div className="grade-buttons">
          <button type="button" className="grade-button grade-0" onClick={() => rate(45)} disabled={rated !== null}>
            <strong>没记住</strong>
            <span>再读一遍</span>
          </button>
          <button type="button" className="grade-button grade-1" onClick={() => rate(70)} disabled={rated !== null}>
            <strong>大致记得</strong>
            <span>需要补字</span>
          </button>
          <button type="button" className="grade-button grade-2" onClick={() => rate(95)} disabled={rated !== null}>
            <strong>很熟</strong>
            <span>可以复习</span>
          </button>
        </div>
        {rated !== null ? (
          <p className="rated-note">
            本次自评 {rated} 分，已记录。最佳成绩 {record?.bestScore ?? rated} 分。
            <button type="button" className="text-link" onClick={() => setRated(null)}>
              再自评一次
            </button>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function FillMode({ chapter }: { chapter: Chapter }) {
  const toast = useToast()
  const data = useAppData()
  const [seed, setSeed] = useState(() => chapter.number * 7919)
  const exercise = useMemo(() => buildBlankExercise(chapter.text, seed), [chapter, seed])
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [evaluation, setEvaluation] = useState<BlankEvaluation | null>(null)
  const inputs = useRef<Record<number, HTMLInputElement | null>>({})

  const focusNext = (id: number) => {
    const nextBlank = exercise.blanks.find((blank) => blank.id > id)
    if (nextBlank) window.setTimeout(() => inputs.current[nextBlank.id]?.focus(), 0)
  }

  const commit = (id: number, raw: string) => {
    const char = Array.from(normalize(raw)).slice(-1)[0] ?? ''
    setDrafts((current) => ({ ...current, [id]: char }))
    setAnswers((current) => ({ ...current, [id]: char }))
    if (char) focusNext(id)
  }

  /** 输入法组字期间保留原始串，组字结束后只取最后一个字，兼顾拼音输入与逐格填写 */
  const handleChange = (id: number, value: string, composing: boolean) => {
    setDrafts((current) => ({ ...current, [id]: value }))
    if (composing) return
    commit(id, value)
  }

  const check = () => {
    if (evaluation) return
    if (!Object.values(answers).some(Boolean)) {
      toast('先填几个字，再检查。')
      return
    }
    const result = evaluateBlanks(exercise.blanks, answers)
    setEvaluation(result)
    actions.recordRecite(chapter.number, result.score, 'fill')
    toast(`本次 ${result.score} 分，已记录`)
  }

  const retry = () => {
    setSeed((value) => value + 1)
    setDrafts({})
    setAnswers({})
    setEvaluation(null)
  }

  const correctById = new Map(evaluation?.results.map((result) => [result.id, result]) ?? [])

  return (
    <div className="exercise">
      <div className="exercise-toolbar">
        <span className="muted-text">
          共 {exercise.blanks.length} 空
          {data.recite[chapter.number] ? ` · 最佳 ${data.recite[chapter.number].bestScore} 分` : ''}
        </span>
        <button type="button" className="button button-small button-ghost" onClick={retry}>
          <Icon name="refresh" size={15} />
          换一组
        </button>
      </div>

      <div className={evaluation ? 'fill-text is-checked' : 'fill-text'} aria-label="填空练习">
        {exercise.chars.map((item, index) => {
          if (item.blankId === undefined) {
            return (
              <span className="fill-char" key={index}>
                {item.char}
              </span>
            )
          }
          const result = correctById.get(item.blankId)
          const className = result
            ? result.correct
              ? 'blank-input is-correct'
              : `blank-input is-wrong${result.input ? '' : ' is-empty'}`
            : 'blank-input'
          return (
            <input
              key={index}
              ref={(element) => {
                inputs.current[item.blankId as number] = element
              }}
              className={className}
              type="text"
              value={evaluation ? result?.input || '' : (drafts[item.blankId] ?? answers[item.blankId] ?? '')}
              onChange={(event) =>
                handleChange(item.blankId as number, event.target.value, (event.nativeEvent as InputEvent).isComposing)
              }
              onCompositionEnd={(event) => commit(item.blankId as number, (event.target as HTMLInputElement).value)}
              onFocus={(event) => event.target.select()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') check()
              }}
              disabled={Boolean(evaluation)}
              aria-label={`第 ${item.blankId + 1} 空`}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          )
        })}
      </div>

      {evaluation ? (
        <>
          <div className="blank-review">
            {evaluation.results.filter((result) => !result.correct).length ? (
              <p>
                需要改正：
                {evaluation.results
                  .filter((result) => !result.correct)
                  .map((result) => (
                    <span className="wrong-pair" key={result.id}>
                      <em>{result.input || '空'}</em> → <strong>{result.answer}</strong>
                    </span>
                  ))}
              </p>
            ) : (
              <p>所有空格都填对了。</p>
            )}
          </div>
          <AttemptResult
            score={evaluation.score}
            detail={`填对 ${evaluation.correct} / ${evaluation.total} 空。`}
            onRetry={retry}
            chapterNumber={chapter.number}
          />
        </>
      ) : (
        <div className="exercise-foot">
          <button type="button" className="button button-primary" onClick={check}>
            <Icon name="checkCircle" size={16} />
            检查答案
          </button>
          <span className="muted-text">不会的空着也没关系，检查后看正确答案。</span>
        </div>
      )}
    </div>
  )
}

function WriteMode({ chapter }: { chapter: Chapter }) {
  const toast = useToast()
  const data = useAppData()
  const [draft, setDraft] = useState('')
  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [showOriginal, setShowOriginal] = useState(false)

  const submit = () => {
    if (!normalize(draft)) {
      toast('先写一点内容，再对照原文。')
      return
    }
    const result = diffText(chapter.text.join(''), draft)
    setDiff(result)
    actions.recordRecite(chapter.number, result.score, 'write')
    toast(`本次 ${result.score} 分，已记录`)
  }

  const retry = () => {
    setDraft('')
    setDiff(null)
    setShowOriginal(false)
  }

  return (
    <div className="exercise">
      <div className="exercise-toolbar">
        <span className="muted-text">
          {draft.length} 字{data.recite[chapter.number] ? ` · 最佳 ${data.recite[chapter.number].bestScore} 分` : ''}
        </span>
        <button
          type="button"
          className="button button-small button-ghost"
          onClick={() => setShowOriginal((value) => !value)}
        >
          <Icon name="eye" size={15} />
          {showOriginal ? '遮住原文' : '看原文'}
        </button>
      </div>

      {showOriginal ? (
        <div className="write-reference">
          {chapter.text.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      ) : null}

      {diff ? (
        <>
          <div className="diff-panel">
            <h3>对照结果</h3>
            <div className="diff-text">
              {diff.lines.map((line, lineIndex) => (
                <p key={lineIndex}>
                  {line.map((mark, index) =>
                    mark.punctuation ? (
                      <span key={index} className="diff-punctuation">
                        {mark.char}
                      </span>
                    ) : (
                      <span key={index} className={mark.ok ? 'diff-ok' : 'diff-missing'}>
                        {mark.char}
                      </span>
                    ),
                  )}
                </p>
              ))}
            </div>
            {diff.extraText ? (
              <p className="diff-extra">
                多写的字：<span>{diff.extraText}</span>
              </p>
            ) : null}
            <p className="diff-legend">
              <span className="legend-missing" /> 红色为漏写或写错的位置
            </p>
          </div>
          <AttemptResult
            score={diff.score}
            detail={`写对 ${diff.correct} 字，漏写或写错 ${diff.missing} 字，多写 ${diff.extra} 字，原文共 ${diff.total} 字。`}
            onRetry={retry}
            chapterNumber={chapter.number}
          />
        </>
      ) : (
        <>
          <label className="field-label" htmlFor="write-input">
            默写第{chapter.number}章
          </label>
          <textarea
            id="write-input"
            className="textarea write-textarea"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="从「{chapter.text[0].slice(0, 8)}…」开始写。标点可以省略。"
            rows={9}
            spellCheck={false}
          />
          <div className="exercise-foot">
            <button type="button" className="button button-primary" onClick={submit}>
              <Icon name="checkCircle" size={16} />
              对照原文
            </button>
            <span className="muted-text">提交后自动评分，60 分以上自动加入复习。</span>
          </div>
        </>
      )}
    </div>
  )
}

function MemorizeView({ chapter }: { chapter: Chapter }) {
  usePageTitle(`背诵 · 第${chapter.number}章`)
  const data = useAppData()
  const now = useNow()
  const [mode, setMode] = useState<Mode>('hint')
  const record = data.recite[chapter.number]
  const review = data.review[chapter.number]

  return (
    <div className="page memorize-page">
      <nav className="crumbs" aria-label="面包屑">
        <Link to="/memorize" className="crumb-back">
          <Icon name="chevronLeft" size={16} />
          背诵
        </Link>
        <span className="crumb-divider">/</span>
        <span>第{chapter.number}章</span>
      </nav>

      <header className="memorize-header">
        <span className="chapter-seal" aria-hidden="true">
          {chapter.number}
        </span>
        <div className="memorize-heading">
          <p className="page-eyebrow">
            {chapter.section === 'dao' ? '道经' : '德经'} · 第{chapter.number}章
          </p>
          <h1>{chapter.title}</h1>
          <p>{chapter.gist}</p>
        </div>
        <div className="memorize-head-meta">
          {record && record.bestScore >= 60 ? (
            <span className="score-pill">
              最佳 <strong>{record.bestScore}</strong> 分
            </span>
          ) : record ? (
            <span className="score-pill is-muted">
              练习 {record.attempts} 次 · 最高 {record.bestScore} 分
            </span>
          ) : (
            <span className="score-pill is-muted">尚未练习</span>
          )}
          <Link className="button button-small button-ghost" to={`/chapters/${chapter.number}`}>
            <Icon name="book" size={15} />
            看原文
          </Link>
        </div>
      </header>

      <div className="mode-switch">
        <Segmented options={modeOptions} value={mode} onChange={setMode} ariaLabel="背诵方式" />
        <p className="mode-hint">{modeHints[mode]}</p>
      </div>

      <section className="panel exercise-panel">
        {mode === 'hint' ? <HintMode chapter={chapter} key="hint" /> : null}
        {mode === 'fill' ? <FillMode chapter={chapter} key={`fill-${chapter.number}`} /> : null}
        {mode === 'write' ? <WriteMode chapter={chapter} key="write" /> : null}
      </section>

      <footer className="memorize-foot">
        <div>
          <strong>复习状态</strong>
          <p>
            {review
              ? review.dueAt <= now
                ? '现在已经可以复习。'
                : `下次复习：${formatDue(review.dueAt, now)}`
              : '练习达到 60 分，会自动加入间隔复习。'}
          </p>
        </div>
        <Link className="text-link with-icon" to="/review">
          打开复习
          <Icon name="arrowRight" size={15} />
        </Link>
      </footer>
    </div>
  )
}

export function MemorizePage() {
  const { number } = useParams<{ number: string }>()
  const chapter = number ? getChapter(Number(number)) : undefined
  if (!chapter) {
    return (
      <div className="page">
        <div className="empty-state standalone">
          <span className="empty-icon">
            <Icon name="spark" size={26} />
          </span>
          <h3>没有找到这一章</h3>
          <p>可以从背诵目录选择一章。</p>
          <Link className="button button-primary" to="/memorize">
            回到背诵
          </Link>
        </div>
      </div>
    )
  }
  return <MemorizeView chapter={chapter} key={chapter.number} />
}

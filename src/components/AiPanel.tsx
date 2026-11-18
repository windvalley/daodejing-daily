import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChapter } from '../data/chapters'
import { getConcept } from '../data/concepts'
import { useAiChat } from '../hooks/useAiChat'
import type { AiErrorKind } from '../lib/ai'
import { fallbackChapters, seedQuestions, type AiFocus } from '../lib/aiContext'
import { citationNotice, type CitationReport } from '../lib/aiCitations'
import { Icon } from './Icon'

/** 重试有机会成功的错误。鉴权与额度重试也是同一个结果，只给指路 */
const RETRYABLE = new Set<AiErrorKind>(['timeout', 'network', 'parse', 'offline'])

const ERROR_COPY: Record<AiErrorKind, string> = {
  'not-configured': '还没有配置 AI 服务。',
  offline: '当前处于离线状态，先看看书里怎么写的。',
  auth: '密钥无效或已过期，去「我的」里检查。',
  quota: '额度或请求频率受限，稍后再试。',
  timeout: '等待回复超时，可以重试。',
  parse: '服务返回的内容不是预期格式。',
  network: '这次请求没有成功，检查服务地址与网络后重试。',
}

/** 焦点对应的面板副标题，让读者确认这次问的是哪一章 */
function focusLabel(focus: AiFocus): string {
  if (focus.kind === 'chapter') {
    const chapter = getChapter(focus.chapter)
    return chapter ? `正在读第${chapter.number}章 · ${chapter.title}` : '就当前这一章提问'
  }
  if (focus.kind === 'concept') {
    const concept = getConcept(focus.concept)
    return concept ? `正在看概念「${concept.name}」` : '就这个概念提问'
  }
  return '就全书提问'
}

/**
 * 焦点的稳定标识。
 * 翻章或换概念时会话整体重挂，避免把上一章的历史带进新一章的追问里：
 * 否则读者在第 1 章问完再翻到第 50 章，标题写着第 50 章，材料却是第 1 章的上下文。
 */
function focusKey(focus: AiFocus): string {
  if (focus.kind === 'chapter') return `chapter-${focus.chapter}`
  if (focus.kind === 'concept') return `concept-${focus.concept}`
  return 'none'
}

export function AiPanel({ open, onClose, focus }: { open: boolean; onClose: () => void; focus: AiFocus }) {
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()

  // 打开时锁住背后的页面滚动，否则手机上滑面板会带着整页一起动
  useEffect(() => {
    if (!open) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  /*
   * Esc 关闭，Tab 在面板内循环。
   * 面板盖住了整页，焦点跑到背后的章节按钮上会让键盘读者彻底迷路。
   */
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  return (
    <>
      {open ? <div className="ai-scrim" onClick={onClose} aria-hidden="true" /> : null}
      <aside
        ref={panelRef}
        className={open ? 'ai-panel is-open' : 'ai-panel'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
        inert={!open}
      >
        <header className="ai-head">
          <span className="ai-seal" aria-hidden="true">
            问
          </span>
          <div className="ai-head-copy">
            <strong id={titleId}>问道</strong>
            <small>{focusLabel(focus)}</small>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭问道">
            <Icon name="x" size={19} />
          </button>
        </header>

        <AiSession key={focusKey(focus)} open={open} focus={focus} onClose={onClose} />
      </aside>
    </>
  )
}

/**
 * 请求失败时的本地兜底。
 * 只依赖书里的数据，断网与未配置时都能出结果，比一个空错误提示有用。
 */
function LocalFallback({
  question,
  focus,
  focusToken,
  onNavigate,
}: {
  question: string
  focus: AiFocus
  /** focus 每次渲染都是新对象，用它的字符串标识做依赖，免得 memo 形同虚设 */
  focusToken: string
  onNavigate: () => void
}) {
  // 要扫全书，放在 useMemo 里，免得父组件每次重渲染都重算一遍
  // eslint-disable-next-line react-hooks/exhaustive-deps -- focus 由 focusToken 代表
  const chapters = useMemo(() => fallbackChapters(question, focus), [question, focusToken])
  if (!chapters.length) return null
  return (
    <div className="ai-fallback">
      <p>书里的相关章节：</p>
      <ul>
        {chapters.map((chapter) => (
          <li key={chapter.number}>
            <Link to={`/chapters/${chapter.number}`} onClick={onNavigate}>
              第{chapter.number}章 {chapter.title}
            </Link>
            <span>{chapter.text[0]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 助手回答：正文、依据章号与引用核查提示 */
function AssistantMessage({
  content,
  report,
  onNavigate,
}: {
  content: string
  report?: CitationReport
  onNavigate: () => void
}) {
  const notice = report ? citationNotice(report) : null
  return (
    <div className="ai-message is-assistant">
      <p className="ai-bubble">{content}</p>
      {report && report.chapters.length ? (
        <div className="ai-cites">
          <span>依据：</span>
          {report.chapters.map((number) => (
            <Link key={number} className="ai-cite-link" to={`/chapters/${number}`} onClick={onNavigate}>
              第{number}章
            </Link>
          ))}
        </div>
      ) : null}
      {notice ? <p className="ai-notice">{notice}</p> : null}
    </div>
  )
}

/**
 * 一次会话。
 * 用 focusKey 作为 key 挂在父组件上：翻章就整体重挂，历史与草稿一起清空。
 * 关掉面板不改变 key，所以会话在关开之间保留，方便中途回章页核对原文。
 */
function AiSession({ open, focus, onClose }: { open: boolean; focus: AiFocus; onClose: () => void }) {
  const chat = useAiChat({ focus })
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const focusToken = focusKey(focus)

  // 打开时把光标放进输入框。放在这一层是因为输入框在会话内部，重挂之后要重新聚焦
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // 新消息到达后滚到底部，否则回答一长读者还以为没反应
  useEffect(() => {
    const body = bodyRef.current
    if (body) body.scrollTop = body.scrollHeight
  }, [chat.messages, chat.pending])

  const submit = async (question: string) => {
    const text = question.trim()
    if (!text || chat.pending) return
    setDraft('')
    await chat.send(text)
  }

  const seeds = focus.kind === 'chapter' ? seedQuestions(focus.chapter) : []

  if (!chat.configured) {
    return (
      <div className="ai-body">
        <div className="ai-empty">
          <h3>还没有接入 AI</h3>
          <p>
            问道需要一个兼容 OpenAI 接口的模型服务，地址、模型名与密钥都填在「我的」里。
            配置只存在这台设备上，不会跟随备份导出，也不会走任何中转服务。
          </p>
          <p className="ai-empty-note">不配置也没关系，阅读、背诵、复习与实践都不依赖它，断网时照样能用。</p>
          <Link className="button button-primary button-small" to="/settings" onClick={onClose}>
            去配置
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="ai-body" ref={bodyRef} role="log" aria-live="polite" aria-busy={chat.pending}>
        {chat.messages.length === 0 ? (
          <div className="ai-intro">
            <p>
              {chat.config.economy
                ? '省流模式已打开：只发送当前这一章，别章的内容发不出去。'
                : '全书八十一章已作为材料发过去，可以直接问别章。'}
              {chat.config.webSearch ? '已开启联网，书外的说法会单独标注来源。' : ''}
            </p>
            {seeds.length ? (
              <div className="ai-seeds">
                {seeds.map((question) => (
                  <button key={question} type="button" className="ai-seed" onClick={() => void submit(question)}>
                    {question}
                  </button>
                ))}
              </div>
            ) : (
              <p className="muted-text">可以直接问，例如「这一章和第八十一章是什么关系？」</p>
            )}
          </div>
        ) : null}

        {chat.messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="ai-message is-user">
              <p className="ai-bubble">{message.content}</p>
            </div>
          ) : message.error ? (
            <div key={message.id} className="ai-message is-assistant">
              <div className="ai-error">
                <p>{ERROR_COPY[message.error.kind]}</p>
                {message.error.kind !== 'auth' && message.error.kind !== 'quota' ? (
                  <LocalFallback
                    question={message.error.question}
                    focus={focus}
                    focusToken={focusToken}
                    onNavigate={onClose}
                  />
                ) : null}
                <div className="ai-error-actions">
                  {/*
                   * 重试要能拿回原问题：发送时输入框已清空，没有这个按钮读者只能整段重打。
                   * 鉴权与额度这两类重试也不会成功，只给指路。
                   */}
                  {RETRYABLE.has(message.error.kind) ? (
                    <button
                      type="button"
                      className="button button-small"
                      onClick={() => void chat.send(message.error!.question)}
                      disabled={chat.pending}
                    >
                      重试
                    </button>
                  ) : null}
                  {message.error.kind === 'auth' ? (
                    <Link className="text-link" to="/settings" onClick={onClose}>
                      去检查配置
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <AssistantMessage key={message.id} content={message.content} report={message.report} onNavigate={onClose} />
          ),
        )}

        {chat.pending ? (
          <div className="ai-message is-assistant">
            <p className="ai-bubble ai-thinking">正在翻书…</p>
          </div>
        ) : null}
      </div>

      <form
        className="ai-composer"
        onSubmit={(event) => {
          event.preventDefault()
          void submit(draft)
        }}
      >
        <textarea
          ref={inputRef}
          className="ai-textarea"
          aria-label="你的问题"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // 回车发送、Shift+回车换行，与聊天软件的习惯一致
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              void submit(draft)
            }
          }}
          rows={2}
          maxLength={500}
          placeholder="问这一章的意思、读音，或它和别章的关系…"
        />
        <div className="ai-composer-foot">
          <p className="ai-privacy">只发送你在这里输入的内容，不会带上践行笔记。</p>
          {chat.pending ? (
            <button type="button" className="button button-small" onClick={chat.cancel}>
              停止
            </button>
          ) : (
            <button type="submit" className="button button-small button-primary" disabled={!draft.trim()}>
              发送
            </button>
          )}
        </div>
      </form>
    </>
  )
}

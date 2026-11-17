import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getChapter } from '../data/chapters'
import { getConcept } from '../data/concepts'
import { useAiChat } from '../hooks/useAiChat'
import type { AiErrorKind } from '../lib/ai'
import { fallbackChapters, seedQuestions, type AiFocus } from '../lib/aiContext'
import { citationNotice, type CitationReport } from '../lib/aiCitations'
import { Icon } from './Icon'

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

export function AiPanel({ open, onClose, focus }: { open: boolean; onClose: () => void; focus: AiFocus }) {
  const chat = useAiChat({ focus })
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  // 打开时把光标放进输入框，并监听 Esc 关闭
  useEffect(() => {
    if (!open) return undefined
    inputRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

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

  return (
    <>
      {open ? <div className="ai-scrim" onClick={onClose} aria-hidden="true" /> : null}
      <aside
        className={open ? 'ai-panel is-open' : 'ai-panel'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={!open}
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

        {!chat.configured ? (
          <div className="ai-body" ref={bodyRef}>
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
        ) : (
          <>
            <div className="ai-body" ref={bodyRef}>
              {chat.messages.length === 0 ? (
                <div className="ai-intro">
                  <p>
                    {chat.config.economy
                      ? '省流模式已打开，只发送当前这一章。'
                      : '全书八十一章已作为材料发过去，可以直接问别章。'}
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
                        <LocalFallback question={message.error.question} focus={focus} onNavigate={onClose} />
                      ) : null}
                      {message.error.kind === 'auth' ? (
                        <Link className="text-link" to="/settings" onClick={onClose}>
                          去检查配置
                        </Link>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <AssistantMessage
                    key={message.id}
                    content={message.content}
                    report={message.report}
                    onNavigate={onClose}
                  />
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
        )}
      </aside>
    </>
  )
}

/**
 * 请求失败时的本地兜底。
 * 只依赖书里的数据，断网与未配置时都能出结果，比一个空错误提示有用。
 */
function LocalFallback({ question, focus, onNavigate }: { question: string; focus: AiFocus; onNavigate: () => void }) {
  // 要扫全书，放在 useMemo 里，免得父组件每次重渲染都重算一遍
  const chapters = useMemo(() => fallbackChapters(question, focus), [question, focus])
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

/**
 * AI 助手的最小客户端。
 *
 * 应用本身完全离线，AI 只是可选增强：没有配置、没有网络、厂商报错时，
 * 这里只返回结构化结果，不向调用方抛异常，由调用方按 kind 决定降级方式。
 *
 * 配置单独存一个 localStorage 键，不进 AppData。原因是 store 的 exportData()
 * 会把整个 state 序列化进备份文件，密钥一旦进 state，用户分享备份就等于泄露密钥。
 */

export interface AiConfig {
  /** 兼容 OpenAI Chat Completions 的完整地址，如 https://api.example.com/v1/chat/completions */
  endpoint: string
  model: string
  apiKey: string
  /** 省流模式：只发当前章节，不发全书 */
  economy: boolean
  /** 联网搜索：由服务端执行检索，用来回答本书之外的问题 */
  webSearch: boolean
}

export type ChatRole = 'system' | 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export const AI_STORAGE_KEY = 'daodejing.ai.v1'

export const EMPTY_AI_CONFIG: AiConfig = {
  endpoint: '',
  model: '',
  apiKey: '',
  economy: false,
  webSearch: false,
}

/** 默认 30 秒。全书前缀约两万 token，慢一点的模型也要留出余量 */
export const AI_TIMEOUT_MS = 30_000

/**
 * 七类错误。调用方按 kind 选择文案与兜底方式，不要去匹配 message。
 * 读者主动取消不算错误，单独返回 aborted。
 */
export type AiErrorKind = 'not-configured' | 'offline' | 'auth' | 'quota' | 'timeout' | 'parse' | 'network'

export type AiResult =
  /**
   * partial 为真表示读者中途点了停止，content 是已经显示出来的那部分。
   * 这种回答不完整，界面不该再对它做引用核查，否则会把截断处判成「引文有问题」。
   */
  | { status: 'ok'; content: string; partial?: boolean }
  | { status: 'aborted' }
  | { status: 'error'; kind: AiErrorKind; message: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

/** 把任意来源的配置整理成可用结构，多余字段丢弃 */
export function sanitizeAiConfig(input: unknown): AiConfig {
  if (!isRecord(input)) return { ...EMPTY_AI_CONFIG }
  return {
    endpoint: text(input.endpoint),
    model: text(input.model),
    apiKey: text(input.apiKey),
    economy: input.economy === true,
    webSearch: input.webSearch === true,
  }
}

/**
 * 把读者填的地址补全成真正的接口地址。
 *
 * 各家文档给的往往是服务根地址（如 https://api.deepseek.com），直接 POST 上去是 404，
 * 而 404 在界面上只会显示成「请求失败（HTTP 404）」，读者根本不知道少写了一段路径。
 * 这里只处理两种能确定的情况，其余原样保留，免得自作主张把自定义网关的路径改坏：
 *
 * - 已经以 /chat/completions 结尾：不动。
 * - 以 /v1、/v2 这类版本段结尾：补 /chat/completions。
 * - 只有协议与主机：补 /v1/chat/completions。
 */
export function normalizeEndpoint(input: string): string {
  const value = input.trim().replace(/\/+$/, '')
  if (!value) return ''
  if (/\/chat\/completions$/.test(value)) return value
  if (/\/v\d+[a-z0-9.-]*$/i.test(value)) return `${value}/chat/completions`
  try {
    const url = new URL(value)
    if (url.pathname === '/' || url.pathname === '') return `${url.origin}/v1/chat/completions`
  } catch {
    return value
  }
  return value
}

/** 三项都填了才算配置完成；省流开关不影响可用性 */
export function isAiConfigured(config: AiConfig): boolean {
  return Boolean(config.endpoint && config.model && config.apiKey)
}

function readRawConfig(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(AI_STORAGE_KEY)
  } catch {
    return null
  }
}

// 配置是一份外部状态，界面用 useSyncExternalStore 订阅它。
// 缓存按原始字符串比较，保证快照引用稳定，否则每次渲染都会触发重复订阅。
let cachedRaw: string | null | undefined
let cachedConfig: AiConfig = { ...EMPTY_AI_CONFIG }

const configListeners = new Set<() => void>()
let storageBound = false

function emitConfigChange(): void {
  cachedRaw = undefined
  configListeners.forEach((listener) => listener())
}

/** 订阅配置变化。跨标签页的写入也要能反映过来，所以顺带挂一个 storage 监听 */
export function subscribeAiConfig(listener: () => void): () => void {
  configListeners.add(listener)
  if (!storageBound && typeof window !== 'undefined') {
    storageBound = true
    window.addEventListener('storage', (event) => {
      if (event.key === AI_STORAGE_KEY || event.key === null) emitConfigChange()
    })
  }
  return () => {
    configListeners.delete(listener)
  }
}

export function getAiConfigSnapshot(): AiConfig {
  const raw = readRawConfig()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    if (!raw) {
      cachedConfig = { ...EMPTY_AI_CONFIG }
    } else {
      try {
        cachedConfig = sanitizeAiConfig(JSON.parse(raw))
      } catch {
        cachedConfig = { ...EMPTY_AI_CONFIG }
      }
    }
  }
  return cachedConfig
}

export function loadAiConfig(): AiConfig {
  return getAiConfigSnapshot()
}

export function saveAiConfig(config: AiConfig): AiConfig {
  const clean = sanitizeAiConfig(config)
  if (typeof window === 'undefined') return clean
  try {
    window.localStorage.setItem(AI_STORAGE_KEY, JSON.stringify(clean))
    emitConfigChange()
  } catch (error) {
    // 隐私模式或配额满时写入会失败，此时仅本次会话可用，不回滚内存中的配置
    console.error('保存 AI 配置失败', error)
  }
  return clean
}

export function clearAiConfig(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(AI_STORAGE_KEY)
    emitConfigChange()
  } catch (error) {
    console.error('清除 AI 配置失败', error)
  }
}

/**
 * DeepSeek 的联网搜索是服务端工具，声明后由服务端执行检索并附引用。
 * type 必须是 deepseek_web_search：写成 OpenAI 的 web_search 会被 422 拒绝。
 */
export const WEB_SEARCH_TOOL = { type: 'deepseek_web_search' } as const

/**
 * 请求体只带最小字段，避免不同厂商忽略不认识的参数时报错。
 * tools 仅在读者主动开启联网时才带，没开时请求体与之前完全一致。
 * stream_options 只在流式时带，用来在最后一块里拿到用量。
 */
function buildBody(messages: ChatMessage[], model: string, webSearch = false, stream = false): string {
  const body: Record<string, unknown> = { model, messages, stream }
  if (webSearch) body.tools = [WEB_SEARCH_TOOL]
  if (stream) body.stream_options = { include_usage: true }
  return JSON.stringify(body)
}

/**
 * 从 SSE 缓冲区里切出完整事件，返回事件体与剩下的半截。
 *
 * 网络分块不按事件边界切，一个 data 行可能被拆成两次收到，
 * 所以在凑满空行之前不能解析，否则会拿到半截 JSON。
 */
export function splitSseEvents(buffer: string): { events: string[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  const events: string[] = []
  parts.forEach((block) => {
    // 同一个事件里的多行 data 按规范用换行拼接，这里只取 data 行
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (data) events.push(data)
  })
  return { events, rest }
}

/**
 * 解析一条流事件，返回这次要追加的正文。
 *
 * 只取 delta.content：DeepSeek 的思考过程放在 delta.reasoning_content，
 * 那是模型的草稿，不该出现在界面里。联网时还会有 server_tool_calls 与 annotations，
 * 这里一律忽略，让界面只显示正文。
 */
export function contentOfSseData(data: string): string | null {
  if (data === '[DONE]') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.choices)) return null
  const choice = parsed.choices[0]
  if (!isRecord(choice) || !isRecord(choice.delta)) return null
  const content = choice.delta.content
  return typeof content === 'string' && content ? content : null
}

/** 流里是否有厂商报错，例如流到一半返回 {"error":{...}} */
export function errorOfSseData(data: string): string | null {
  if (data === '[DONE]') return null
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null
  }
  if (!isRecord(parsed) || !isRecord(parsed.error)) return null
  const message = parsed.error.message
  return typeof message === 'string' && message.trim() ? message.trim() : '生成过程中出错。'
}

function errorKindOfStatus(status: number): AiErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402 || status === 429) return 'quota'
  return 'network'
}

/** 尽量把厂商返回的错误文案带出来，取不到就用状态码兜底 */
function vendorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    const error = body.error
    if (isRecord(error) && typeof error.message === 'string' && error.message.trim()) return error.message.trim()
    if (typeof body.message === 'string' && body.message.trim()) return body.message.trim()
  }
  return `请求失败（HTTP ${status}）`
}

function contentOf(body: unknown): string | null {
  if (!isRecord(body) || !Array.isArray(body.choices)) return null
  const choice = body.choices[0]
  if (!isRecord(choice) || !isRecord(choice.message)) return null
  const content = choice.message.content
  if (typeof content !== 'string') return null
  const trimmed = content.trim()
  return trimmed || null
}

export interface RequestOptions {
  /** 外部取消信号，例如读者点了「停止」或关闭了面板 */
  signal?: AbortSignal
  /**
   * 收到正文增量时回调，传了就往流式请求走。
   * 不传则是原来的整段请求，用于兼容不支持流式的网关。
   */
  onDelta?: (text: string) => void
  timeoutMs?: number
  /** 测试注入用，默认 globalThis.fetch */
  fetchImpl?: typeof fetch
}

/** 读流并逐段回调，返回完整正文；流被取消时把已收到的部分一并带回去 */
async function readStream(
  response: Response,
  controller: AbortController,
  options: RequestOptions,
  touch: () => void,
): Promise<{ content: string; aborted: boolean; streamError: string | null }> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('响应没有可读的流')

  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let streamError: string | null = null

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>
    try {
      chunk = await reader.read()
    } catch (error) {
      // 取消时 read 会抛，交给上层按 aborted 处理
      if (controller.signal.aborted) return { content, aborted: true, streamError }
      throw error
    }
    if (chunk.done) break
    touch()
    buffer += decoder.decode(chunk.value, { stream: true })

    /*
     * 有些网关把错误直接写成不带 data: 前缀的一行 JSON。
     * 这种行没有 data 字段，会被事件切分当成空事件丢掉，所以先整块看一眼。
     */
    const bare = buffer.trim()
    if (bare.startsWith('{')) {
      const failure = errorOfSseData(bare)
      if (failure) {
        streamError = failure
        break
      }
    }

    const { events, rest } = splitSseEvents(buffer)
    buffer = rest
    for (const event of events) {
      const failure = errorOfSseData(event)
      if (failure) {
        streamError = failure
        continue
      }
      const text = contentOfSseData(event)
      if (text) {
        content += text
        options.onDelta?.(text)
      }
    }
    if (streamError) break
  }

  // 末尾可能还剩一个没被空行收尾的事件
  const { events } = splitSseEvents(`${buffer}\n\n`)
  for (const event of events) {
    const text = contentOfSseData(event)
    if (text) {
      content += text
      options.onDelta?.(text)
    }
  }

  return { content, aborted: false, streamError }
}

/**
 * 发一次对话请求。
 *
 * 超时与外部取消共用同一个 AbortController：外部取消返回 aborted，
 * 自己的定时器触发返回 timeout，两者不能混为一谈，否则读者会看到「超时」而不是自己取消的结果。
 */
export async function requestChat(
  messages: ChatMessage[],
  config: AiConfig,
  options: RequestOptions = {},
): Promise<AiResult> {
  if (!isAiConfigured(config)) {
    return { status: 'error', kind: 'not-configured', message: '还没有配置 AI 服务。' }
  }
  if (options.signal?.aborted) return { status: 'aborted' }

  // 原生壳里 navigator.onLine 可能是 true 但实际没有出口，这里只做一次快速判断，
  // 真正失败仍然靠下面的 catch 归一化。
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { status: 'error', kind: 'offline', message: '当前处于离线状态。' }
  }

  const timeoutMs = options.timeoutMs ?? AI_TIMEOUT_MS
  const doFetch = options.fetchImpl ?? globalThis.fetch
  if (typeof doFetch !== 'function') {
    return { status: 'error', kind: 'network', message: '当前环境不支持网络请求。' }
  }

  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort)

  /*
   * 流式下这个定时器是「多久没收到任何数据」，不是「总共多久」。
   * 用总时长当上限会把正常的长回答掐断，而读者真正要防的是卡住不动。
   */
  let timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const touch = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeoutMs)
  }
  const streaming = typeof options.onDelta === 'function'

  try {
    const response = await doFetch(normalizeEndpoint(config.endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: buildBody(messages, config.model, config.webSearch, streaming),
      signal: controller.signal,
    })

    if (!response.ok) {
      // 错误体可能不是 JSON，读失败不应该覆盖掉真正的状态码错误
      const body = await response.json().catch(() => null)
      return {
        status: 'error',
        kind: errorKindOfStatus(response.status),
        message: vendorMessage(body, response.status),
      }
    }

    // 网关可能忽略 stream 参数照旧返回整段 JSON，按内容类型分流，不靠参数猜
    const contentType = response.headers?.get?.('content-type') ?? ''
    const looksLikeSse = contentType.includes('text/event-stream') || typeof response.body?.getReader === 'function'
    if (streaming && looksLikeSse) {
      const streamed = await readStream(response, controller, options, touch)
      if (streamed.streamError) {
        return { status: 'error', kind: 'network', message: streamed.streamError }
      }
      if (streamed.aborted) {
        // 已经吐出去的字留在界面上，这里只告诉调用方是取消，不是失败
        return streamed.content ? { status: 'ok', content: streamed.content, partial: true } : { status: 'aborted' }
      }
      const text = streamed.content.trim()
      if (!text) {
        return { status: 'error', kind: 'parse', message: '返回内容不是预期的对话结构。' }
      }
      return { status: 'ok', content: text }
    }

    const body = await response.json().catch(() => null)
    const content = contentOf(body)
    if (!content) {
      return { status: 'error', kind: 'parse', message: '返回内容不是预期的对话结构。' }
    }
    // 走了整段返回也要回调一次，界面才不至于空白
    options.onDelta?.(content)
    return { status: 'ok', content }
  } catch (error) {
    if (timedOut) return { status: 'error', kind: 'timeout', message: '等待回复超时。' }
    if (options.signal?.aborted) return { status: 'aborted' }
    if (error instanceof Error && error.name === 'AbortError') return { status: 'aborted' }
    return { status: 'error', kind: 'network', message: error instanceof Error ? error.message : '网络请求失败。' }
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', onAbort)
  }
}

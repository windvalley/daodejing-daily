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
}

/** 默认 30 秒。全书前缀约两万 token，慢一点的模型也要留出余量 */
export const AI_TIMEOUT_MS = 30_000

/**
 * 七类错误。调用方按 kind 选择文案与兜底方式，不要去匹配 message。
 * 读者主动取消不算错误，单独返回 aborted。
 */
export type AiErrorKind = 'not-configured' | 'offline' | 'auth' | 'quota' | 'timeout' | 'parse' | 'network'

export type AiResult =
  { status: 'ok'; content: string } | { status: 'aborted' } | { status: 'error'; kind: AiErrorKind; message: string }

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
  }
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

/** 请求体只带最小字段，避免不同厂商忽略不认识的参数时报错 */
function buildBody(messages: ChatMessage[], model: string): string {
  return JSON.stringify({ model, messages, stream: false })
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
  timeoutMs?: number
  /** 测试注入用，默认 globalThis.fetch */
  fetchImpl?: typeof fetch
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
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await doFetch(config.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: buildBody(messages, config.model),
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

    const body = await response.json().catch(() => null)
    const content = contentOf(body)
    if (!content) {
      return { status: 'error', kind: 'parse', message: '返回内容不是预期的对话结构。' }
    }
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

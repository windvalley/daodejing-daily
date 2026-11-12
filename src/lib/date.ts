export const DAY_MS = 24 * 60 * 60 * 1000
export const MINUTE_MS = 60 * 1000

export function startOfDay(input: Date | number = new Date()): number {
  const date = new Date(input)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** 本地日期键，形如 2026-11-12 */
export function dayKey(input: Date | number = new Date()): string {
  const date = new Date(input)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function dayIndex(input: Date | number = new Date()): number {
  return Math.floor(startOfDay(input) / DAY_MS)
}

export function addDays(timestamp: number, days: number): number {
  return timestamp + days * DAY_MS
}

export function addMinutes(timestamp: number, minutes: number): number {
  return timestamp + minutes * MINUTE_MS
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp)
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${hour}:${minute}`
}

export function formatRelative(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp
  if (diff < MINUTE_MS) return '刚刚'
  if (diff < 60 * MINUTE_MS) return `${Math.floor(diff / MINUTE_MS)} 分钟前`
  if (diff < DAY_MS) return `${Math.floor(diff / (60 * MINUTE_MS))} 小时前`

  const days = dayIndex(now) - dayIndex(timestamp)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days} 天前`
  if (days < 30) return `${Math.floor(days / 7)} 周前`
  return formatDate(timestamp)
}

/** 复习到期时间的可读描述 */
export function formatDue(dueAt: number, now = Date.now()): string {
  const diff = dueAt - now
  if (diff <= 0) {
    const overdueDays = dayIndex(now) - dayIndex(dueAt)
    if (overdueDays <= 0) return '待复习'
    return `已逾期 ${overdueDays} 天`
  }
  if (diff < 60 * MINUTE_MS) return `${Math.max(1, Math.ceil(diff / MINUTE_MS))} 分钟后`
  if (diff < DAY_MS) return `${Math.ceil(diff / (60 * MINUTE_MS))} 小时后`
  const days = dayIndex(dueAt) - dayIndex(now)
  if (days === 1) return '明天'
  if (days < 30) return `${days} 天后`
  if (days < 365) return `${Math.round(days / 30)} 个月后`
  return `${Math.round(days / 365)} 年后`
}

export function greeting(now = new Date()): string {
  const hour = now.getHours()
  if (hour < 6) return '夜深了'
  if (hour < 11) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

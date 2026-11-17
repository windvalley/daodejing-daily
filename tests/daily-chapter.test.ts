import { describe, expect, it, vi } from 'vitest'
import { dayKey } from '../src/lib/date'
import type { AppData } from '../src/lib/store'

/**
 * 夏令时分区的日历日回归测试。
 * 进程时区只能从 Node 侧切换，所以放在 src 之外，避免把 process 带进应用的类型环境。
 *
 * 切换后要重新加载 stats 模块：每日推荐的起点常量在模块加载时求值，重载才能保证
 * 每个用例都在被测时区下重新算一遍。每个用例先断言当地确实处在夏令时，否则时区
 * 没生效时测试会静默通过。
 */
const originalTimeZone = process.env.TZ

async function inTimeZone<T>(timeZone: string, run: () => Promise<T>): Promise<T> {
  process.env.TZ = timeZone
  vi.resetModules()
  try {
    return await run()
  } finally {
    if (originalTimeZone === undefined) {
      delete process.env.TZ
    } else {
      process.env.TZ = originalTimeZone
    }
    vi.resetModules()
  }
}

const emptyData = { activity: {} } as AppData

describe('夏令时下的日历日', () => {
  it('春季少一小时的那天仍然只推进一天', async () => {
    await inTimeZone('Europe/Berlin', async () => {
      // 柏林 2024-03-31 起用夏令时，当天只有 23 小时
      expect(new Date(2024, 2, 31, 12).getTimezoneOffset()).toBe(-120)
      const { dailyChapterNumber } = await import('../src/lib/stats')
      expect(dailyChapterNumber(new Date(2024, 2, 31))).toBe(dailyChapterNumber(new Date(2024, 2, 30)) + 1)
      expect(dailyChapterNumber(new Date(2024, 3, 1))).toBe(dailyChapterNumber(new Date(2024, 2, 31)) + 1)
    })
  })

  it('秋季多一小时的那天仍然只推进一天', async () => {
    await inTimeZone('Europe/Berlin', async () => {
      // 柏林 2024-10-27 回拨，当天有 25 小时
      expect(new Date(2024, 9, 27, 12).getTimezoneOffset()).toBe(-60)
      const { dailyChapterNumber } = await import('../src/lib/stats')
      expect(dailyChapterNumber(new Date(2024, 9, 27))).toBe(dailyChapterNumber(new Date(2024, 9, 26)) + 1)
      expect(dailyChapterNumber(new Date(2024, 9, 28))).toBe(dailyChapterNumber(new Date(2024, 9, 27)) + 1)
    })
  })

  it('热力图窗口跨越春季切换时仍然覆盖连续日历日', async () => {
    await inTimeZone('Europe/Berlin', async () => {
      const { recentActivity } = await import('../src/lib/stats')
      const cells = recentActivity(emptyData, 35, new Date(2024, 3, 10, 9).getTime())
      const keys = cells.filter((cell) => !cell.placeholder).map((cell) => dayKey(cell.date))
      const expected: string[] = []
      for (let offset = 34; offset >= 0; offset -= 1) {
        const date = new Date(2024, 3, 10)
        date.setDate(date.getDate() - offset)
        expected.push(dayKey(date))
      }
      expect(keys).toEqual(expected)
    })
  })
})

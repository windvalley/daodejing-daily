import { afterAll, describe, expect, it } from 'vitest'
import { backupFileName } from '../src/lib/backup'

/**
 * 备份文件名用的是本地日期，而不是 UTC 日期。
 * 这条断言必须在 UTC 偏移为正的时区跑：在 UTC 下本地日期与 UTC 日期相同，
 * 把实现改回 toISOString 也照样通过，等于没有约束。进程时区只能从 Node 侧切换，
 * 按仓库既有做法放在 tests/ 下，避免把 Node 类型带进应用代码。
 */
const ORIGINAL_TZ = process.env.TZ
process.env.TZ = 'Asia/Shanghai'

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ
})

describe('备份文件名时区', () => {
  it('本地凌晨导出时用当天日期，不退回前一天', () => {
    const now = new Date(2026, 10, 17, 0, 30)
    // 先确认时区真的生效：本地 0:30 必然还是 UTC 的前一天，否则这条测试没有约束力
    expect(dayKeyOfUtc(now)).toBe('2026-11-16')
    expect(now.getHours()).toBe(0)

    expect(backupFileName(now)).toBe('道德经学习备份-2026-11-17.json')
    // 跨年同理：本地 1 月 1 日凌晨在 UTC 还是去年
    expect(backupFileName(new Date(2026, 0, 1, 0, 10))).toBe('道德经学习备份-2026-01-01.json')
  })
})

function dayKeyOfUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

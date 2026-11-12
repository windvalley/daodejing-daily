import { describe, expect, it } from 'vitest'
import { DAY_MS, MINUTE_MS } from './date'
import { initialReview, scheduleReview, type ReviewRecord } from './srs'

const now = new Date(2026, 10, 12, 9, 0, 0).getTime()

function record(patch: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    ease: 2.5,
    intervalDays: 1,
    dueAt: now,
    reps: 1,
    lapses: 0,
    lastGrade: 2,
    lastAt: now - DAY_MS,
    ...patch,
  }
}

describe('scheduleReview', () => {
  it('初次复习时按评分给出间隔', () => {
    expect(scheduleReview(undefined, 1, now).intervalDays).toBe(0.5)
    expect(scheduleReview(undefined, 2, now).intervalDays).toBe(1)
    expect(scheduleReview(undefined, 3, now).intervalDays).toBe(2)
  })

  it('忘记时重置间隔并在十分钟后再见', () => {
    const next = scheduleReview(record({ intervalDays: 20, reps: 6 }), 0, now)
    expect(next.intervalDays).toBe(0)
    expect(next.dueAt).toBe(now + 10 * MINUTE_MS)
    expect(next.reps).toBe(0)
    expect(next.lapses).toBe(1)
    expect(next.ease).toBeCloseTo(2.3, 5)
  })

  it('记得时按倍数拉长间隔', () => {
    const next = scheduleReview(record({ intervalDays: 4, ease: 2.5 }), 2, now)
    expect(next.intervalDays).toBe(10)
    expect(next.dueAt).toBe(now + 10 * DAY_MS)
  })

  it('熟练的间隔长于记得', () => {
    const easy = scheduleReview(record({ intervalDays: 4 }), 3, now)
    const good = scheduleReview(record({ intervalDays: 4 }), 2, now)
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays)
    expect(easy.ease).toBeGreaterThan(2.5)
  })

  it('难度系数与间隔都被限制在合理范围', () => {
    const next = scheduleReview(record({ ease: 2.8, intervalDays: 170 }), 3, now)
    expect(next.intervalDays).toBeLessThanOrEqual(180)
    expect(next.ease).toBeLessThanOrEqual(2.8)
    const hard = scheduleReview(record({ ease: 1.3 }), 1, now)
    expect(hard.ease).toBeGreaterThanOrEqual(1.3)
  })
})

describe('initialReview', () => {
  it('背完后十分钟加入复习', () => {
    const first = initialReview(now)
    expect(first.dueAt).toBe(now + 10 * MINUTE_MS)
    expect(first.reps).toBe(0)
  })
})

import { addDays, addMinutes } from './date'

export type Grade = 0 | 1 | 2 | 3

export const GRADES: { grade: Grade; label: string; hint: string }[] = [
  { grade: 0, label: '忘了', hint: '重新开始' },
  { grade: 1, label: '模糊', hint: '很快再见' },
  { grade: 2, label: '记得', hint: '正常间隔' },
  { grade: 3, label: '熟练', hint: '拉长间隔' },
]

export interface ReviewRecord {
  ease: number
  intervalDays: number
  dueAt: number
  reps: number
  lapses: number
  lastGrade: Grade
  lastAt: number
}

const MIN_EASE = 1.3
const MAX_EASE = 2.8
const MAX_INTERVAL = 180

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 简化版 SM-2：以四档自评调整间隔。
 * 忘记：10 分钟后再见；模糊：短间隔；记得：按倍数增长；熟练：更长。
 */
export function scheduleReview(previous: ReviewRecord | undefined, grade: Grade, now = Date.now()): ReviewRecord {
  const previousEase = previous?.ease ?? 2.5
  const previousInterval = previous?.intervalDays ?? 0
  const previousReps = previous?.reps ?? 0
  const previousLapses = previous?.lapses ?? 0

  let ease = previousEase
  let intervalDays: number
  let reps: number
  let lapses = previousLapses

  if (grade === 0) {
    ease = clamp(previousEase - 0.2, MIN_EASE, MAX_EASE)
    intervalDays = 0
    reps = 0
    lapses = previousLapses + 1
  } else {
    ease = clamp(previousEase + (grade === 3 ? 0.06 : grade === 1 ? -0.05 : 0), MIN_EASE, MAX_EASE)
    reps = previousReps + 1
    if (previousInterval <= 0) {
      intervalDays = grade === 1 ? 0.5 : grade === 2 ? 1 : 2
    } else if (grade === 1) {
      intervalDays = Math.max(0.5, previousInterval * 1.2)
    } else if (grade === 2) {
      intervalDays = previousInterval * ease
    } else {
      intervalDays = previousInterval * (ease + 0.5)
    }
    intervalDays = Math.min(MAX_INTERVAL, Math.round(intervalDays * 10) / 10)
  }

  const dueAt = intervalDays === 0 ? addMinutes(now, 10) : addDays(now, intervalDays)

  return { ease, intervalDays, dueAt, reps, lapses, lastGrade: grade, lastAt: now }
}

/** 初次背完后加入复习队列，10 分钟后再见 */
export function initialReview(now = Date.now()): ReviewRecord {
  return {
    ease: 2.5,
    intervalDays: 0,
    dueAt: addMinutes(now, 10),
    reps: 0,
    lapses: 0,
    lastGrade: 2,
    lastAt: now,
  }
}

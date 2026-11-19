import { describe, expect, it } from 'vitest'
import { swipeDirection, type SwipeGesture } from './swipe'

const VIEWPORT = 390

/** 以屏幕中间偏右起手的横向滑动，默认满足所有条件 */
function gesture(overrides: Partial<SwipeGesture> = {}): SwipeGesture {
  return {
    startX: 300,
    startY: 500,
    endX: 200,
    endY: 505,
    durationMs: 180,
    viewportWidth: VIEWPORT,
    touchCount: 1,
    ...overrides,
  }
}

describe('左右滑翻章判定', () => {
  it('左滑得到下一章，右滑得到上一章', () => {
    // 手指往左，内容跟着往左翻，直觉上就是往后一章
    expect(swipeDirection(gesture())).toBe('next')
    expect(swipeDirection(gesture({ startX: 200, endX: 300 }))).toBe('previous')
  })

  it('横向位移不够只算点按，不翻章', () => {
    expect(swipeDirection(gesture({ endX: 300 - 59 }))).toBeNull()
    expect(swipeDirection(gesture({ startX: 200, endX: 200 + 59 }))).toBeNull()
  })

  it('刚好达到距离与比例下限时算翻章', () => {
    // 边界值按「不小于」处理，避免刚好滑到位却被吃掉
    expect(swipeDirection(gesture({ endX: 240 }))).toBe('next')
    expect(swipeDirection(gesture({ startX: 200, endX: 260 }))).toBe('previous')
  })

  it('斜着滑动被当成滚动，不翻章', () => {
    // 横向 100、纵向 80，比例不到 1.5，读者只是在滚页面时滑歪了
    expect(swipeDirection(gesture({ endY: 580 }))).toBeNull()
    expect(swipeDirection(gesture({ endY: 420 }))).toBeNull()
  })

  it('纵向占优的滑动一律放行给浏览器滚动', () => {
    expect(swipeDirection(gesture({ endX: 260, endY: 900 }))).toBeNull()
  })

  it('从屏幕左右边缘起手的不接管，留给系统返回手势', () => {
    // 安卓与 iOS 的边缘内滑是返回，抢过来会让最自然的滑法失效
    expect(swipeDirection(gesture({ startX: 10, endX: 140 }))).toBeNull()
    expect(swipeDirection(gesture({ startX: VIEWPORT - 10, endX: VIEWPORT - 140 }))).toBeNull()
    // 刚好越过边缘保护带就可以接管
    expect(swipeDirection(gesture({ startX: 28, endX: 128 }))).toBe('previous')
    expect(swipeDirection(gesture({ startX: VIEWPORT - 28, endX: VIEWPORT - 128 }))).toBe('next')
  })

  it('慢慢拖动不翻章，快速滑动才算', () => {
    expect(swipeDirection(gesture({ durationMs: 801 }))).toBeNull()
    expect(swipeDirection(gesture({ durationMs: 800 }))).toBe('next')
  })

  it('双指及以上不参与翻章，缩放留给浏览器', () => {
    expect(swipeDirection(gesture({ touchCount: 2 }))).toBeNull()
    expect(swipeDirection(gesture({ touchCount: 0 }))).toBeNull()
  })

  it('时长异常时放弃判定', () => {
    expect(swipeDirection(gesture({ durationMs: Number.NaN }))).toBeNull()
    expect(swipeDirection(gesture({ durationMs: -1 }))).toBeNull()
  })
})

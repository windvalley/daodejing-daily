/**
 * 章页左右滑翻章的判定。
 * 触摸序列本身在 jsdom 里测不真，几何与时长条件抽成纯函数单独测，
 * hook 只负责收集起点、终点与 DOM 守卫。
 */

export type SwipeDirection = 'previous' | 'next'

export interface SwipeGesture {
  startX: number
  startY: number
  endX: number
  endY: number
  /** 从按下到抬手的毫秒数 */
  durationMs: number
  /** 视口宽度，用来算左右边缘留给系统返回手势的范围 */
  viewportWidth: number
  /** 起手时的触点数，双指缩放不参与翻章 */
  touchCount: number
}

/**
 * 手感参数集中在这里。
 * 真机上要调阈值只改这一处，判定逻辑与组件都不用跟着动。
 */
export const SWIPE = {
  /** 屏幕左右边缘这一条留给系统返回手势，不跟它抢 */
  edgeGuardPx: 28,
  /** 横向至少滑这么远，点按与轻微抖动不会触发 */
  minDistancePx: 60,
  /** 横向位移至少是纵向的这么多倍，斜着滑动更像是在滚动 */
  minHorizontalRatio: 1.5,
  /** 从按下到抬手超过这个时长就当成慢慢拖动，交还给浏览器 */
  maxDurationMs: 800,
}

/**
 * 左滑看下一章（手指往左，内容跟着往左走），右滑回上一章。
 * 不满足条件时返回 null，调用方什么都不做。
 */
export function swipeDirection(gesture: SwipeGesture): SwipeDirection | null {
  const { startX, startY, endX, endY, durationMs, viewportWidth, touchCount } = gesture
  if (touchCount !== 1) return null
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > SWIPE.maxDurationMs) return null
  // 系统返回手势从屏幕边缘起手，这条不接管
  if (startX < SWIPE.edgeGuardPx || startX > viewportWidth - SWIPE.edgeGuardPx) return null
  const dx = endX - startX
  if (Math.abs(dx) < SWIPE.minDistancePx) return null
  // 纵向分量太大说明读者在滚动，只是滑歪了
  if (Math.abs(dx) < Math.abs(endY - startY) * SWIPE.minHorizontalRatio) return null
  return dx < 0 ? 'next' : 'previous'
}

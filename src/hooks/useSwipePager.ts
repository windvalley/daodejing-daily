import { useEffect } from 'react'
import { swipeDirection, type SwipeDirection } from '../lib/swipe'

interface TouchOrigin {
  x: number
  y: number
  at: number
}

/** 起手落在这些元素上时不接管：点按、输入与选字都不该变成翻章 */
const INTERACTIVE = 'a, button, input, textarea, select, label, [contenteditable="true"], [role="button"]'

/**
 * 章页左右滑翻章。
 *
 * 只认单指、只读取起点与终点做判定，不拦 touchmove、不 preventDefault，
 * 纵向滚动与边缘返回手势交给浏览器自己处理，条件不满足就当没发生过。
 * 判定期间只要页面滚动过就用这次手势作废：手动从弯道滑回来、或先滚后滑的序列，
 * 端点上看起来像横向滑动，实际上读者一直在滚页面。
 *
 * 捏合放大后单个手指的位移会先被浏览器吃进页面平移，clientX 的差值不再等于屏幕位移，
 * 阈值与边缘守卫都会失真，因此放大状态下不接管手势。
 *
 * 可发现性仍靠原文后的翻页条，这里只是给熟手留的快捷方式。
 */
export function useSwipePager({ onSwipe }: { onSwipe: (direction: SwipeDirection) => void }): void {
  useEffect(() => {
    let origin: TouchOrigin | null = null
    let scrolled = false

    const onScroll = () => {
      scrolled = true
    }

    const stopWatching = () => {
      window.removeEventListener('scroll', onScroll)
    }

    const onTouchStart = (event: TouchEvent) => {
      origin = null
      scrolled = false
      stopWatching()
      // 双指缩放：touchstart 带多个触点，第二根手指追加时也会再进来一次
      if (event.touches.length !== 1) return
      if (document.querySelector('[role="dialog"]:not([aria-hidden="true"])')) return
      if ((window.visualViewport?.scale ?? 1) > 1.01) return
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return
      const touch = event.touches[0]
      origin = { x: touch.clientX, y: touch.clientY, at: performance.now() }
      window.addEventListener('scroll', onScroll, { passive: true })
    }

    const onTouchEnd = (event: TouchEvent) => {
      const start = origin
      origin = null
      stopWatching()
      if (!start || scrolled) return
      // 长按选中原文再拖动也会走成滑动，此时不翻章
      if (window.getSelection()?.toString()) return
      const touch = event.changedTouches[0]
      if (!touch) return
      const direction = swipeDirection({
        startX: start.x,
        startY: start.y,
        endX: touch.clientX,
        endY: touch.clientY,
        durationMs: performance.now() - start.at,
        viewportWidth: window.innerWidth,
      })
      if (direction) onSwipe(direction)
    }

    // 来电或系统手势打断时，这次手势作废
    const onTouchCancel = () => {
      origin = null
      stopWatching()
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
      stopWatching()
    }
  }, [onSwipe])
}

import { useEffect, useRef } from 'react'
import { swipeDirection, type SwipeDirection } from '../lib/swipe'

interface TouchOrigin {
  x: number
  y: number
  at: number
}

/** 起手落在这些元素上时不接管：点按、输入与选字都不该变成翻章 */
const INTERACTIVE = 'a, button, input, textarea, select, [contenteditable="true"], [role="button"]'

/**
 * 章页左右滑翻章。
 *
 * 只在触摸结束时判定，不拦 touchmove、不 preventDefault：
 * 纵向滚动与边缘返回手势交给浏览器自己处理，判定不满足就当没发生过。
 * 浏览器决定开始滚动时会发 touchcancel，那一次手势自然作废，
 * 所以斜着滑、慢慢拖都不会误翻。
 *
 * 可发现性仍靠原文后的翻页条，这里只是给熟手留的快捷方式。
 */
export function useSwipePager({ onSwipe }: { onSwipe: (direction: SwipeDirection) => void }): void {
  // 回调放进 ref，监听只在挂载时绑定一次，调用方传内联函数也不会逐次解绑
  const callbackRef = useRef(onSwipe)
  useEffect(() => {
    callbackRef.current = onSwipe
  })

  useEffect(() => {
    let origin: TouchOrigin | null = null

    const onTouchStart = (event: TouchEvent) => {
      // 多指按下（缩放）时 touchstart 带多个触点，直接放弃；第二根手指追加也走这里
      origin = null
      if (event.touches.length !== 1) return
      if (document.querySelector('[role="dialog"]:not([aria-hidden="true"])')) return
      if (event.target instanceof Element && event.target.closest(INTERACTIVE)) return
      const touch = event.touches[0]
      origin = { x: touch.clientX, y: touch.clientY, at: Date.now() }
    }

    const onTouchEnd = (event: TouchEvent) => {
      const start = origin
      origin = null
      if (!start) return
      // 长按选中原文再拖动也会走成滑动，此时不翻章
      if (window.getSelection()?.toString()) return
      const touch = event.changedTouches[0]
      if (!touch) return
      const direction = swipeDirection({
        startX: start.x,
        startY: start.y,
        endX: touch.clientX,
        endY: touch.clientY,
        durationMs: Date.now() - start.at,
        viewportWidth: window.innerWidth,
        touchCount: 1,
      })
      if (direction) callbackRef.current(direction)
    }

    // 浏览器接管滚动、来电或系统手势打断时，这次手势作废
    const onTouchCancel = () => {
      origin = null
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    window.addEventListener('touchcancel', onTouchCancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [])
}

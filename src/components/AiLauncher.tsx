import { useEffect, useRef, useState, type RefObject } from 'react'

/** 滚动停下多久后重新出现。太短会在手指离开时又盖住目标，太长会显得入口丢了 */
const REVEAL_DELAY = 320
/** 小于这个位移不算滚动，避免橡皮筋回弹与横向滚动反复触发 */
const SCROLL_THRESHOLD = 4

/**
 * 问道的唯一入口。
 *
 * 所有断点共用一套位置与行为：宽屏不再走侧栏、窄屏单独一个浮动按钮，
 * 改一次样式或交互不会漏掉另一条链路。
 * 滚动时收起，避开列表最右列与章页底部的按钮；停下再回来。
 */
export function AiLauncher({
  open,
  onOpen,
  buttonRef,
}: {
  open: boolean
  onOpen: () => void
  buttonRef: RefObject<HTMLButtonElement | null>
}) {
  const [scrolling, setScrolling] = useState(false)
  const [focused, setFocused] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let lastY = window.scrollY
    const onScroll = () => {
      // 顶部回弹、横向滚动都会发 scroll，位移不到阈值时不动
      if (Math.abs(window.scrollY - lastY) < SCROLL_THRESHOLD) return
      lastY = window.scrollY
      setScrolling(true)
      if (timer.current !== null) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setScrolling(false), REVEAL_DELAY)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [])

  /*
   * 焦点在入口上时不收起。
   * 用 Tab 走到这里时浏览器会把按钮滚进视口，这次滚动同样触发 onScroll；
   * 若照常隐藏，焦点会落在一个 visibility: hidden 的按钮上，读屏与 :focus-visible 都失效。
   * 面板打开时也不收起：关闭后要能把焦点还给入口，藏起来的按钮接不住 focus()。
   */
  const hidden = scrolling && !focused && !open

  return (
    <button
      ref={buttonRef}
      type="button"
      className={hidden ? 'ai-launcher is-hidden' : 'ai-launcher'}
      onClick={onOpen}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label="打开问道"
      aria-haspopup="dialog"
      aria-expanded={open}
    >
      <span className="ai-launcher-seal" aria-hidden="true">
        问
      </span>
      <span className="ai-launcher-label" aria-hidden="true">
        道
      </span>
    </button>
  )
}

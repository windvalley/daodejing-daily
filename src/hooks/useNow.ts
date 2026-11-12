import { useEffect, useState } from 'react'

/**
 * 提供一个会缓慢刷新的当前时间，避免在渲染过程中直接读取 Date.now()，
 * 也让「待复习」这类依赖时间的状态在页面停留时自动更新。
 */
export function useNow(refreshMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), refreshMs)
    const onVisible = () => {
      if (document.visibilityState === 'visible') setNow(Date.now())
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [refreshMs])

  return now
}

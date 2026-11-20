import { App } from '@capacitor/app'
import type { PluginListenerHandle } from '@capacitor/core'
import { useEffect, useRef } from 'react'
import { resolveBackAction } from '../lib/androidBack'
import { isNativeApp } from '../lib/nativeTheme'

/**
 * 安卓返回键与返回手势。
 *
 * 只在原生壳里接管：浏览器与 PWA 的返回由浏览器自己走历史，接过来反而会吃掉正常的后退。
 * 注册监听之后 Capacitor 不再自己回退或退出，三层落点全部由 resolveBackAction 决定，
 * 所以「退出」那一支必须显式调用，漏了就是按返回没反应。
 */
export function useAndroidBack({
  aiOpen,
  onCloseAi,
  onGoBack,
}: {
  aiOpen: boolean
  onCloseAi: () => void
  onGoBack: () => void
}): void {
  /*
   * 监听只注册一次，处理函数从 ref 读最新状态。
   * 每次 aiOpen 变化都重注册会留一个「旧监听已移除、新监听还没装上」的空窗，
   * 这期间按返回会落回原生壳的默认处理，面板开着也可能把背后的页面翻走。
   */
  const latest = useRef({ aiOpen, onCloseAi, onGoBack })
  useEffect(() => {
    latest.current = { aiOpen, onCloseAi, onGoBack }
  }, [aiOpen, onCloseAi, onGoBack])

  useEffect(() => {
    if (!isNativeApp()) return undefined
    let handle: PluginListenerHandle | null = null
    let disposed = false

    App.addListener('backButton', ({ canGoBack }) => {
      const state = latest.current
      const action = resolveBackAction({ aiOpen: state.aiOpen, canGoBack })
      if (action === 'close-ai') {
        state.onCloseAi()
        return
      }
      if (action === 'go-back') {
        state.onGoBack()
        return
      }
      // exitApp 在 iOS 上没有定义，但这个事件本来只在安卓触发
      App.exitApp().catch(() => {})
    })
      .then((registered) => {
        if (disposed) void registered.remove()
        else handle = registered
      })
      /*
       * 插件没装进旧安装包时不能让整页起一个未捕获的 rejection。
       * 此时按返回的表现不是「系统默认的退出」：AppPlugin 的 OnBackPressedCallback
       * 从插件加载起就是启用的，没有 backButton 监听者时它只会 webView.goBack()，
       * 退不动就什么都不做。也就是说这一段失败会让返回键失灵，而不是回到旧行为。
       */
      .catch(() => {})

    return () => {
      disposed = true
      if (handle) void handle.remove()
    }
  }, [])
}

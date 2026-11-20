/**
 * 安卓返回键的落点。
 *
 * 返回键只做一件事：退出当前这一层。读者看到的最上面一层是「问道」面板时，
 * 先收面板；否则回上一页；已经退到会话的第一页时才退出应用。
 *
 * 这三种落点必须显式给全。注册了 Capacitor 的 backButton 监听之后，
 * 原生壳不再自己回退或退出，漏掉哪一支，那一步就会表现成「按了没反应」。
 */
export type BackAction = 'close-ai' | 'go-back' | 'exit'

export function resolveBackAction(state: { aiOpen: boolean; canGoBack: boolean }): BackAction {
  // 面板盖住整页时，读者按返回期待的肯定是先收掉眼前这一层，而不是把背后的页面翻走
  if (state.aiOpen) return 'close-ai'
  return state.canGoBack ? 'go-back' : 'exit'
}

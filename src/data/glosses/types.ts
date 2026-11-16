/** 一个字（或一个标点）的注音与释义；标点只保留 char */
export interface CharGloss {
  /** 单字，长度为 1 */
  char: string
  /** 带声调拼音，标点省略 */
  pinyin?: string
  /** 逐字释义，标点省略 */
  gloss?: string
  /** 读音或字形提示，如通假、旧读，普通读音省略 */
  hint?: string
}

/** 一句原文的逐字条目，顺序与原文完全一致，标点也占一项 */
export type GlossLine = CharGloss[]

/** 一章的逐字条目，与 chapter.text 逐句对应 */
export type ChapterGloss = GlossLine[]

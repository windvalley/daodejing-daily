# AGENTS.md

本文件面向在本仓库工作的编码智能体，说明项目结构、常用命令、编码约定与容易出错的地方。
开始修改前先读 `README.md` 了解产品行为，涉及安卓壳时再读 `docs/mobile.md`。
任务开发流程见「任务工作流」，交付前的评审要求见「交付前的独立评审」，发版规则见「合并、推送与发版」。

## 项目概览

「道德经日课」是《道德经》八十一章的学习、背诵与实践网站。
应用是纯前端单页应用，没有后端，学习数据只保存在浏览器或 APK 内 WebView 的 localStorage。
技术栈为 React 19、TypeScript、Vite、React Router、原生 CSS 与 Vitest。
同一套构建产物通过 vite-plugin-pwa 提供离线 PWA，也通过 Capacitor 打包成安卓 APK。
界面文案、代码注释与提交信息使用中文，代码标识符使用英文。

## 常用命令

所有命令都在当前 worktree 的根目录执行，包管理器使用 pnpm。

- `pnpm install`：安装依赖，每个新 worktree 都要单独执行。
- `pnpm dev`：启动 Vite 开发服务器。
- `pnpm dev:lan`：允许局域网访问开发服务器。
- `pnpm test`：运行全部 Vitest 测试。
- `pnpm test:watch`：以监听模式运行测试。
- `pnpm exec vitest run src/lib/srs.test.ts`：只运行指定测试文件。
- `pnpm lint`：用 oxlint 做静态检查。
- `pnpm format`：用 Prettier 写入格式化结果。
- `pnpm format:check`：只检查格式，不写文件。
- `pnpm build`：先执行 `tsc -b`，再用 Vite 构建生产包到 `dist/`。
- `pnpm preview`：本地预览构建结果。
- `pnpm preview:lan`：允许局域网访问预览。
- `pnpm apk`：构建网页资源、同步 Capacitor 工程并打包 APK，产物落在 `android/app/build/outputs/apk/release/`。

提交前至少运行 `pnpm format:check`、`pnpm test`、`pnpm lint` 与 `pnpm build`。
`pnpm build` 里的 `tsc -b` 会同时检查 `src/`、`vite.config.ts` 与 `tests/`，任何一处类型错误都会让构建失败。
`pnpm format:check` 覆盖 `src/`、根目录配置与 Markdown、`index.html`，不包含 `docs/`。
`pnpm apk` 需要 JDK 21 与 Android SDK 36，签名配置位于不入库的 `android/keystore/`。
以上检查覆盖不到渲染与平台行为，横向溢出、固定栏错位、复制时带出注音这类问题只能在浏览器或真机上确认。

## 任务工作流

- 每个任务都在独立 worktree 与独立分支中进行，主工作目录只用来保持 main 与执行发版。
- worktree 的父目录固定为 `../daodejing-daily-worktrees/`，目录名用任务名，分支名写成 `<type>/<任务名>`。
- 例如：`git worktree add ../daodejing-daily-worktrees/chapter-grid -b feat/chapter-grid main`。
- 新 worktree 里没有 `node_modules`，第一次进入先跑 `pnpm install --frozen-lockfile`，之后才能跑测试与构建。
- 任务分支上可以跑 `pnpm format:check`、`pnpm test`、`pnpm lint`、`pnpm build`，也可以为验证做临时 APK 构建。
- 临时构建只用于验证，不复制到 `release/`，不改版本号，也不算发版。
- 任务完成后先在任务分支提交，验证通过再合回 main，合并使用 `--no-ff`，与仓库历史的 merge 提交保持一致。
- 合并前确认 main 的最新提交已包含其他任务，基线与 main 不一致时先把 main 合进任务分支并重跑验证。
- 合并后先 `git worktree remove` 清理目录，再删除任务分支，最后推送 main。
- 多个任务并行时各自占用独立的 worktree，不允许共用工作目录或分支，也不允许在 main 工作目录里直接改文件。
- 出现冲突必须停下核对双方改动并保留有效行为，不得用 ours 或 theirs 整体覆盖。
- 本约定之前遗留的 `../daodejing-daily-chapter-grid` 不再承接新任务。

## 目录与职责

完整目录树见 `README.md` 的「目录结构」，这里只列不能靠猜的部分。

- `src/App.tsx`：路由表，所有页面路由集中在这里注册。
- `src/lib/`：状态存储、间隔重复、默写比对、检索、统计、日期、朗读与变调等纯逻辑。`store.ts` 是唯一的数据入口与写入链路，组件不要绕过它；这一层行为可断言，改动要配测试。
- `src/pages/`、`src/components/`、`src/hooks/`：页面、通用组件与 hooks，出错通常表现为渲染或交互异常，测试与构建看不全。
- `src/data/chapters/`、`src/data/glosses/`：章文与注音，按二十章左右分四个文件，以章号为键，新增章节要落到对应分卷。
- `src/data/concepts.ts`：十四个核心概念及其关联章节与引文。
- `src/styles/index.css`：全站样式、主题变量、响应式与安全区规则。
- `src/test/`：jsdom 环境下的数据契约与页面集成测试。
- `tests/`：需要 Node API 的测试，目前用于读取 CSS 源文件做样式约定断言。
- `android/`：Capacitor 生成的安卓工程与自定义插件，`applicationId` 与签名密钥不能改。
- `scripts/build-apk.sh`：`pnpm apk` 调用的构建脚本。
- `dist/`、`android/app/src/main/assets/public/` 与 `release/` 是构建或本地产物，不要手工修改。

## 状态与数据流

- 应用数据只有一份，存在 localStorage 的 `daodejing.data.v1` 键下。
- `src/lib/store.ts` 是唯一的数据入口，对外暴露 `actions`、`subscribe`、`getSnapshot`、`exportData` 与 `parseImport`。
- 组件通过 `useAppData` 读取数据，通过 `actions` 写入数据，不要在组件里直接读写 localStorage。
- 所有写入都会先复制状态、修改副本，再持久化并通知订阅者，不要原地修改状态对象。
- `sanitizeData` 会在加载、导入与跨标签页同步时校验并裁剪数据，新增字段时同步补上清洗规则。
- 数据结构变化要升级 `version` 与 `STORAGE_KEY`，并保留对旧备份的导入处理。
- 导入备份时 `parseImport` 同时接受带 `data` 外壳的导出文件与裸数据，写入走 `replaceAll`。
- 其他标签页写入时通过 `storage` 事件同步，不要绕过这条链路。
- 时间相关逻辑由调用方传入 `now` 或 `Date`，页面用 `useNow` 获取会刷新的当前时间。
- 不要在 render 期间直接读 `Date.now()`，否则同一次渲染中的多个时间点可能不一致。

## 路由、构建与原生壳

- 路由使用 BrowserRouter，`basename` 取自 `import.meta.env.BASE_URL`。
- 部署到子路径时用 `BASE_PATH=/daodejing-daily/ pnpm build`，不要硬编码 `/`。
- Service Worker 只在生产构建且非原生环境注册，原生壳内不要注册。
- PWA 配置位于 `vite.config.ts`，`injectRegister` 为 `null`，注册逻辑手写在 `src/main.tsx`。
- 原生环境通过 `window.Capacitor.isNativePlatform()` 判断，相关封装在 `src/lib/nativeTheme.ts` 与 `src/hooks/useSpeech.ts`。
- 安卓状态栏切换必须先调用 `SystemBars.setStyle`，再调用 `ThemeBackground.setBackground`。
- 新增原生插件时必须在 `MainActivity.onCreate` 的 `super.onCreate` 之前注册。
- `applicationId` 与签名密钥不能改，否则已安装用户无法覆盖升级。
- 发版时同时修改 `package.json` 的 `version`、`android/app/build.gradle` 的 `versionName` 与递增的 `versionCode`，并更新 README 与 `docs/mobile.md` 中的 APK 文件名。

## 编码约定

- 格式以 `.prettierrc.json` 为准：不使用分号，使用单引号，行宽 120，尾随逗号，箭头函数参数始终带括号。
- TypeScript 开启了 `verbatimModuleSyntax`，类型导入一律写成 `import type`。
- TypeScript 开启了 `erasableSyntaxOnly`，不要使用 enum、namespace 与构造函数参数属性。
- TypeScript 开启了 `noUnusedLocals` 与 `noUnusedParameters`，未使用的变量和参数会让构建失败。
- React 使用函数组件与 hooks，页面组件用具名导出，不要新增类组件。
- 全局状态已经由 store 与 `useSyncExternalStore` 解决，不要引入 Redux、Zustand 等状态库。
- UI 使用 `src/styles/index.css` 的原生 CSS 与现有类名，不要引入 UI 框架或 CSS-in-JS。
- 页面标题用 `usePageTitle`，轻提示用 `useToast`，通用展示结构优先复用 `src/components/common.tsx`。
- 新增依赖前先确认标准库或现有依赖无法解决，并在变更说明里交代理由。
- 注释与界面文案用中文，标识符用英文，注释解释原因与约束，不复述代码表面行为。
- 交互元素要带可访问名称，按钮写 `type="button"`，切换类按钮补 `aria-pressed`，测试优先按角色与名称查询。

## 样式约定

- 主题通过根元素的 `data-theme` 切换，字体通过 `data-serif` 切换，正文字号写入 `--reading-size`。
- 颜色、圆角、阴影等使用 `:root` 中的 CSS 变量，会随主题变化的颜色要同时给出浅色与深色取值。
- 安全区只使用 `--safe-top`、`--safe-right`、`--safe-bottom` 与 `--safe-left`，不要在其他规则里直接写 `env(safe-area-inset-*)`。
- 网格列使用 `minmax(下限, 1fr)`，不要写裸 `1fr`，也不要嵌套 `minmax`。
- 布局以移动端为基准，再用 `min-width: 640px`、`900px`、`1024px` 等断点增强。
- 背诵页主视觉使用 `--hero-*` 变量，不要改用会随主题翻转的强调色。
- `tests/styles.test.ts` 会读取 CSS 源文件检查上述约定，改布局时要确认断言仍然表达原意，必要时连同测试一起调整。

## 内容与注音约定

- 全书固定八十一章，章号连续，道经为一至三十七章，德经为三十八至八十一章。
- 每章包含原文分段、章题、章旨、白话译文、重点字词注释、一句实践提示与关联概念。
- 原文以王弼本为底本，参校河上公章句；译文与注释出现分歧时在注释里交代取舍。
- 概念使用固定 slug，章节与引文必须真实存在，引文去掉标点后应能在对应章原文中找到。
- 注音数据必须与原文逐句逐字对齐，标点也占一个 token，但标点不写拼音、释义和提示。
- 汉字 token 必须有带声调的拼音和释义，释义以二到八个汉字的词性开头，紧跟一个句号。
- 「不」「一」在数据里只写本调，变调由 `applyToneSandhi` 在展示与朗读时推导，不要写进数据。
- `hint` 只放通假、旧读、易误读等短提示，长度不超过八个字，长说明并入释义。
- 朗读时的多音字校正只用 `src/lib/speech.ts` 的同音字表，不能改动页面显示的原文。
- 新增或修改内容后运行 `pnpm test`。`src/test/data.test.ts` 会检查章数、注音与原文逐句对齐、拼音格式与概念引用，这些是机械可判的部分。
- 「译文不与注释、章旨的训释相左」这条只锁了文中点名的几处（当前是第 5、15、59 章），其余章节的训释对错没有测试能判，改动后必须自己逐句核对译文、注释与章旨是否互相矛盾。
- 内容校正要逐章列出依据的底本或训释来源，说明取舍；只凭印象改字、改译或改注的，不要提交。

## 测试约定

- 单元测试放在被测模块同目录，命名 `*.test.ts` 或 `*.test.tsx`，例如 `src/lib/srs.test.ts`。
- 数据契约与页面集成测试放在 `src/test/`，页面测试用 `MemoryRouter` 渲染 `App`。
- 需要读取文件等 Node 能力的测试放在根目录 `tests/`，避免把 Node 类型带进应用代码。
- 页面测试优先按角色与可访问名称查询元素，不依赖快照，只在需要检查样式钩子时查询类名。
- `src/test/setup.ts` 已补 `matchMedia` 与 `scrollTo`，新增依赖浏览器 API 的测试优先在这里补桩。
- 涉及 store 的测试在每个用例前清空 localStorage，并用 `actions.replaceAll(createDefaultData())` 重置状态。
- 语音相关测试通过 mock `loadVoiceOptions` 或 Capacitor 插件注入固定音色，不要依赖真实设备。
- 修复缺陷时先在最接近真实使用的层级复现，再在对应层级补回归测试。
- 补完回归测试要反向核对断言：把实现临时改回修复前的写法（或 `git stash push <实现文件>`），跑该测试确认它会红，再恢复。改回旧实现仍然通过的断言不算约束，多半是对着当前实现反推出来的。
- `tests/styles.test.ts` 的断言靠字符串匹配，同样要反向核对，否则断言自己就会骗过人。历史上用 `!value.includes('minmax(0')` 判断列声明安全，恰好放过了 `minmax(92px, minmax(0, 1fr))` 这种非法嵌套，等全站退化成单列才发现。
- 样式约定测试直接读 `src/styles/index.css`，Vitest 配置里关闭了 CSS 处理。

## 交付前的独立评审

自动合并省掉了人工过目，改动落在测试看不见的地方时，合并前补一次独立评审。

- 触发条件：改动命中 `src/styles/index.css`、`src/pages/**`、`android/**`、`vite.config.ts` 或 `src/lib/store.ts`。
- 做法：把 `git diff main...HEAD` 的完整 diff 与相关约定交给不参与实现的只读会话，要求每条发现给出文件、位置与可复现的具体场景，没有场景的不收；评审方只读，不许改文件，也不许执行会改变工作区的命令。
- 材料要完整，至少带上 `package.json`、`src/test/` 与提交说明。只给片段会让评审报出「声称升版本但 diff 里没有」这类假发现。
- 结论当线索用，采纳前自己核实。引用了仓库里并不存在的约定、或与代码实际行为相左的发现，直接驳回。
- 这一层能发现的是渲染与平台行为，例如嵌套 `minmax` 让全站退化成单列、`<ruby>/<rt>` 让复制原文粘出拼音；它发现不了训释对错，内容校正仍按「内容与注音约定」人工核对。

## 提交与协作

- 提交信息沿用 Conventional Commits，格式为 `<type>(<scope>): <中文描述>`，没有明确范围时可省略 scope。
- 仓库历史使用过的类型包括 `feat`、`fix`、`docs`、`refactor`、`build`、`polish` 与 `merge`，新提交沿用同一风格。
- 提交正文说明问题、原因与影响范围，涉及内容校正时列出具体章节与依据的底本或训释来源。
- 一个逻辑变更一个提交，修复、重构与纯格式化不要混在一起。
- 不要在 main 工作目录里直接改文件或提交，任务一律在独立 worktree 的任务分支上进行。
- 任务分支的提交在合并后保留，不要 squash，仓库历史用 merge 提交记录每个任务。
- 提交信息与 PR 描述不要添加智能体或工具的署名与生成标记。

## 合并、推送与发版

- 本仓库显式放宽全局规则中的合并与推送授权：任务分支验证通过后自动合回 main 并推送 `origin/main`，不需要逐次请示。
- 放宽只覆盖本仓库的普通任务分支合并与 main 推送，不覆盖强制推送、改写历史与删除远端分支。
- 自动合并的前置条件：任务分支上的 `pnpm format:check`、`pnpm test`、`pnpm lint` 与 `pnpm build` 全部通过，命中「交付前的独立评审」触发条件时评审也已完成，且 diff 只包含本任务改动。
- 任一条件不满足，或与 main 出现冲突，停止合并并报告具体分歧，不擅自覆盖。
- 推送前确认工作区干净，待推送的提交只包含已合入的任务改动。
- 只有用户明确说发版、打包或要求出 APK 时才算发版，其余情况不推进版本号、不产出 `release/` 下的安装包、不打 tag。
- 发版构建只能在 main 的 worktree 里执行，`pnpm apk` 打包的是当前工作树，在任务分支构建会漏掉其他已合并的改动。
- 发版前确认要发布的任务都已合入 main 并推送，再在 main 上执行 `pnpm apk`。
- 发版时按「路由、构建与原生壳」一节同步版本号与文档中的 APK 文件名。

## 容易踩的坑

- `dist/`、`android/app/src/main/assets/public/` 与 APK 都是生成物，改源码后重新构建，不要直接编辑。
- `../daodejing-daily-worktrees/` 下的每个 worktree 都要单独安装依赖，不能复用主工作目录的 `node_modules`。
- README 里说的「我的」是 `/settings` 路由的导航名，导出备份、导入备份与设置都在这一个页面。
- 章页注音用伪元素显示，正文节点只保留汉字，复制原文时不应带出拼音。
- 朗读文本会在「无不」之间插入空格以避免引擎整词取音，这个空格只出现在朗读文本里。
- 系统音色按 URI 存储而不是索引，原生侧排序不保证稳定。
- 深色主题下状态栏条带由原生窗口底色决定，只改 CSS 不会改变那条区域。
- Service Worker 只在生产构建注册，本地开发服务器默认没有离线缓存。
- `pnpm preview:lan` 走 HTTP，不是安全上下文，手机端不会注册 Service Worker，也不能安装成 PWA；验证离线与安装要用 HTTPS 部署或 localhost。
- 子路径部署时路由、manifest、Service Worker 作用域与资源路径都依赖 `BASE_PATH`，只改其中一处会 404 或白屏。
- Vitest 不做完整类型检查，测试通过不代表类型正确，提交前仍要跑 `pnpm build`。

## 完成标准

先满足公共项，再按改动类型核对对应的那一组。

- 公共：`pnpm format:check`、`pnpm test`、`pnpm lint` 与 `pnpm build` 全部通过，并在回复里报告实际输出，包括测试文件数与用例数、lint 告警数、构建结果；只写「已通过」不算报告。
- 公共：提交前用 `git status` 与 `git diff` 确认只包含当前任务改动；合并前再确认一次。
- 界面：在 `pnpm dev` 下检查桌面宽度与手机宽度，确认没有横向溢出、底栏遮挡或安全区错位；章页开启注音后全选原文复制一次，确认没有拼音混入。
- 原生：执行 `pnpm apk` 验证。任务分支上只做临时构建，正式发版构建在 main 上完成。
- 语音：在带语音引擎的模拟器或真机上验证，不能只看网页。
- 内容：确认注音与原文逐句对齐、译文不与注释和章旨相左，并说明本次改了哪些章、其中哪些补了断言。
- 合并：diff 只含本任务改动；合并后用 `git worktree remove` 清理目录、删除任务分支，再推送 main。
- 无法运行某项验证时说明原因与影响范围，不要直接声称完成。

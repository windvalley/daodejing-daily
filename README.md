# 道德经日课

一个可直接打开使用的《道德经》学习网站，围绕「学习、理解、背诵、实践」四件事设计。
电脑、平板、手机共用一套界面，安装到桌面后可离线使用。

## 界面

| 今日                                          | 章页（手机）                                 |
| --------------------------------------------- | -------------------------------------------- |
| ![今日页](docs/screenshots/today-desktop.png) | ![章页](docs/screenshots/chapter-mobile.png) |

| 全篇                                           | 背诵（手机）                                  |
| ---------------------------------------------- | --------------------------------------------- |
| ![全篇](docs/screenshots/chapters-desktop.png) | ![背诵](docs/screenshots/memorize-mobile.png) |

## 功能

- 全篇八十一章，按道经、德经分卷，支持全文检索与按状态筛选。
- 每章提供原文、章旨、白话译文、重点字词注释与一句实践提示。
- 三种背诵方式：首字提示、关键字填空、整章默写，默写自动对照并标出漏字与多字。
- 简化 SM-2 间隔重复：背完自动加入复习队列，按「忘了、模糊、记得、熟练」四档安排下次复习。
- 十四个核心概念（道、德、无为、自然、有无、柔弱、不争、知足、朴、反、水、婴儿、和光同尘、静）可跨章串读。
- 每日一章、今日功课、连续天数与近 35 天学习热力图。
- 践行笔记按章保存，实践页统一回顾。
- 主题（浅色、深色、跟随系统）、正文字号、宋体开关、朗读语速、每日复习目标可调。
- 数据仅保存在本机浏览器，支持导出与导入 JSON 备份。
- PWA 离线缓存，支持安装到主屏幕。

## 技术栈

- React 19 + TypeScript + Vite。
- React Router 做前端路由。
- 原生 CSS 变量实现主题与响应式，无 UI 框架依赖。
- localStorage 持久化，`useSyncExternalStore` 订阅状态。
- Vitest + Testing Library 做单元与组件测试。
- vite-plugin-pwa 生成 Service Worker 与 manifest。

## 本地开发

```bash
pnpm install
pnpm dev
```

## 常用命令

```bash
pnpm test          # 运行单元与组件测试
pnpm lint          # oxlint 静态检查
pnpm format        # Prettier 格式化
pnpm build         # 类型检查并构建生产包
pnpm preview       # 预览构建结果
```

## 目录结构

```text
src/
  components/        布局、图标、通用组件、章节卡片
  data/chapters/     八十一章原文、译文、注释、章旨、实践提示
  data/concepts.ts   概念索引
  hooks/             数据订阅、外观、朗读、当前时间、页面标题
  lib/               存储、间隔重复、默写比对、检索、统计、日期
  pages/             今日、全篇、章节、背诵、复习、实践、概念、设置
  styles/            全局样式与响应式规则
  test/              数据层与页面测试
```

## 内容说明

原文以王弼注《老子道德经》为底本，参校河上公章句，转为简体并按通行分章整理。
译文与注释是为便于理解而写的白话整理，不同注家理解有别，遇到分歧处建议回看原文。

## 部署

`pnpm build` 生成的 `dist/` 是纯静态文件，可直接放到任意静态托管。

托管在子路径时用环境变量指定：

```bash
BASE_PATH=/daodejing/ pnpm build
```

`base`、manifest 的 `start_url`、Service Worker 作用域与路由 basename 会一起跟随 `BASE_PATH`。
本站使用 BrowserRouter，托管方需要把未知路径回退到 `index.html`。

## 在手机上使用

分两种用法，能力差别很大。

### 一、同一 Wi-Fi 临时试用

电脑上运行：

```bash
pnpm build
pnpm preview:lan
```

终端会打印 `Network: http://<电脑局域网地址>:4173/`，手机连同一个 Wi-Fi，在浏览器里打开这个地址即可。

注意：

- 电脑必须保持开机、服务保持运行，电脑休眠后手机就打不开了。
- 换 Wi-Fi 或电脑换了 IP，地址会变。
- 这是 HTTP 访问，浏览器不把它当作安全上下文，因此 **Service Worker 不会注册，离线不可用，也不能真正安装成 PWA**。阅读、背诵、写笔记与本地保存都正常。
- 想查电脑的局域网地址，macOS 用 `ipconfig getifaddr en0`，Windows 用 `ipconfig`。

### 二、部署后安装成 PWA（推荐日常使用）

把 `dist/` 部署到任意 HTTPS 静态托管（Netlify、Vercel、Cloudflare Pages、GitHub Pages 等），手机访问该 HTTPS 地址后：

- **iOS Safari**：分享按钮 → 添加到主屏幕。
- **Android Chrome**：右上角菜单 → 安装应用 / 添加到主屏幕。

安装后可全屏运行、断网可用。只有 HTTPS（或 localhost）才会被浏览器视为安全上下文，PWA 与离线缓存依赖这一点。

### 两个容易踩的坑

- **数据不跨设备**。手机和电脑各自存各自的 localStorage，互不同步。换设备前在「我的」页面导出备份，再到新设备导入。
- **换域名等于换数据**。localhost、局域网 IP、正式域名在浏览器眼里是三个不同的站点，数据不共享。

## 数据与隐私

所有学习数据只写入当前浏览器的 localStorage，键名为 `daodejing.data.v1`，不会上传服务器。
换设备或清理浏览器数据前，可在「我的」页面导出备份。

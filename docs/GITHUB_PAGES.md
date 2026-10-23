# 网页版直接试玩

打开 **https://zhao922-bot.github.io/first-export-order/**，手机或电脑都可以直接开始。无需安装应用、注册账号或启动本地服务器。首次加载需要联网，当前未实现离线网站缓存。

## 进度与旧存档

- 请在同一设备、同一浏览器使用固定 HTTPS 地址。游戏自动保存当前订单，刷新或关页后可在首页选择「继续本地进度」。
- 在线版与原 `127.0.0.1` 地址、EXE、APK 的存档分开保存。迁移时先在原版「存档与恢复 → 导出当前进度」，再在在线版选择 JSON 并确认载入。业务内容和存档格式保持兼容。
- 跨设备不会自动同步。知识前后测和试玩指标独立保存，需分别导出；经营存档导入不迁移这些记录。
- 隐私浏览、清除网站数据、某些聊天软件内置浏览器关闭后，进度可能不保留。建议用常用系统浏览器打开并定期导出备份。显示「未保存」时先导出当前进度。
- 手机支持竖屏；表单可滚动，系统键盘收起后可继续操作。顶部「界面动效」支持关闭动画。

## 自动部署

仓库 Pages 来源设置为 GitHub Actions。推送 `main` 或手动运行 [Pages 工作流](../.github/workflows/pages.yml) 时：

1. 安装锁定依赖，执行格式、Lint、单元测试及公式覆盖率。
2. 构建独立 `dist-pages/`，在仓库子路径下运行桌面、360px Android 模拟、iPhone WebKit 模拟和 768px 平板回归。
3. 上传生产构建并部署，附 `deployment.json` 标记本次 commit。
4. 用真实公开 URL 再跑同一组 12 项测试，确认部署版本、七关逐关刷新、角色资源、窄屏/横屏、关页重开、账本与 RNG 不变、JSON 导出导入。

存档测试在隔离浏览器上下文中操作，不读取或清理玩家自己的浏览器记录。设备为浏览器模拟，不代表已在所有真机上验证。线上验收报告、截图和失败追踪保留在该次 Actions 的 `pages-live-tests` 附件中。

本地复验：

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium webkit
pnpm test:pages
```

此命令会构建并启动 `http://127.0.0.1:4174/first-export-order/`。验证公开网站时，在 PowerShell 设置：

```powershell
$env:PAGES_BASE_URL = 'https://zhao922-bot.github.io/first-export-order/'
pnpm test:pages
Remove-Item Env:PAGES_BASE_URL
```

普通 `pnpm build` 和原生打包继续使用 `dist/` 及相对资源路径；Pages 构建不改变 EXE/APK 存档来源或已分发安装包。没有新增关卡、云存档、排行榜或服务端指标收集。专业审校与 12 人真人试玩仍待完成。

部署方式参考 [GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) 和 [Vite 静态部署](https://vite.dev/guide/static-deploy.html#github-pages)。

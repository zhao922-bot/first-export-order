# EXE / APK 0.2.0 角色动画版本地试玩

两个包都包含七关、随机事件、复盘、新手引导，以及林姐和五类客户立绘、七关场景和轻量动效，可以离线单人游玩。无需运行开发服务器，不连接云存档或排行榜。首次解压或安装后也无需联网加载剧情或角色图片。顶部“界面动效”可关闭，默认跟随系统减少动态偏好。

公开试玩包从 [GitHub Releases](https://github.com/zhao922-bot/first-export-order/releases/tag/v0.2.0) 下载，随包提供 SHA-256 清单。源码和下载包公开不代表专业审校或真人试玩已完成。

## Windows

Windows 10/11 x64：双击 `FirstExportOrder-0.2.0-win-x64.exe`，首次启动需要几秒解压时间。无需安装 Node.js 或管理员权限。

这是未购买商业代码签名证书的本地测试版。请使用组织者提供的文件和 SHA-256 清单核对来源。若电脑策略拦截未签名程序，请交由电脑管理员处理，不要关闭系统保护。

存档在 `%APPDATA%\FirstExportOrder`；移动或替换 EXE 不会删除进度。同一用户只打开一个窗口。导出 JSON 使用桌面下载功能，默认下载目录为系统“下载”文件夹。

从 0.1.0 更新：先在旧版“存档与恢复”导出当前进度，再完全关闭旧版，使用同一 Windows 用户双击新版，点击“继续本地进度”。新版沿用固定存档目录和应用来源，不重开订单、不重抽事件或重复付费。旧版还开着时，新版只会激活旧窗口，需先退出旧版。

## Android

将 `FirstExportOrder-0.2.0-android-test.apk` 复制到安卓手机，打开文件并按系统提示允许此次安装。最低 Android 7.0（API 24），需要可用的系统 WebView。此包供本地试玩，使用 Android 测试签名，不是商店正式发行包。

所有剧情已打包，安装后可断网游玩。系统返回键返回上一页面，无页面历史时退到后台；当前业务进度由自动存档保留，首页“继续本地进度”可继续。导出存档/指标时选择系统文件位置；取消选择不会删除记录。导入使用系统文件选择器。

更新应使用相同签名的 APK 直接覆盖安装。不同开发机的默认测试签名可能不一致，请勿为强行更新直接卸载：先导出存档和指标。卸载应用或清除应用数据会删除本地记录。

本次 0.2.0 沿用本项目已分发 0.1.0 的包名和测试签名，Android versionCode 从 1 增至 2。先导出备份，再点击新版 APK 选择更新，保留应用数据，打开后“继续本地进度”。新增加的动效偏好与经营存档分开保存。

## 存档迁移与试玩反馈

浏览器、EXE 与 APK 分别保存进度，不自动同步。在原端“存档与恢复 → 导出当前进度”，把 JSON 复制到新设备，再选择“导入本地存档 → 确认载入”。保留原文件直到新端确认正常。知识测评和试玩记录独立保留，经营存档导入不会迁移这部分数据；各端试玩后分别导出指标交给组织者。

手机默认字体过大时可先尝试系统默认显示大小；界面支持竖屏。黑屏或打不开时，保留存档后重新启动，并记录系统版本、复现步骤和提示文字。Android 请检查系统 WebView 已正常启用。不要用清除数据作为第一步排障。

12 人试玩指引、反馈表和专业审校清单在 `docs/playtest/`。这些本地安装包不代表专业审校或真人试玩已经通过。

## 开发者重建

```powershell
pnpm install --frozen-lockfile
pnpm package:exe
pnpm package:apk
pnpm test:native
pnpm test:android
```

EXE 使用固定版本 Electron 和 electron-builder，产物在 `outputs/native-0.2.0/windows/`。APK 使用 Capacitor，JDK 21 和 Android SDK；构建脚本优先读取 `JAVA_HOME` / `ANDROID_HOME`，也可自动找到本机 Android Studio 的 JBR 和用户 SDK。仅设置子进程环境，不修改系统环境变量。历史 0.1.0 文件保留在 `outputs/native/`，不要覆盖。

APK 脚本执行 `assembleDebug` 并复制测试包到 `outputs/native-0.2.0/android/`。首次构建需要下载 Electron、Gradle 或 Maven 依赖。普通试玩者使用已构建的 EXE/APK，无需这些开发依赖。

Android 回归：启动专用的英文 AOSP API 36 模拟器（默认序列号 `emulator-5580`，可用 `ANDROID_TEST_SERIAL` 指定），执行 `pnpm exec playwright install android` 和 `pnpm test:android`。测试自行安装保留的 0.1.0 和当前 APK，验证真实覆盖升级，再独立清空应用测试数据走七关、文件导出/取消、返回和重启；会关闭模拟器网络，只允许 `emulator-` 序列号，不能对试玩者的手机运行。桌面升级测试也使用独立临时数据目录。两端都需保留历史包作为升级输入；测试结果不等同于所有真实手机已验收。

公共 Git 仓库不包含生成的二进制或历史测试输入。原生升级测试需要原项目的 `outputs/native/windows/win-unpacked/FirstExportOrder.exe`（完整目录）和 `outputs/native/android/FirstExportOrder-0.1.0-android-test.apk`；从新克隆开始时应先向维护者取得相同的历史测试输入，不能以新版冒充旧版。Web 单元测试和浏览器流程测试不依赖这些文件。

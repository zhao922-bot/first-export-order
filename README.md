# 出海第一单

[![七关校验](https://github.com/zhao922-bot/first-export-order/actions/workflows/ci.yml/badge.svg)](https://github.com/zhao922-bot/first-export-order/actions/workflows/ci.yml)

面向外贸新手的单人叙事经营游戏。跟随林姐完成第一笔模拟出口订单，从选品、询盘、报价、谈判，到备货、出运和收汇；每次选择都有财务后果和业务复盘。

当前版本 **0.2.0 角色动画试玩版**。Vue 3 + TypeScript + Pinia + Vite，剧情、新手引导、角色演出与业务参数由 JSON 驱动，支持浏览器、Windows 和 Android 离线游玩。

[下载 EXE / APK](https://github.com/zhao922-bot/first-export-order/releases/tag/v0.2.0) · [安装与旧存档升级](docs/NATIVE_PLAYTEST.md) · [版本与测试记录](docs/releases/v0.2.0.md)

![游戏首页与林姐](docs/screenshots/home-desktop.png)

## 可以玩什么

- 完整七关：选品与供应商 → 询盘与客户 → 报价计算器 → 谈判与签约 → 备货验货 → 物流出运 → 单据与收汇。
- 三种产品、九家供应商、五类客户、三家货代；包含 T/T、L/C、OA，以及 EXW、FOB、CIF 教学路线。
- 12 个随机事件，固定种子可复现，刷新不重抽；收付款记入账本，恢复不重复扣款。
- 四类结局、五维评分、关键决策回放、24 个知识词条和复购意向。
- 首次进入逐步引导、示范操作、卡住提示与一次救援检查点；支持跳过和重新查看。
- 林姐和客户立绘、七关场景与轻量动画；可关闭动效，并尊重系统减少动态偏好。
- 自动存档、三个手动槽及 JSON 导入导出；试玩指标与知识前后测保存在本地，由玩家主动导出。

游戏中的金额、费率和规则场景是可配置的教学算例。专业审校和 12 人真人试玩尚待完成，不能把自动化通过视为真实业务能力认证。当前没有云存档、联网对战或排行榜。

## 直接试玩

在 [Releases](https://github.com/zhao922-bot/first-export-order/releases) 下载适合设备的文件：

| 平台              | 文件                                      | 启动方式                   |
| ----------------- | ----------------------------------------- | -------------------------- |
| Windows 10/11 x64 | `FirstExportOrder-0.2.0-win-x64.exe`      | 双击运行，无需安装 Node.js |
| Android 7.0+      | `FirstExportOrder-0.2.0-android-test.apk` | 按系统提示安装或覆盖更新   |

EXE 尚无商业代码签名，APK 使用测试签名。Release 提供 SHA-256 清单和使用说明。更新前先导出存档；Android 请直接覆盖安装，卸载或清除数据会删除进度。已验证项目原 0.1.0 到本次 0.2.0 的存档兼容。

浏览器、EXE、APK 的存档分别保存在各端；跨平台使用游戏内 JSON 导出/导入。知识测评和试玩记录需单独导出。详情见 [原生试玩说明](docs/NATIVE_PLAYTEST.md)。

## 从源码启动

需要 Node.js 22.14+（22.x）、24.x 或 26+，以及 pnpm 10.33.0。

```sh
git clone https://github.com/zhao922-bot/first-export-order.git
cd first-export-order
pnpm install --frozen-lockfile
pnpm dev
```

打开终端显示的地址，默认 `http://127.0.0.1:5173/`。游戏运行不需要 API Key 或后端服务。

```sh
pnpm build
pnpm preview --port 4173
```

生产输出在 `dist/`，采用相对资源路径和 hash 路由。本仓库发布源码与下载包，未配置 GitHub Pages 在线站点。

## 检查与复现

```sh
pnpm test
pnpm test:coverage
pnpm lint
pnpm format:check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e --workers=2
```

GitHub Actions 自动执行格式、静态检查、单元测试及公式覆盖率、构建、桌面与手机尺寸的 Playwright 流程测试。十一项核心公式/计分模块逐文件执行四项 100% 覆盖率门槛。

```sh
# 1,000 个固定种子 × 三种策略，以及首错保护探针
pnpm balance:simulate --seeds=1000 --workers=4

# Windows 本地分发包，包含运行时和局域网启动脚本
pnpm playtest:package --out=outputs/local-playtest-current

# 原生打包（Windows；APK 另需 JDK 21、Android SDK）
pnpm package:exe
pnpm package:apk
```

原生回归使用 `pnpm test:native` / `pnpm test:android`，需要先构建当前包，并准备原 0.1.0 升级测试输入；历史包不在 Git 中。这两项不包含在通用 Web CI 内。Android 回归仅允许专用模拟器，详见 [环境与输入要求](docs/NATIVE_PLAYTEST.md#开发者重建)。

生成的构建、报告、日志和试玩数据位于 `dist/`、`outputs/`、`work/` 等本地目录，不提交到仓库。重新生成后查看本地报告；不要把真人指标或存档提交到 Git。

## 项目结构

| 路径                                        | 内容                                         |
| ------------------------------------------- | -------------------------------------------- |
| `src/content/`                              | 七关剧情、参数、引导、演出 JSON 与入口       |
| `src/domain/`、`schemas/generated/`         | 类型、Zod 校验及生成的 JSON Schema           |
| `src/engine/`                               | 公式、账本、种子随机、业务状态机、事件和复盘 |
| `src/app/`、`src/components/`、`src/views/` | Vue 应用、界面与演出                         |
| `src/persistence/`、`src/telemetry/`        | 本地存档和主动导出的试玩指标                 |
| `desktop/`、`android/`                      | Electron / Capacitor 原生外壳                |
| `tests/`                                    | 单元、内容、浏览器、原生和升级回归           |
| `scripts/`                                  | 内容校验、平衡模拟、指标汇总和打包           |

[项目规划](PROJECT_PLAN.md) · [内容编写](docs/content-authoring.md) · [验收矩阵](docs/acceptance-matrix.md) · [专业审校](docs/trade-review.md) · [12 人试玩包](docs/playtest/README.md) · [本地分发维护](docs/local-playtest/MAINTAINER.md)

角色图集由 AI 生成，提示词记录在 [美术说明](docs/art-direction/character-prompt.txt)。仓库目前未指定项目级开源许可证；公开可见不等于授予任意再分发或商用许可。第三方依赖遵循各自许可证，原生包内附相关声明。

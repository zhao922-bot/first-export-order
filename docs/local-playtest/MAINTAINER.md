# 本地试玩包的制包与验收

目标是 Windows 10/11 x64 免安装包。玩家获得生产网页、固定运行时、两个启动入口和说明，不需要源工程、Node 或 pnpm。手机通过电脑的私有 IPv4 局域网地址访问。没有公开部署、服务安装、自动防火墙修改或服务器数据收集。

## 制包

```powershell
pnpm playtest:package
# 更新后保留历史包，指定一个新目录：
pnpm playtest:package --out=outputs/local-playtest-win-x64-r2
```

命令先执行 `pnpm build`，然后下载并校验 `scripts/local-playtest/runtime.json` 固定的官方运行时 ZIP，只提取 `node.exe` 和完整 LICENSE。当前固定 [Node.js v24.22.1](https://nodejs.org/en/blog/release/v24.22.1)，官方 SHA-256 写入 JSON；缓存也必须重新核验，失败不继续。玩家解压后不再下载任何依赖。

输出目录、同名 `.zip` 和 `.zip.sha256`。已有输出一律报错，避免覆盖发放批次；不删除原包。制包时需要 Windows、工程依赖及首次下载网络，运行时无这些要求。需要升级运行时，先核对官方发布页、SHA-256 和 LICENSE，再修改固定 JSON 并完整复验。

`package-manifest.json` 记录内容版本/哈希、运行时版本与每个文件的摘要。生产依赖许可自动收集；`@vue/devtools-api@6.6.4` npm 包未带许可，使用 [同版本上游 LICENSE](https://raw.githubusercontent.com/vuejs/devtools-v6/v6.6.4/LICENSE) 原文补齐，保留来源。许可来源变更或缺失会阻断制包，不猜测版权人。

## 目录与启动

```text
local-playtest-win-x64/
  START-LOCAL.cmd          # 默认 127.0.0.1:4173，自动打开浏览器
  START-PHONE.cmd          # 明确开启局域网模式，显示当前网卡候选 URL
  README.txt
  TROUBLESHOOTING.txt
  PLAYER_GUIDE.txt
  FEEDBACK_FORM.txt
  server.mjs               # 从检查过类型的 TS 编译，无 npm 运行依赖
  package-manifest.json
  THIRD-PARTY-NOTICES.txt
  runtime/{node.exe,LICENSE}
  web/                    # Vite 生产构建
```

只把上述包交给玩家，组织者名单、问卷答案、自动化输出和验收阈值不打包。网页 JS 本身仍包含教学配置，单机游戏不承诺防作弊。

启动按清单验证全部文件，只在内存中提供 `web/` 的登记文件；GET/HEAD、正确 MIME、禁用缓存，拒绝其他文件、目录遍历、坏编码和上传请求。本机模式只监听回环；手机模式监听 IPv4 通配地址，但只接受本机或私有 IPv4 来源及登记的本机 Host。没有公网隧道或端口映射。

端口固定为 4173，冲突不会抢占或自动漂移。Windows 通配监听与具体地址可能重叠，启动前额外检测本机地址上的已有服务。手动 `--port=4180` 可更换，但要先导出原地址记录并在整轮使用同一端口。存档按浏览器 origin 隔离，不是放在解压目录里的数据。

局域网 HTTP 的 `crypto.randomUUID()` 不可用时，应用使用 `getRandomValues()` 生成 UUID v4，不使用弱随机数；只影响会话/命令 ID 的兼容性，不改剧情种子算法、账本、关卡或内容 JSON。

## 回归

```powershell
pnpm test
pnpm build
pnpm test:local-package
```

浏览器命令默认使用已生成的发行目录，固定测试端口 4187，不影响实际发放默认 4173。它包含已有 E05/全七关前后测回归和新增分发用例，桌面及 Pixel 7 各跑一次。局域网测试必须找到私有 IPv4 网卡，否则明确失败，不退回 localhost 冒充通过；可用 `PLAYTEST_LAN_IP` 指定当前真实网卡。测试使用隔离浏览器并禁用其代理，不更改玩家浏览器设置。

验证真正的 ZIP 时，先解压到一个新的中文/空格目录，再设置 `PLAYTEST_PACKAGE_DIR` 指向该目录后运行同一命令。检查文件摘要和真实运行时版本、关闭再启动、端口占用，以及手机尺寸下的下载/恢复。真实手机与 Wi-Fi 的防火墙/AP 隔离仍需发放现场确认，浏览器手机模拟器不能证明所有网络都可达。

`tests/content/local-launcher.test.ts` 从临时目录执行实际 CMD，PATH 仅保留 Windows System32；它只停止自己启动的进程树。`tests/unit/local-playtest-server.test.ts` 覆盖静态服务、地址选择、包完整性和打包白名单；`unique-id.test.ts` 覆盖 HTTPS/localhost 与普通 HTTP 的 ID 分支。

# 《出海第一单》空目录骨架说明

本文件保留规划阶段的目录说明。用户已确认规划并授权脚手架：目录现已创建，类型与业务占位模块已落地；正式剧情目录仍为空，只有用于 Zod 校验的独立示例包。完整关键文件职责见同目录 `PROJECT_PLAN.md` 第 3 章，当前实现范围见 `docs/scaffold-status.md`。

## 本轮实际交付

```text
项目根目录/
├─ PROJECT_PLAN.md          # 十二章开发规划
├─ DIRECTORY_SKELETON.md    # 本空目录骨架说明
├─ outputs/                # 上述两份文档的交付副本
└─ work/                   # 本轮文档核验材料，不属于应用源码
```

## 规划确认后才创建的空目录

```text
项目根目录/
├─ docs/
├─ public/
│  └─ assets/
│     ├─ products/
│     ├─ portraits/
│     └─ icons/
├─ scripts/
├─ schemas/
│  └─ generated/
├─ .github/
│  └─ workflows/
├─ src/
│  ├─ app/
│  │  └─ ports/
│  ├─ router/
│  ├─ styles/
│  ├─ domain/
│  │  ├─ types/
│  │  └─ schemas/
│  ├─ engine/
│  │  ├─ story/
│  │  ├─ economy/
│  │  ├─ rules/
│  │  └─ puzzles/
│  ├─ stores/
│  ├─ persistence/
│  │  └─ migrations/
│  ├─ telemetry/
│  ├─ composables/
│  ├─ views/
│  ├─ components/
│  │  ├─ layout/
│  │  ├─ shared/
│  │  ├─ supplier/
│  │  ├─ chat/
│  │  ├─ quote/
│  │  ├─ contract/
│  │  ├─ logistics/
│  │  ├─ documents/
│  │  ├─ finance/
│  │  └─ ending/
│  └─ content/
│     ├─ config/
│     ├─ inquiries/
│     ├─ logistics/
│     ├─ story/
│     │  ├─ L01/
│     │  ├─ L02/
│     │  ├─ L03/
│     │  ├─ L04/
│     │  ├─ L05/
│     │  ├─ L06/
│     │  └─ L07/
│     ├─ events/
│     ├─ glossary/
│     ├─ documents/
│     ├─ puzzles/
│     ├─ endings/
│     └─ assessments/
└─ tests/
   ├─ unit/
   ├─ content/
   ├─ fixtures/
   │  ├─ content/
   │  ├─ save-v1/
   │  ├─ save-v2/
   │  ├─ corrupt/
   │  └─ seed-cases/
   └─ e2e/
```

## 创建时机与验收

| 阶段 | 允许创建的内容 | 完成定义 |
|---|---|---|
| 本轮规划 | 两份 Markdown 文档及其交付副本 | 十二章完整，未生成 package.json、src、node_modules、实际剧情文件 |
| 规划确认后的脚手架 | 上述目录、工具链配置、类型与空实现、受控校验示例 | 用户要求的 pnpm test、pnpm build 通过；不写关卡业务逻辑 |
| 脚手架验收后的首个切片 | 第 1 关、第 3 关、数值纯函数与测试 | 两关可试玩、双陷阱有分步纠错；不顺手实现其他关卡 |
| 后续全量开发 | 剩余关卡、事件、单据、收汇和结局 | 按 PROJECT_PLAN.md 的后续门禁逐项验收 |

未来空目录若需要进入 Git，可按工程规范添加 `.gitkeep`；本轮不创建这些占位文件。云存档和排行榜只在 `src/app/ports/` 留抽象类型，不创建后端或服务连接目录。

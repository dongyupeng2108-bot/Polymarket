# Arb Validate Web - 项目规则总纲

> **⚠️ 进度控制**: 开发前请务必阅读 [PROJECT_MASTER_PLAN.md](PROJECT_MASTER_PLAN.md) 获取当前里程碑与焦点。

## 1. 业务主线与核心目标
- 核心定位：连接多平台（如 Polymarket / Kalshi 等）的市场数据与交易能力。
- 业务逻辑：
  1. 管理 交易对（Pair）。
  2. 基于 扫描（Scan） 发现 机会（Opportunity）。
  3. 将机会进入 模拟交易（paper trading） 与后续实盘路径，实现 发现 -> 验证 -> 交易 -> 复盘 闭环。

## 2. 命名与格式规范

### 2.1 里程碑分支标签 (Milestone Branch Tag)
- **格式**：`milestone: <Mx> <中文提醒>(<代号>)`
- **示例**：`milestone: P0.1 计划治理分支(feat/plan-p0-governance)`
- **说明**：这是里程碑分支标签，用于提醒上下文，**不等同** Git 分支名。

### 2.2 任务文件命名规范
- **格式**：`<里程碑>-<里程碑分支标签>-<任务名>-<日期>-<序号>.md`
- **示例**：`P0.1-PlanGov-Restructure-260131-070.md`

## 3. 核心实体与名词定义 (统一口径)

> **Glossary (术语索引)**: 详细定义请参阅 [DATA_DICTIONARY.md](../docs/DATA_DICTIONARY.md)

### 3.1 Glossary
- **Pair (交易对)**: 机会与交易的唯一载体，映射两个市场标的。 -> [Data Dictionary: Pair](../docs/DATA_DICTIONARY.md#pair)
- **Scan (扫描)**: 系统对 Pair 进行数据获取与计算的过程。 -> [Data Dictionary: Scan](../docs/DATA_DICTIONARY.md#scan)
- **ScanRun (扫描运行)**: 单次扫描的完整执行记录。 -> [Data Dictionary: ScanRun](../docs/DATA_DICTIONARY.md#scanrun)
- **Opportunity (机会)**: ScanRun 产出的满足条件的价差事件。 -> [Data Dictionary: Opportunity](../docs/DATA_DICTIONARY.md#opportunity)
- **Tradeable (可交易)**: 动态判定是否满足执行条件（盘口/风控）。 -> [Data Dictionary: Tradeable](../docs/DATA_DICTIONARY.md#tradeable)
- **Verification Status (验证状态)**: Pair 的静态资格 (VERIFIED/UNVERIFIED)。 -> [Data Dictionary: VerificationStatus](../docs/DATA_DICTIONARY.md#verificationstatus)
- **Reason Code (原因代码)**: 验证或扫描失败的具体错误码。 -> [Data Dictionary: ReasonCode](../docs/DATA_DICTIONARY.md#reasoncode)
- **Stream 终态**: SSE 流的最终状态 (Terminated/Error)。 -> [Data Dictionary: StreamStatus](../docs/DATA_DICTIONARY.md#streamstatus)

### 3.2 实体简述 (详细请见数据字典)
- **Pair**: 必须 VERIFIED 才可扫描。verified_at > 7天 强制重置。
- **Opportunity**: 仅对 VERIFIED Pair 产出。需满足 net_ev > threshold。
- **Reason Code**: 分为验证失败 (MAPPING_INVALID...) 和 扫描过滤 (EDGE_LOW...)。

## 4. 工程规范 (Engineering Standards)
> 详见 [WORKFLOW_v3_9.md](workflow-v39.md)
- **技术栈**: Next.js 16, React 19, Tailwind v4, Prisma, Playwright。
- **原则**: 严格类型(Prisma), 异步I/O(try/catch), 表现层优先服务端组件。
- **AI 协议**: 复杂任务必须遵循 Intent -> Analysis -> Plan -> Action 流程。
- **回报锚点**: 禁止回贴改写版，必须贴 notify 原文；以 report_sha 作为验收锚点。

## 5. 变更原则
- **口径同步**: 任何新增/修改状态词，必须先更新 [DATA_DICTIONARY.md](../docs/DATA_DICTIONARY.md) 和本 Rules 的 Glossary，再进入开发。
- **Gate Enforcement**: gate-light 会检查代码中的枚举/状态变更是否同步更新了字典文档。

## 6. 变更日志 (Changelog)
- 2026-01-31 (v1.3): 新增 P0 治理，引入 Glossary 与 Data Dictionary，瘦身文档。
- 2026-01-25 (v1.2): 初始整合，明确 Pair/Opportunity/Scan/Tradeable 定义。

## 7. 待定问题 (Open Questions)
- 暂无。

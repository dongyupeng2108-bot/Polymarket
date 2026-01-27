# Arb Validate Web - 项目规则总纲

> **⚠️ 进度控制**: 开发前请务必阅读 [PROJECT_MASTER_PLAN.md](PROJECT_MASTER_PLAN.md) 获取当前里程碑与焦点。

## 1. 业务主线与核心目标
- 核心定位：连接多平台（如 Polymarket / Kalshi 等）的市场数据与交易能力。
- 业务逻辑：
  1. 管理 交易对（Pair）。
  2. 基于 扫描（Scan） 发现 机会（Opportunity）。
  3. 将机会进入 模拟交易（paper trading） 与后续实盘路径，实现 发现 -> 验证 -> 交易 -> 复盘 闭环。

## 2. 核心实体与名词定义 (统一口径)

### 2.1 交易对 (Pair)
- 定义：机会与交易的唯一载体，每条 Pair 表达 一组可对冲的两个市场标的 的映射关系。
- 验证状态 (Verification Status)：
  - UNVERIFIED (未验证)：不能进入机会扫描（默认不可扫描/不可交易）。
  - VERIFIED (已验证)：允许被扫描；是否可交易由 Tradeable 判定决定。
- 字段建议：pair_id, market_a_ref, market_b_ref, verification_status, verified_at, verify_fail_reason。
- 验证策略：
  - 增量验证：自动匹配/新增后、配置变更后、连续扫描失败后立即触发。
  - 全量验证：每天 1 次。
  - 过期策略：verified_at 超过 7 天强制重新验证（视为 UNVERIFIED）。

### 2.2 扫描 (Scan)
- ScanRun：一次扫描的运行记录（开始/结束、耗时、统计）。
- 扫描次数：完成一次 ScanRun +1（终态：SUCCESS / FAILED / CANCELLED）。
- 计数规则：“扫描次数 +1”只在终态落盘时发生（避免“中途重连/重试”导致重复计数）。

### 2.3 机会 (Opportunity)
- 定义：某个时刻、某个 Pair、满足可执行条件的价差/EV 事件。Opportunity 不是 Pair 本身，而是 Pair 在一次 ScanRun 中产生的结果。
- 判定规则：
  - 仅对 VERIFIED 的 Pair 产出。
  - 门槛：net_ev > threshold。
- 建议字段：pair_id, scan_run_id, snapshot_id, gross_edge, net_ev, max_size, filters_failed。

### 2.4 可交易 (Tradeable)
- 定义：在 当前时刻 满足执行条件（动态判定）。
- 区别：VERIFIED 是静态属性（资格），TRADEABLE 是动态属性（时机）。
- 条件：盘口可得、max_size 达标、风控满足。

### 2.5 失败原因代码 (Reason Code)
- 验证失败 (Pair): MAPPING_INVALID, MARKET_NOT_FOUND, NO_DATA_PERMISSION, SCHEMA_MISMATCH.
- 扫描过滤 (Opportunity): EDGE_LOW, NO_BOOK, STALE_SNAPSHOT, SIZE_LOW, RISK_REJECTED.
- 自动匹配流 (AutoMatch/SSE):
  - HTTP_400 (Phase: FETCH): 上游 API 参数错误或请求格式无效。不可重试，需修复代码。
  - EMPTY_RESULTS (Phase: FETCH/FILTER): 上游返回空列表或过滤后为空。正常业务状态，可忽略。
  - SSE_TERMINATED (Phase: STREAM): 流连接意外中断。前端应自动重连。
  - PARSE_ERROR (Phase: PROCESS): 数据结构解析失败。需检查 Schema。

### 2.6 高频字段与状态口径 (High-Freq Definitions)
- **Stream 终态**: 
  - `progress` (过程), `error` (业务错), `terminated` (连接断).
  - 注: `terminated` 仅代表流断开，**不**等价于 ScanRun 终态落盘（除非重试耗尽）。
- **计数字段 (最小解释)**:
  - `scanned`: 扫描总数。
  - `matched`: 初步匹配数。
  - `added`: 成功入库。
  - `existing`: 库中已有。
  - `skipped`: **主动忽略** (如规则过滤、黑名单)。
  - `failed/errors`: **异常失败** (如解析错、网络错)。

## 3. 工程规范 (Engineering Standards)
> 详见 [WORKFLOW_v3_8_STANDARD_CONCISE.md](WORKFLOW_v3_8_STANDARD_CONCISE.md)
- **技术栈**: Next.js 16, React 19, Tailwind v4, Prisma, Playwright。
- **原则**: 严格类型(Prisma), 异步I/O(try/catch), 表现层优先服务端组件。
- **AI 协议**: 复杂任务必须遵循 Intent -> Analysis -> Plan -> Action 流程。

## 4. 变更原则
- 任何新增/修改状态词，必须先写入本 Rules 的 名词定义/口径，再进入开发。
- 对外口径优先 少而清晰：状态尽量二值化（UNVERIFIED/VERIFIED）。

## 5. 变更日志 (Changelog)
- 2026-01-25 (v1.2): 初始整合，明确 Pair/Opportunity/Scan/Tradeable 定义及失败原因代码。

## 6. 待定问题 (Open Questions)
- 暂无。

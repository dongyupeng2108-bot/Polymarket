# Arb Validate Web - 数据字典 (Data Dictionary)

> **文档定位**：本项目所有核心业务实体的**唯一真理来源 (Single Source of Truth)**。
> **更新规则**：任何代码层面的枚举/状态/核心字段变更，必须同步更新本文档与 [PROJECT_RULES.md](../rules/PROJECT_RULES.md)。

## 1. 核心实体 (Core Entities)

### Pair (交易对)
- **定义**: 两个市场标的（Market）之间的映射关系，是套利机会的基础载体。
- **来源**: `prisma/schema.prisma` -> `model Pair`
- **关键字段**:
  - `id` (String, UUID): 唯一标识。
  - `status` (Enum): 验证状态。
  - `market_a/b` (Json): 市场快照。
- **状态枚举 (VerificationStatus)**:
  - `UNVERIFIED`: 默认状态，未经过完整性检查，不可扫描。
  - `VERIFIED`: 已通过验证，允许被扫描引擎加载。
  - `BLACKLISTED`: 手动或自动拉黑，永久排除。

### Scan (扫描)
- **定义**: 系统对一批 VERIFIED Pair 进行数据获取、计算价差的过程。
- **来源**: 业务逻辑 `scanners/`
- **类型**:
  - `Standard`: 标准轮询扫描。
  - `Deep`: 深度扫描（含历史回溯）。

### ScanRun (扫描运行)
- **定义**: 单次扫描任务的完整执行记录。
- **来源**: `prisma/schema.prisma` -> `model ScanRun`
- **关键字段**:
  - `status` (Enum): 运行结果。
  - `stats` (Json): 统计数据 (scanned, matched, etc.)。
- **状态枚举 (ScanStatus)**:
  - `RUNNING`: 正在执行。
  - `COMPLETED`: 正常结束。
  - `FAILED`: 异常结束。
  - `CANCELLED`: 被中断。

### Opportunity (机会)
- **定义**: 在某次 ScanRun 中发现的，满足套利条件的价差事件。
- **来源**: `prisma/schema.prisma` -> `model Opportunity`
- **约束**:
  - 必须关联一个 valid `ScanRun`。
  - 必须关联一个 verified `Pair`。
  - `net_ev` > 0。

### Tradeable (可交易性)
- **定义**: 一个动态属性，判断当前机会是否值得执行。
- **判断依据**:
  - `Liquidity`: 盘口深度足够。
  - `Size`: `max_size` >= 最小下单金额。
  - `Risk`: 风控检查通过。

## 2. 状态码与枚举 (Codes & Enums)

### ReasonCode (失败原因代码)
用于 `Pair.verification_reason` 或 `Opportunity.filter_reason`。

| Code | Type | Description |
| :--- | :--- | :--- |
| `MAPPING_INVALID` | Verification | 映射关系无效（如 A/B 标的不匹配）。 |
| `MARKET_NOT_FOUND` | Verification | 市场 ID 在交易所不存在。 |
| `NO_DATA_PERMISSION` | Verification | 无权访问该市场数据。 |
| `EDGE_LOW` | Filter | 价差/EV 低于阈值。 |
| `NO_BOOK` | Filter | 盘口为空或无效。 |
| `STALE_SNAPSHOT` | Filter | 数据快照过期。 |
| `SIZE_LOW` | Filter | 可交易量低于最小值。 |
| `RISK_REJECTED` | Filter | 被风控模块拒绝。 |
| `kalshi_auth_missing_degraded` | AutoMatch | Kalshi 认证缺失，进入降级模式 (DB Fallback)。 |
| `kalshi_fetch_disabled_degraded` | AutoMatch | Kalshi 抓取被禁用，进入降级模式。 |
| `no_kalshi_markets_available` | AutoMatch | 降级模式下本地无可用 Kalshi 市场数据。 |
| `no_matches_found` | AutoMatch | 扫描完成但未找到匹配项。 |
| `completed_normally` | AutoMatch | 自动匹配正常完成。 |

### StreamStatus (流状态)
用于 SSE 连接状态描述。

| Status | Description |
| :--- | :--- |
| `connected` | 连接正常。 |
| `progress` | 正在传输数据。 |
| `error` | 发生业务错误（需查看 error code）。 |
| `terminated` | 连接已断开（终态）。 |

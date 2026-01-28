# Arb Validate Web - 项目总控计划 (Master Plan)

> **文档定位**：本项目最高优先级的进度控制文件。所有任务发布必须对齐当前里程碑 (Current Focus)。
> **更新规则**：每完成一个 Milestone 或重大特性，必须更新本文件的状态指针。

## 0.x 任务头部格式（Task Header Contract）

为确保自动化协议的严格执行，所有任务必须遵循以下头部格式：

- **首行约束**：任务首个非空行必须是 `task_id: <ID>`。
  - ID 格式：`M<里程碑>_<描述>_<YYMMDD>_<NNN>`
  - 示例：`M1_5_AutoMatch_Candidates0_Diag_FixProxyOrPipeline_260127_067`
  - 编号 `<NNN>`：递增且不得复用（当前最新编号：**068**）。
- **第二行约束**：必须是 `milestone: Mx`（需与 task_id 中的里程碑一致，如 `M1.5`）。
- **禁忌**：严禁使用 `TraeTask_*` 或其他任何前缀作为任务首行。

**标准示例**：
```text
task_id: M1_5_AutoMatch_Candidates0_Diag_FixProxyOrPipeline_260127_067
milestone: M1.5
```

## 1. 核心愿景 (Core Vision)
构建一个**连接多平台（Polymarket/Kalshi）市场数据与交易能力**的套利终端。
- **核心闭环**：Pair (交易对) -> Scan (扫描) -> Opportunity (机会) -> Trade (模拟/实盘) -> Review (复盘)。
- **技术底座**：Next.js 16 + Node.js (全异步) + 自动化工作流 (Workflow v3.8)。

---

## 2. 总体路线图 (Roadmap & Milestones)

### ✅ M0: 基础设施与自动化闭环 (Completed)
- [x] **Workflow v3.8**: 建立 ChatGPT -> Trae -> Finalizer 的严格自动化协议。
- [x] **Task Manager**: 实现任务分发、结果回传、防假机制。
- [x] **Bridge**: 连通 Tampermonkey 与本地文件系统。

### 🔄 M1: 基础数据与验证体系 (Current Focus)
- [x] **Shadow Mode**: 建立影子验证机制。
- [x] **Healthcheck**: 网站基础健康检查脚本。
- [ ] **M1.5 仪表盘重构**: 
    - 确保 Dashboard / Pairs / Opportunities 页面逻辑与 `PROJECT_RULES` 定义一致。
    - 实现 Pairs 的增量/全量验证状态可视化 (VERIFIED/UNVERIFIED)。
    - 实现 Auto-match 实时流的稳定展示。
- [ ] **M1.6 套利机会页面逻辑与验证**:
    - 整理 Opportunities 页面功能逻辑。
    - 验证基础功能与数据准确性。

### 📅 M2: Pair 核心功能（含 AutoMatch 的可用性）
- [ ] **AutoMatch Usability**: 确保自动匹配流程的稳定性与准确性 (Candidate Fetch -> Fuzzy Match -> Verification)。
- [ ] **Pair Management**: 完善 Pair 的生命周期管理 (Verified/Unverified/Blacklisted)。
- [ ] **Data Alignment**: 解决 PM 与 Kalshi 之间的数据映射与对齐问题。

### 📅 M3: 机会扫描 (Opportunity Scan)
- [ ] **Scan Engine**: 实现高频/低频扫描策略。
- [ ] **Opportunity Filters**: 实现基于 Spread/Size/Risk 的过滤逻辑。
- [ ] **Notification**: 发现机会后的实时通知机制。

### 📅 M4: 虚拟交易 (Paper Trading，第一阶段结束点)
- [ ] **Paper Execution**: 模拟下单与成交逻辑。
- [ ] **P&L Tracking**: 模拟账户的盈亏统计。
- [ ] **Phase 1 Review**: 第一阶段闭环验收。

> **第二阶段边界说明**：M4 标志着“第一阶段”的结束。此后进入“第二阶段：实盘交易对接”，重点解决下单接口对接、真实资金管理、实盘风控以及实盘与模拟盘的差异处理。

### 📅 M5: 生产级稳定性 (Production Ready)
- [ ] **Backup & Rollback**: 版本快照与一键回滚。
- [ ] **Alert System**: 飞书/Telegram 报警集成。
- [ ] **Performance**: 支撑 1000+ Pairs 的秒级扫描。

---

## 3. 当前开发焦点 (Current Development Focus)

**📍 当前状态**: `M1.6 - 套利机会页面逻辑与验证`

**待办任务 (Next Steps)**:
1. **Task 030 (已完成)**: 解决 M1.5 仪表盘 UI 展示问题 (Auto-match 流状态、Skipped/Error 可视化)。
2. **Task 031 (已完成)**: 生产级稳定性加固 (Auto-match SSE 重连机制、错误分流优化)。
3. **Task 033 (已完成)**: M1.6 套利机会页面逻辑与验证 (STALE_SNAPSHOT 检查、Tradeable 逻辑对齐、数据流验证)。
4. **Task 036 (已完成)**: Auto-match 错误码规范化与 UI 重连机制优化 (HTTP 400 处理、SSE Terminated 策略)。
5. **Task 037 (已完成)**: Fix Kalshi Fetch HTTP 400 Root Cause & Creds Guard (Status=open, Safe Diagnostics)。
6. **Task 040 (已完成)**: Enable Kalshi PublicReadOnly Mode And Stop UI Reconnect。
7. **Task 042 (已完成)**: Fix Kalshi Markets Limit Le1000 Add Pagination And Unblock Scan。
8. **Task 044 (已完成)**: Preflight TaskFormat ValidateScript And BlockInvalidTasks (Status=closed)。
9. **Task 045 (已完成)**: Kalshi Fetch 400 Fix (Pagination) - Implement Fail-Fast (5 pages/5000 items/20s) and verify (Status=closed)。

**验收标准 (DoD)**:
- 任务必须包含 `manual_verification.json`。
- 网站健康检查 (端口 53121) 必须通过。
- 无 `next lint` 错误。
- 以上全部满足后，需老板在对话中明确回复：验收通过。

---

## 4. 需求池 (Backlog)
- [ ] **UI**: 增加 Dark Mode 切换。
- [ ] **DX**: 引入 Storybook 管理 UI 组件。
- [ ] **Perf**: 优化 Prisma 查询性能 (添加索引)。
- [ ] **Data**: 支持 Kalshi 市场数据接入。
- [ ] **Optional Extensions (From Old Roadmap)**:
    - **Queue & Replay**: 模拟真实成交队列延迟与滑点、历史数据回放。
    - **Confidence Arbitrage**: 接入赌场赔率/外部预言机作为 Truth；基于偏差 (Deviation) 的自动套利策略。

---

## 5. 经验教训库 (Knowledge Base)
- **Protocol**: 必须显式输出 `notify` 文件内容，禁止只给路径。
- **Finalizer**: 禁止用 SELF_REF 伪造产物存在/内容；SELF_REF 仅允许作为 deliverables_index 的 sha256_short 特殊值，并且条目对应文件必须真实存在。
- **Network**: Node.js fetch 在代理环境下必须特殊处理 localhost。

# Arb Validate Web - 项目总控计划 (Master Plan)

> **文档定位**：本项目最高优先级的进度控制文件。所有任务发布必须对齐当前里程碑 (Current Focus)。
> **更新规则**：仅老板在更换新聊天窗口时明确通知需要更新 PLAN 才更新（责任人：老板触发 -> Trae 执行）。

## 0.x 任务头部格式 (Task Header Contract)

为确保自动化协议的严格执行，所有任务必须遵循以下头部格式：

- **首行约束**：任务首个非空行必须是 `task_id: <ID>`。
  - ID 格式：`M<里程碑>_<描述>_<YYMMDD>_<NNN>`
  - 示例：`M1_5_AutoMatch_Candidates0_Diag_FixProxyOrPipeline_260127_067`
  - 编号 `<NNN>`：递增且不得复用（当前最新编号：**070**）。
- **第二行约束**：必须是 `milestone: Mx <里程碑分支标签>`。
  - 示例：`milestone: P0.1 计划治理分支(feat/plan-p0-governance)`
  - 说明：里程碑分支标签（中文+代号）用于提醒，不等同于 Git 分支。
- **其他约束**：
  - 建议使用 `task_id:` 作为唯一解析主键。
  - 允许存在 `TraeTask` 字样，但不作为解析依赖。

**标准示例**：
```text
task_id: P0_1_PlanRestructure_Glossary_Dictionary_Governance_260131_070
milestone: P0.1 计划治理分支(feat/plan-p0-governance)
```

## 1. 核心愿景 (Core Vision)
构建一个**连接多平台（Polymarket/Kalshi）市场数据与交易能力**的套利终端。
- **核心闭环**：Pair -> Scan -> Opportunity -> Trade -> Review。
- **技术底座**：Next.js 16 + Node.js (全异步) + 自动化工作流 (Workflow v3.9)。

---

## 2. 总体路线图 (Roadmap & Milestones)

### 📋 P0: 流程与验收机制调整 (Process Governance)
- **P0.1 门禁分层与文档治理**:
  - [x] **Plan Restructure**: 重构里程碑结构，引入 P0 层级与 Open Branches 表。
  - [x] **Doc Governance**: 三大文档瘦身，建立 Glossary 与 Data Dictionary。
  - [x] **Gate Enforcement**: gate-light 新增字典同步检查。

### ✅ M0: 基础设施与自动化闭环 (Completed)
- **M0.1 基础工作流**:
  - [x] **Workflow v3.8**: 建立 ChatGPT -> Trae -> Finalizer 的严格自动化协议。
  - [x] **Task Manager**: 实现任务分发、结果回传、防假机制。
  - [x] **Bridge**: 连通本地文件系统。

### 🔄 M1: 基础数据与验证体系 (Current Focus)
- **M1.1 影子模式**:
  - [x] **Shadow Mode**: 建立影子验证机制。
  - [x] **Healthcheck**: 网站基础健康检查脚本。
- **M1.5 仪表盘重构**:
  - [ ] **UI Alignment**: 确保 Dashboard / Pairs / Opportunities 页面逻辑与 `PROJECT_RULES` 定义一致。
  - [ ] **Verification Viz**: 实现 Pairs 的增量/全量验证状态可视化 (VERIFIED/UNVERIFIED)。
  - [ ] **Stream Viz**: 实现 Auto-match 实时流的稳定展示。
- **M1.6 套利机会页面逻辑与验证**:
  - [ ] **Logic**: 整理 Opportunities 页面功能逻辑。
  - [ ] **Verification**: 验证基础功能与数据准确性。

### 📅 M2: Pair 核心功能 (含 AutoMatch 的可用性)
- **M2.1 自动匹配可用性**:
  - [ ] **AutoMatch Usability**: 确保自动匹配流程的稳定性与准确性 (Candidate Fetch -> Fuzzy Match -> Verification)。
- **M2.2 Pair 管理**:
  - [ ] **Lifecycle**: 完善 Pair 的生命周期管理 (Verified/Unverified/Blacklisted)。
- **M2.3 数据对齐**:
  - [ ] **Data Alignment**: 解决 PM 与 Kalshi 之间的数据映射与对齐问题。

### 📅 M3: 机会扫描 (Opportunity Scan)
- **M3.1 扫描引擎**:
  - [ ] **Scan Engine**: 实现高频/低频扫描策略。
- **M3.2 过滤与通知**:
  - [ ] **Filters**: 实现基于 Spread/Size/Risk 的过滤逻辑。
  - [ ] **Notification**: 发现机会后的实时通知机制。

### 📅 M4: 虚拟交易 (Paper Trading，第一阶段结束点)
- **M4.1 模拟执行**:
  - [ ] **Paper Execution**: 模拟下单与成交逻辑。
  - [ ] **P&L Tracking**: 模拟账户的盈亏统计。
- **M4.2 阶段验收**:
  - [ ] **Phase 1 Review**: 第一阶段闭环验收。

> **第二阶段边界说明**：M4 标志着“第一阶段”的结束。此后进入“第二阶段：实盘交易对接”。

### 📅 M5: 生产级稳定性 (Production Ready)
- **M5.1 运维增强**:
  - [ ] **Backup & Rollback**: 版本快照与一键回滚。
  - [ ] **Alert System**: 飞书/Telegram 报警集成。
  - [ ] **Performance**: 支撑 1000+ Pairs 的秒级扫描。

---

## 3. Open Branches (未关闭里程碑分支)

| milestone_branch_tag | milestone | last_task_id | last_update | status | last_summary | next_action |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 计划治理分支(feat/plan-p0-governance) | P0.1 | 070 | 2026-01-31 | DOING | Plan重构与字典治理中 | 完成脚本与提交 |
| 门禁分支(feat/gates-unify-073) | M0.1 | 073 | 2026-01-30 | DOING | Gate-light 修复中 | 等待 PR 合并 |

---

## 4. 当前开发焦点 (Current Development Focus)

**📍 当前状态**: `P0.1 - 门禁分层与文档治理` (插队任务)

**待办任务 (Next Steps)**:
1. **Task 070 (Doing)**: P0.1 Plan重构 + 字典治理 + Gate-light 强制检查。
2. **Task 073 (Doing)**: 修复 gate-light PR check 异常。
3. **Task 030+ (Backlog)**: 继续 M1.5/M1.6 剩余 UI 任务。

**验收标准 (DoD)**:
- 任务必须包含 `manual_verification.json`。
- 网站健康检查 (端口 53121) 必须通过。
- 无 `next lint` 错误。
- 以上全部满足后，需老板在对话中明确回复：验收通过。

---

## 5. 需求池 (Backlog)
- [ ] **UI**: 增加 Dark Mode 切换。
- [ ] **DX**: 引入 Storybook 管理 UI 组件。
- [ ] **Perf**: 优化 Prisma 查询性能 (添加索引)。
- [ ] **Data**: 支持 Kalshi 市场数据接入。
- [ ] **Optional Extensions**:
    - **Queue & Replay**: 模拟真实成交队列延迟与滑点、历史数据回放。
    - **Confidence Arbitrage**: 接入赌场赔率/外部预言机作为 Truth。

---

## 6. 经验教训库 (Knowledge Base)
- **Protocol**: 必须显式输出 `notify` 文件内容，禁止只给路径。
- **Finalizer**: 禁止用 SELF_REF 伪造产物存在/内容；SELF_REF 仅允许作为 deliverables_index 的 sha256_short 特殊值。
- **Network**: Node.js fetch 在代理环境下必须特殊处理 localhost。

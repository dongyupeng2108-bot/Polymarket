# Arb Validate Web - 项目总控计划 (Master Plan)

## 1. Plan Purpose (计划用途)
本计划文档仅用于宏观进度控制（里程碑追踪）与并行分支管理（分支台账），不包含具体技术细节或长篇复盘。

## 2. Update Protocol (更新协议)
- **触发条件**: 仅当老板在新聊天窗口明确指令“更新 Plan”时执行更新。严禁在每个任务结束时自动更新。
- **更新粒度**: 仅更新进度摘要（Status）、分支台账（Ledger）与里程碑状态（Milestone），保持文档轻量。

## 3. Milestone Tree (里程碑树)
- `M0` (基础设施/基础)
  - `M0.1` (Gate Light / GitHub Actions) [COMPLETED]
    - `TraeTask_M0_GitHub_GateLight_FixCI_260129_002` (DONE)
- `M1` (流程与门禁) [COMPLETED]
- `M1.5` (可观测性/Evidence Envelope) [IN_PROGRESS]
  - `M1_5_Postflight_Gate_Fix_Healthcheck_Excerpt_And_Index_Completeness_260129_070` (DONE)
  - `M1_5_Migrate_Gates_To_EnvelopeJson_Conftest_CI_Light_260129_071` (DONE)
  - `M1_5_GateLight_Sync071_To_GithubRepo_And_MakeActionsVisible_260129_072` (PENDING)
- `M2` (Pair (配对)) [PENDING]
  - `M2.1` (Auto Pair (自动配对))
- `M3` (Scan (扫描)) [PENDING]
- `M4` (Paper/Virtual Trading (虚拟交易)) [PENDING]
- `P0` (流程优化/验收机制调整) [IN_PROGRESS]
  - `P0.1` (Gate Layering (门禁分层)) [DONE]
  - `P0.2` (Plan Governance (计划治理)) [IN_PROGRESS]
    - `P0_Plan_Refactor_Governance_MilestoneTree_TaskIdConvention_OpenBranchLedger_260129_074` (IN_PROGRESS)

## 4. Task ID Convention (任务编号规范)
**规则**: `<Milestone>_<BranchName>_<TaskName>_<YYMMDD>_<SEQ>`

**示例**:
- 标准格式: `task_id: M1_5_AutoMatch_Candidates0_Diag_FixProxyOrPipeline_260127_067`
- 治理任务: `task_id: P0_Plan_Refactor_Governance_MilestoneTree_TaskIdConvention_OpenBranchLedger_260129_074`

## 5. Open Branch Ledger (开放分支台账)
| branch_name | goal | last_task_id | last_report_link_or_commit | status | next_action |
|---|---|---|---|---|---|
| `feat/gate-light-dispatch-001` | M0 GitHub Gate Light CI 修复 | `TraeTask_M0_GitHub_GateLight_FixCI_260129_002` | `e0ee70f` | OPEN | Verify workflow_dispatch on main |
| `feat/plan-governance-074` | P0.2 Plan Governance Refactor | `P0_Plan_Refactor_Governance_MilestoneTree_TaskIdConvention_OpenBranchLedger_260129_074` | (Current) | OPEN | Submit PR |

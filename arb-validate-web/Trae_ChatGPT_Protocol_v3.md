# Trae-ChatGPT 协作协议 v3.0 (Smart Agent Mode)

## 1. 核心理念 (Core Philosophy)
从“指令式执行”转向“目标导向协作”。
- **Boss (User)**: 战略决策者。负责确定总目标、指定里程碑，并在成本/时间过高时调整方向。
- **ChatGPT (Architect/PM/QA)**: 负责拆解里程碑、定义**目标 (Goal)**、**范围 (Scope)** 和 **验收标准 (Acceptance Criteria)**。
- **Trae + Gemini 3 (Senior Engineer)**: 负责**方案设计**、**代码实现**、**环境调试**和**自我修复**。

## 2. 角色分工 (Roles & Responsibilities)

### 2.1 The Boss (User)
- **职责**:
  - 设定项目愿景和里程碑目标。
  - 监控项目进度和资源消耗。
  - 当流程受阻或成本过高时，进行方向调整或流程干预。

### 2.2 ChatGPT (The Architect)
- **职责**:
  - 依据 Boss 的里程碑拆解为具体的可执行任务 (Task)。
  - 定义清晰的 `GOAL` (要做什么) 和 `ACCEPTANCE` (怎么算做完)。
  - **禁止**: 猜测文件路径、编写复杂的 PowerShell/Bash 脚本、试图远程控制 CLI。
- **输出**: 标准化任务描述文件，文件名必须包含**日期**和**序号**。

### 2.3 Trae + Gemini 3 (The Engineer)
- **职责**:
  - 监控任务队列。
  - **自主决策**: 决定修改哪些文件、运行哪些测试、安装哪些依赖。
  - **自我修复**: 遇到报错 (Linter/Runtime Error) 自动修复，直到通过验收。
  - **产物交付**: 生成与任务文件名严格对应的 `result.json` 和 `bundle.zip`。

## 3. 工作流规范 (Workflow Specification)

### 3.1 任务发布 (Task Publishing)
ChatGPT 生成任务文件，存入 `ChatGPT task/` 目录。

**命名规范 (必须遵守):**
- 格式: `TraeTask_<Date>_<Seq>_<MilestoneTag>.md`
- 示例: `TraeTask_20260124_013_M1_FixLogin.md`
- **注意**: `Date` (如 20260124) 和 `Seq` (如 013) 必须清晰且递增。

**文件内容模板 (v3.0):**
```markdown
TraeTask_<TASK_ID>
TASK_ID: <TASK_ID> (必须与文件名完全一致，不含扩展名)
TYPE: SMART_AGENT
PROJECT_MILESTONE: <当前里程碑代号>
MILESTONE_TARGET: <里程碑目标> (任务文件的首要描述必须是里程碑目标)
GOAL:
- <核心目标 1>
- <核心目标 2>
CONTEXT:
- <相关文件路径提示 (可选)>
ACCEPTANCE:
- <验收标准 1 (可自动化验证)>
- <验收标准 2>
RUN:
CMD: AGENT_SOLVE (指示 Trae 智能体接管)
本次任务发布完毕。
```

### 3.2 任务执行 (Task Execution)
1.  **Watcher 发现**: 检测到新任务。
2.  **文件名一致性检查**: 
    - 系统自动提取文件名中的 `TASK_ID`。
    - 生成的所有产物 (Log/Result/Zip) 将强制使用该 `TASK_ID` 作为后缀。
    - 例如: 任务 `TraeTask_20260124_013.md` -> 产物 `run_20260124_013.log`, `result_20260124_013.json`。
3.  **Gemini 接管**:
    - 读取文件，理解 `GOAL` 和 `MILESTONE_TARGET`。
    - 开始思考与编码循环 (Think-Code-Verify Loop)。

### 3.3 结果回传 (Result Feedback)
Watcher 监控到 `results/<TASK_ID>/` 生成完毕，自动触发回传：
- **回传内容**:
  - `status`: DONE / FAILED
  - `artifacts`: 包含修改后的代码 diff 或文件列表。
  - `logs`: 关键执行日志 (文件名与任务严格对应)。
- **ChatGPT 动作**:
  - 验证 `ACCEPTANCE` 是否达成。
  - 达成 -> 向 Boss 汇报进度，或发布下一个 Task。
  - 未达成 -> 发布 Fix Task (附带反馈建议)。

## 4. 异常处理 (Exception Handling)
- **Boss 介入**: 如果 ChatGPT 连续发布 3 个任务均未能达成 Milestone 目标，或 Gemini 陷入死循环，Boss 将介入调整协议或目标。
- **环境差异**: Gemini 拥有真实环境的 Read/Write 权限，遇到路径错误直接修正。
- **执行超时**: 若 Gemini 30分钟内未提交结果，Watcher 触发超时报警。

## 5. 协议版本控制
- **Version**: 3.1.0
- **Effective Date**: 2026-01-24
- **Status**: Active

---
**致 ChatGPT**: 
1.  **确认 Boss 角色**: 你必须时刻对齐 Boss 设定的里程碑目标。
2.  **遵守命名**: 下一个任务必须命名为 `TraeTask_<TodayDate>_<NextSeq>_...`。
3.  **Smart Mode**: 请使用 v3.0 模板，不要写具体命令，让 Gemini 发挥工程师能力。

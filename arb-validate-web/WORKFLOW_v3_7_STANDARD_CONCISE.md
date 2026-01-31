# Workflow v3.7 Standard (Concise)

## Hard Rules (Anti-Bypass)

### 1. Task Output Format
- **ChatGPT 输出任务块不得放在 Markdown 代码块内**。
- **必须直接以 `task_id:` 作为首个非空行输出**，否则 Tampermonkey 不会保存/分发任务。

### 2. Web Health Check Mandatory
- **凡修改 `arb-validate-web`**：必须执行自动健康检查。
  - 检查端点：`/` 与 `/pairs` 必须返回 200 OK。
  - **将检查结果写入 `RESULT_READY` / `deliverables_index`**。

### 3. Strict Status Control
- **RUN Failure is Final**: 
  - 任意 `RUN` 命令失败（含重试后）⇒ 任务必须 `FAILED`。
  - **禁止被 Manual Verification 覆盖成 DONE**。
- **No False Positives**:
  - `commands_executed` == 0 ⇒ `FAILED`.

### 4. Deliverables Index Integrity
- **Non-Empty**: `deliverables_index_<taskId>.json` 必须是非空 JSON。
- **No Placeholders**: 不允许 0 字节或 `SELF_REF` 占位。
- **Scope Strict**: 只允许引用“本 task 结果目录内”的文件。
- **Payload Consistency**: `RESULT_READY` 的 `INDEX` 字段必须包含 `deliverables_index` 的真实 size/sha。

### 5. Smart Agent Handover Markers
- **Noise Reduction**: 只有 `smart_agent_handover` 模式才检查 markers (`SMART_AGENT_HANDOVER_START` / `SMART_AGENT_RESULT_FOUND`).
- 普通 Script Task 不应检查 Marker，避免 Acceptance Check 噪音。

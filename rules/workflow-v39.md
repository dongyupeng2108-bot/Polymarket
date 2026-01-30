# Workflow v3.9 标准 (合并增补版)
> 目标：ChatGPT -> Task -> Trae -> Finalizer -> RESULT_READY -> 验收
> 原则：Fail-fast，Zip Off，Code Enforcement，Object Lock。

1. 沟通与决策门禁 (Decision Gates)
- **对象锁 (Object Lock)**: 同一轮沟通只能面向一个对象（老板或 Trae），严禁混发。
- **决策闸门**: 涉及业务口径/验收标准/模拟实盘一致性的变更，必须先获老板明确决策，方可发布任务。
- **ChatGPT 结构 (Task Mode Strict)**:
  - **允许前缀**: 仅 `task_id:` (必须是首个非空行)。
  - **里程碑标签**: `milestone:` 行需追加中文提醒标签（如 `P0.1 计划治理分支(...)`）。
  - **必备要素**: 含 `milestone: Mx` 和 `RUN:`，末行 sentinel。
- **分支策略 (Branch Strategy)**:
  - **One-to-One**: 里程碑分支标签与 GitHub 分支一一对应。
  - **Reuse**: 同一标签下多任务复用同一分支/PR，禁止随意新建分支。

2. 自动化执行 (Strict Parser & CI)
- **Gate Light (CI)**: 所有 PR 必须通过 `gate-light` 工作流检查 (含 actionlint, gitleaks, schema, conftest, dictionary-check)。
- **NoCode 仍需 RUN**: 即使是“证据补遗”任务，必须含 `RUN:` 块。可用 `CMD: echo "EVIDENCE_ONLY_NOOP"` 占位。
- **Fail-fast**: 任意命令非 0 退出 -> FAILED。

3. 产物与回传 (Finalizer & Gatekeeper)
- **Full Envelope**: `notify.txt` 必须包含 `RESULT_JSON`, `LOG_HEAD`, `LOG_TAIL`, `INDEX`。
- **Smart Agent**: 必须读取并输出 `notify.txt` 内容。
- **Status Gate (v3.9)**: `RESULT_JSON.status` 必须为 `DONE` 或 `FAILED`。禁止 `success`, `ok` 或 `GENERATED_BY_SCRIPT`。
- **Index Gate (v3.9)**: `INDEX` 必须包含每个文件的 `size` (bytes) 和 `sha256_short` (≥8 chars)。必须包含 `report_file` 等关键证据，且 size > 0。缺失或占位符则 FAIL。

4. 质量与证据门禁 (Quality Gates)
- **Gate_NO_EXTERNAL_EVIDENCE_WORDING (v3.9)**: notify/LOG_TAIL/正文中出现 `See run.log`, `See attached` 等外置证据措辞一律 FAIL。
- **反虚报 (Claim-Fix Gate)**: 声称“已修复”必须包含：复现步骤 + 关键证据摘录(≤30行) + 修复后对照(≤30行)。
- **网站健康 (Healthcheck Gate)**:
  - 必须验证 端口53121 / 页面 / API 存活。
  - **Summary Contract (v3.9)**: 必须在 `notify.txt` 正文中直接摘录 `/ -> 200` 和 `/pairs -> 200` 两行关键结果。

5. 错误控制与防御机制 (Error Defense)
- **重复返工 (Two-Strike)**: 同一根因连续 2 次返工 -> 暂停，通知老板协商文档。下一任务强制为 **RCA 纯诊断** (禁止修复)。
- **RCA DoD (三件套)**: 必须包含 1.复现步骤 2.冒烟枪证据(Smoking Gun) 3.排除法表(≥2备选)。
- **原子写入 (Atomic I/O)**: 关键文件 (Config/State/Evidence) 必须用 **Write Temp -> Rename**。
- **显式终态 (Explicit Termination)**: 循环/重试逻辑必须定义不可逆 `TERMINAL` 状态。

6. 智能体交付协议 (Agent Delivery Protocol)
- **主动回报 (Proactive Reporting)**: 任务结束时，必须主动生成并展示 `report_for_chatgpt.txt`。
- **禁止隐式结束**: 不得仅回复 "Done" 或 "已完成"，必须附带完整验证报告。

7. 开发规范：Observability First (硬规则)
- **Evidence Envelope (证据包)**: 任何涉及 arb-validate-web 的任务，必须产出标准化证据包。
- **文件清单**: 必须包含 `healthcheck_53121.txt` (含 `/` 与 `/pairs` 200 OK) + 至少一项业务证据。
- **Gate**: 缺证据包直接 FAIL，禁止验收通过。

### 1. Workflow v3.8.3 标准（精简版｜主线）

> 目标：**ChatGPT → Tampermonkey 落盘 → traeback strict 执行 → Handover/Finalizer 归档 → RESULT_READY 回传 → 验收/继续**
> 原则：可执行/可验收优先，**Fail-fast**，默认 **zip off（流程不再依赖 zip）**，**代码强制合规 (Code Enforcement)**，杜绝“软违反”。

---

## 0) v3.8.2 相对 v3.8.1 的增量（本次修正点）

- **Workflow Completion Guard (Manual Mode)**:
  - 针对 Manual Mode (`skipSend=true`) 环境，`finalize_task` 仅生成产物不发送。
  - **强制要求**：Smart Agent 在输出 notify 内容后，**必须**显式执行 `npx tsx bridge/sender.ts <notify_file>`。
  - **Checklist 强制**：所有任务必须包含 `Execute Sender` 验证项。

- **ChatGPT 沟通机制（三大门禁）**：
  - **门禁 A（输出模式锁定）**：
    - **Boss 模式**：以“老板”开头，**禁止**包含任何可执行任务块。
    - **Task 模式**：首个非空行必须是 `task_id:`。
      - **允许前缀**：仅 `task_id:`。
      - **禁用前缀**：`TraeTask`、`TraeTask_`（出现即判失败）。
      - **禁止**包含任何人类寒暄或标题。
    - **互斥**：一条消息只能是一种模式，禁止混合。
  - **门禁 B（任务结构硬门槛）**：
    - 必须包含 `milestone: Mx` 和 `RUN:`（带冒号）。
    - RUN 内命令必须以 `CMD:` 或 `-` 开头。
    - 最后一行必须是 `本次任务发布完毕。`。
    - 倒数第二行必须是 **硬自检行**（见下文）。
  - **门禁 C（结果回传防假）**：
    - 唯一回传入口：**RESULT_READY**（Full Envelope）。
    - 缺证据/缺健康检查/非 RESULT_READY -> **直接判 FAILED 并返工**，不补材料。

- **代码强制合规 (Gatekeeper)**：`bridge/sender.ts` 成为硬性门禁。它会**物理拦截**任何不符合 v3.8 格式的 `notify_*.txt`，强制要求完整信封（Full Envelope）。

---

## 1) 硬规则（必须遵守）

- **对老板**：消息以“老板”开头。
- **对 Trae/自动化任务**：首个非空行必须是 **`task_id: ...`**（strict 解析器要求）。
- 任务文本必须包含：**`milestone: Mx`、`RUN:`（带冒号）、RUN 内逐条 `CMD:` 或 `-`**。
- **NoCode/证据任务必须 RUN**：若任务无需代码改动（如 Evidence/Addendum/Manual），必须包含 `RUN:` 且至少包含一条无副作用命令（如 `CMD: echo "EVIDENCE_ONLY_NOOP"`），以满足 Zero-Run Guard 门禁。
- 任务文本最后一行必须是：**`本次任务发布完毕。`**
- **每条回复只发给一方**（老板 or Trae）——避免并发指令冲突。
- **默认 zip off**：流程、验收、索引一律不依赖 zip（如需 zip 仅作为可选附件，不得成为门槛）。
- **CheckList 强制项**：所有任务 CheckList 必须包含 `[ ] Execute Sender (Manual Mode Guard)` 检查项。

---

## 2) ChatGPT 输出“可执行任务文本”（给 Tampermonkey 捕捉）

- 任务块必须独立、连贯、无多余前导文本干扰解析
- 建议：task_id 行下可写 1 行描述（不影响 strict）
- 任何敏感信息仅用变量名/指纹校验，不入聊天/日志/Git
- **禁止**：不得使用 Markdown 代码框（```）包裹任务，否则 Tampermonkey 无法捕捉。

### 硬自检行（倒数第二行）
每次给 Trae 的任务倒数第二行必须是自检行，必须包含以下所有 PASS 标记：
`MODE=TASK FIRSTLINE=task_id NO_CODEBLOCK HAS_MILESTONE+RUN RUN_CMDS_OK END_SENTINEL_OK FAIL_FAST_OK`
> 只要其中任意一项为 FAIL，这条任务就视为未发布，必须回炉重写。

---

## 3) Tampermonkey 落盘

- 仅保存以 `task_id:` 开头且以 `本次任务发布完毕。` 结束的块
- 下载到：`E:\polymaket\Github\ChatGPT task\`
- 文件名：`task_id:..._YYMMDD_###.md`（日期+序号只出现一次）

---

## 4) traeback 接入与 strict 解析（执行侧）

- watcher/Trae 把最新 .md 放入：`E:\polymaket\Github\traeback\running\`（或约定入口）
- strict parser 失败即 FAILED（如：首行不是 task_id、缺 RUN、缺 sentinel）

---

## 5) Manager 执行 RUN（Fail-fast）

- RUN 内命令逐条执行，任一非 0 退出码默认 FAIL（除非明确 allowlist）
- 默认避免大循环：诊断/测试 ≤ 50 次迭代，并有超时/停止条件
- **Git 命令门槛**：**禁止**直接使用 `git status` 等命令作为 Fail 门槛，除非先验证 `.git` 目录存在。
  - 若无 `.git`，必须使用“文件列表比对脚本”生成变更证据。
  - 这是为了防止在无 Git 环境（如部分生产/测试容器）中误报失败。

---

## 6) 产物归档与回传（Finalizer / RESULT_READY）——防绕过核心

### 6.1 Finalizer 必备产物（硬门槛）
任务结果目录：`E:\polymaket\Github\traeback\results\<task_id>\`

必须存在并被 RESULT_READY 引用：
- `result_<task_id>.json`
- `run_<task_id>.log`（没有也要生成 placeholder）
- `notify_<task_id>.txt` (**必须是 Full Envelope 格式**)
- `deliverables_index_<task_id>.json`（允许 SELF_REF，但文件必须在本任务目录里）
- `LATEST.json`（本任务目录内 + 全局可选）

### 6.2 Full Envelope 格式规范 (v3.8 强制)
notify_<task_id>.txt 内容必须包含以下 4 个标记区块，**缺一不可**：
1.  `RESULT_JSON` (完整 JSON 内容)
2.  `LOG_HEAD` (日志前 50 行)
3.  `LOG_TAIL` (日志后 50 行)
4.  `INDEX` (交付物索引 JSON)

### 6.2.1 回报契约 v3.9+ (绑定校验)
- 必须包含 `report_file` 字段指向 `notify_<task_id>.txt`（权威回报文件）
- 必须包含 `report_sha256_short` 字段与 `report_file` 的 SHA256 前 8 位一致

> **Gatekeeper 拦截**：如果 `sender.ts` 检测到缺失上述任一标记，将拒绝发送并报错。

### 6.3 人工验证（允许但必须落证据）
当自动化自测脚本缺失/环境阻断导致无法自动验证时：
- 仍可把 `Manual Verification (Trae)` 记为 pass
- 但必须在任务结果目录生成：`manual_verification.json`，至少包含：
  - `checked_at`、`checker`（Trae/模型名）
  - `checks`（逐条：what + pass/fail + note）
  - `site_health`（见第 7 节）
- RESULT_READY 的 `acceptance_check` 必须包含 `Manual Verification (Trae)=true`

### 6.4 Smart Agent 最终回报动作（必须执行）
在 Trae 代理模式下，`finalize_task` 完成后，**必须执行以下动作**以闭环：
1. **读取产物**：使用 `Read` 工具读取生成的 `notify_<task_id>.txt`。
2. **显式输出**：将该文件内容（Full Envelope）**完整复制**到最终回复中，使用代码块包裹。
   - **禁止**仅返回文件路径或“任务已完成”的口头承诺。
   - **目的**：确保 ChatGPT 能通过用户看到任务结果。
3. **物理回传 (Manual Mode Guard)**：
   - 若环境配置为手动回传 (`skipSend=true`)，必须显式执行命令：`npx tsx bridge/sender.ts <notify_file>`。
   - **目的**：确保 Payload 被物理发送给 ChatGPT，完成闭环。仅在对话框输出是不够的。
4. **确认结束**：只有输出了 Full Envelope 内容 **且** `sender.ts` 执行成功（输出 Done），才视为 Trae 的任务回合结束。

---

## 7) 网站改动后的健康检查（硬要求）

适用范围：**arb-validate-web 任意代码/配置变更**（UI/API/脚本/依赖）完成后。

必须在同一任务内完成并写入 `manual_verification.json` 或自动化日志：
- **端口**：默认 53121
- **服务存活**：能访问站点根或 health API（HTTP 200）
- **关键页面可用**：Dashboard / Opportunities / Pairs 页面能打开（至少无白屏/致命错误）
- **关键接口可用**：与本次改动相关的 API（如 SSE /api/pairs/auto-match/stream）能连通并有事件输出

> 如果健康检查失败：任务必须标记 FAILED（即便代码已改完），避免“30% 概率异常”扩散到后续验收。

---

## 8) 常见失败与处理

- **Protocol Violation (FATAL)**: `sender.ts` 报错拒绝发送 -> 必须修复 Finalizer 逻辑，生成合规 Full Envelope。
- **假阳性 DONE（executed=0）**：必须 FAILED（强制修复 + 负例自测）
- **EVIDENCE_MISSING（缺 deliverables_index）**：必须 FAILED
- **非 RESULT_READY 回报**：视为软违反，要求补跑 Finalizer/补齐 RESULT_READY 后才算完成
- **端口冲突 EADDRINUSE**：统一用 53121，冲突先停旧进程
- **自测脚本不存在**：任务应先 `Test-Path` 检查；缺失要么补脚本，要么走“人工验证+落证据”路径

---

## 9) 业务侧门禁提醒（与套利项目开发相关）

任何会显著导致“模拟与真实不一致”的改动（成交判定/滑点深度/费用奖励/YESNO 成本/tradeable 或 netEV 阈值等）必须严格验收；老板需明确回复 **“验收通过”** 才能继续。

## 10. 争议解决与熔断机制 (Circuit Breaker)

- **重复返工（Two-Strike）**：同一根因连续 2 次导致返工（即发布 2 个任务仍未解决）→ 下一次执行前必须通知老板，协商是否更新三大文档条款以解决争议。

## 11. 变更日志 (Changelog)
- 2026-01-26 (v3.8.3): **新增 Two-Strike 熔断机制**。同一根因连续 2 次返工必须暂停协商。
- 2026-01-26 (v3.8.2): **新增 Manual Mode 物理回传强制要求**。Trae 必须显式执行 `sender.ts` 并在 Checklist 中确认。
- 2026-01-26 (v3.8.1): **修正 Smart Agent 回报动作**。明确要求 Trae 在 finalize 后必须显式读取并输出 `notify_<task_id>.txt` 内容到对话框。
- 2026-01-25 (v3.8): **引入 ChatGPT 沟通三大门禁**（输出模式锁定、任务结构硬门槛、结果回传防假）及 **Gatekeeper 机制**。`sender.ts` 强制校验 notify 文件信封完整性，物理拦截不合规回报。
- 2026-01-25 (v3.7.1): 新增人工验证落盘要求 (manual_verification.json)；新增网站改动健康检查要求；明确 Zip Off 默认策略。

## 11. 待定问题 (Open Questions)
- 暂无。

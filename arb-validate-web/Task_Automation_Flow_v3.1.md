# 任务自动执行流程规范 v3.1 (Technical Flow)

## 1. 核心机制 (Core Mechanism)
本流程旨在实现 **ChatGPT (Architect)** 与 **Trae+Gemini (Smart Agent)** 的无缝协作，通过 **Watcher** 实现任务的分发、监控、强制停靠 (Handover) 与结果闭环。

### 关键特性
- **Smart Handover (智能停靠)**: 遇到 `TYPE: SMART_AGENT` 或 `CMD: AGENT_SOLVE` 时，Watcher 自动暂停，弹窗请求人工/Gemini 介入。
- **Fail-Fast (快速失败)**: 传统脚本模式下，单条命令失败即终止任务。
- **Artifact Consistency (产物一致性)**: 所有产物文件名严格对应 `TASK_ID`。
- **Async Support (异步支持)**: Smart Agent 模式支持长达 **24小时** 的等待窗口。

## 2. 详细执行流程 (Execution Pipeline)

### Phase 1: 任务扫描与锁定 (Scan & Lock)
1.  **Input**: 监控 `ChatGPT task/` 目录。
2.  **Detect**: 发现 `TraeTask_*.txt` 或 `TraeTask_*.md`。
3.  **Lock**: 
    - 移动到 `traeback/inbox/` (防止并发)。
    - 移动到 `traeback/running/` (开始执行)。
    - **Checkpoint**: 在 `results/<TASK_ID>/` 创建 `checkpoint.json`，状态标记为 `LOCKED`。

### Phase 2: 解析与模式路由 (Parse & Route)
读取任务文件内容，执行 `parseTask()`：
- **提取 TASK_ID**: 从 `TASK_ID:` 字段提取。
- **提取 RUN 指令**: 仅解析 `RUN:` 到 `本次任务发布完毕。` 之间的 `CMD:` 或 `-` 行。
- **模式判定**:
    - 若包含 `TYPE: SMART_AGENT` 或 `CMD: AGENT_SOLVE` -> **Smart Agent Mode**。
    - 否则 -> **Script Mode**。

### Phase 3: 执行 (Execution)

#### 分支 A: Smart Agent Mode (v3.1 新增)
1.  **Pause**: Watcher 暂停脚本执行。
2.  **Alert**: 弹出系统弹窗 "Trae Smart Agent Task Waiting for manual execution!"。
3.  **Log**: 写入 `run_<TASK_ID>.log` -> `SMART_AGENT_HANDOVER_START`.
4.  **Wait**: 进入轮询循环 (Polling)，每 5 秒检查 `results/<TASK_ID>/result_<TASK_ID>.json` 是否存在。
    - **Timeout**: 最长等待 **24小时**。超时则标记 FAILED。
5.  **Resume**: 检测到 `result.json` 后，自动进入 Phase 4。

#### 分支 B: Script Mode (传统模式)
1.  **Execute**: 逐条执行 `runCmds` 中的命令。
2.  **Monitor**:
    - **Retry**: 单条命令失败重试 3 次。
    - **Heartbeat**: 单条命令无输出超过 20 分钟 -> Kill & Retry。
3.  **Result**: 全部成功则 SUCCESS，任一失败则 FAILED。

### Phase 4: 产物生成 (Artifact Generation)
无论成功或失败，必须生成以下“五件套”：
1.  `result_<TASK_ID>.json`: 包含 status, timestamps, metrics。
2.  `run_<TASK_ID>.log`: 执行日志 (Script模式为终端输出; Smart模式为Handover日志+Gemini手动日志)。
3.  `notify_<TASK_ID>.txt`: 简要通知 (4行)。
4.  `deliverables_index_<TASK_ID>.json`: 文件清单与 SHA256 (前8位)。
5.  `bundle_<TASK_ID>.zip`: 包含上述所有文件 + 原始任务文件。

**更新 LATEST**: 更新 `results/LATEST.json` 指向当前任务。

### Phase 5: 结果回传 (Notify)
1.  **Construct Payload**: 读取 Log (Head 60/Tail 200) + Result JSON + Index。
2.  **Send**: 调用 `sender.ts` 发送给 ChatGPT。
    - **Retry**: 失败重试 3 次 (间隔 2 分钟)。
    - **Fallback**: 若彻底发送失败，弹出 "MANUAL INTERVENTION REQUIRED" 弹窗。

### Phase 6: 归档 (Archive)
- **Success**: 移动任务文件到 `traeback/done/`。
- **Failure**: 移动任务文件到 `traeback/failed/`。

## 3. 目录结构规范 (Directory Structure)

```text
E:\polymaket\Github\
├── ChatGPT task\              # [Input] ChatGPT 放入任务
└── traeback\
    ├── inbox\                 # [Temp] 临时中转
    ├── running\               # [Active] 正在执行
    ├── done\                  # [Archive] 成功归档
    ├── failed\                # [Archive] 失败归档
    └── results\               # [Output] 产物仓库
        ├── LATEST.json
        └── <TASK_ID>\         # 单个任务的产物目录
            ├── checkpoint.json
            ├── result_<TASK_ID>.json
            ├── run_<TASK_ID>.log
            ├── notify_<TASK_ID>.txt
            ├── deliverables_index_<TASK_ID>.json
            ├── bundle_<TASK_ID>.zip
            └── TraeTask_*.md
```

## 4. 版本记录
- **v3.1 (Current)**: 增加 Smart Agent Handover，超时延长至 24h。
- **v3.0**: 引入 Checkpoint, Strict Parsing, Artifact Consistency。
- **v2.0**: 基础自动化流程。

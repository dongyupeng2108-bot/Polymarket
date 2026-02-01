# 任务自动执行流程规范 v3.2 (Technical Flow)

## 1. 核心机制 (Core Mechanism)
本流程旨在实现 **ChatGPT (Architect)** 与 **Trae+Gemini (Smart Agent)** 的无缝协作，通过 **Watcher** 实现任务的分发、监控、强制停靠 (Handover) 与结果闭环。

### 关键特性
- **Smart Handover (智能停靠)**: 遇到 `TYPE: SMART_AGENT` 或 `CMD: AGENT_SOLVE` 时，Watcher 自动暂停，弹窗请求人工/Gemini 介入。
- **Agent Finalizer (智能收尾)**: Smart Agent 任务完成后，Gemini 调用 `finalize_task.mjs` 一键生成合规产物，避免人工打包错误。
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

#### 分支 A: Smart Agent Mode (v3.2 升级)
1.  **Pause**: Watcher 暂停脚本执行。
2.  **Alert**: 弹出系统弹窗 "Trae Smart Agent Task Waiting for manual execution!"。
3.  **Log**: 写入 `run_<TASK_ID>.log` -> `SMART_AGENT_HANDOVER_START`.
4.  **Execute**: Gemini 接手任务，进行思考与编码。
5.  **Finalize**: Gemini 开发验证完成后，调用 **Agent Finalizer** 工具：
    ```bash
    node scripts/finalize_task.mjs --task_id <ID> --task_dir <DIR> --status DONE --summary "Implemented X"
    ```
6.  **Wait**: Watcher 轮询发现 `results/<TASK_ID>/result_<TASK_ID>.json` 已存在。
    - **Timeout**: 最长等待 **24小时**。超时则标记 FAILED。
7.  **Resume**: 检测到 `result.json` 后，Watcher 识别其为 Finalizer 生成的有效产物，**跳过** Phase 4 的自动生成步骤，直接进入 Phase 5。

#### 分支 B: Script Mode (传统模式)
1.  **Execute**: 逐条执行 `runCmds` 中的命令。
2.  **Monitor**:
    - **Retry**: 单条命令失败重试 3 次。
    - **Heartbeat**: 单条命令无输出超过 20 分钟 -> Kill & Retry。
3.  **Result**: 全部成功则 SUCCESS，任一失败则 FAILED。

### Phase 4: 产物生成 (Artifact Generation)
**注意**: Smart Agent 模式下若已由 Finalizer 生成产物，则跳过此步骤。
否则（Script 模式或 Finalizer 未执行），必须生成以下“五件套”：
1.  `result_<TASK_ID>.json`: 包含 status, timestamps, metrics。
2.  `run_<TASK_ID>.log`: 执行日志 (Script模式为终端输出)。
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

## 3. 智能代理收尾工具 (Agent Finalizer)

### 3.1 目的
解决 Gemini 手动执行任务后，产物打包格式不规范、缺少 Index、Zip 损坏等问题。通过标准化工具一键生成 v2.0 规范产物。

### 3.2 接口定义
**脚本路径**: `E:\polymaket\Github\traeback\scripts\finalize_task.mjs`

**CLI 参数**:
- `--task_id <ID>`: 任务 ID (必填)
- `--task_dir <DIR>`: 任务结果目录 (必填，通常为 `.../results/<TASK_ID>`)
- `--status <DONE|FAILED>`: 任务状态 (必填)
- `--summary "<text>"`: 任务总结 (可选)
- `--extra "<file1;file2>"`: 额外需要打包的文件路径 (可选，分号分隔)
- `--selftest`: 运行自测模式 (可选)

### 3.3 行为规范
1.  **补全产物**: 自动生成缺失的 result.json, notify.txt, deliverables_index.json。
2.  **打包 Bundle**: 调用 PowerShell `Compress-Archive` 生成 zip。
3.  **更新 LATEST**: 更新全局 `LATEST.json`。
4.  **Fail-Fast**: 参数缺失或目录不存在直接报错退出。

## 4. 目录结构规范 (Directory Structure)

```text
E:\polymaket\Github\
├── ChatGPT task\              # [Input] ChatGPT 放入任务
└── traeback\
    ├── scripts\               # [Tools] 工具脚本 (v3.2 新增)
    │   └── finalize_task.mjs
    ├── inbox\                 # [Temp] 临时中转
    ├── running\               # [Active] 正在执行
    ├── done\                  # [Archive] 成功归档
    ├── failed\                # [Archive] 失败归档
    └── results\               # [Output] 产物仓库
        ├── LATEST.json
        └── <TASK_ID>\         # 单个任务的产物目录
```

## 5. 版本记录
- **v3.2 (Current)**: 新增 Agent Finalizer 工具及相关流程。
- **v3.1**: 增加 Smart Agent Handover，超时延长至 24h。
- **v3.0**: 引入 Checkpoint, Strict Parsing, Artifact Consistency。
- **v2.0**: 基础自动化流程。

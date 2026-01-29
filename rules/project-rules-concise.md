# Arb Validate Web - 项目规则总纲 (极简版)

> 进度控制: Plan（计划）是里程碑与分支台账的唯一事实源 (Single Source of Truth)。
> **更新频率**: 仅当老板在新聊天窗口明确要求时更新 Plan (PROJECT_MASTER_PLAN.md)。

## 1. 核心定义 (口径统一)
- Pair (交易对): 
  - VERIFIED: 静态资格，允许被扫描。verified_at > 7天 强制重置为 UNVERIFIED。
  - UNVERIFIED: 默认状态，不可扫描/交易。
- Opportunity (机会): Pair 在某次扫描 (ScanRun) 中的结果。仅对 VERIFIED Pair 产出。
- Tradeable (可交易): 动态属性 (时机)，需满足盘口/max_size/风控。

## 2. 失败原因代码 (Reason Code)
- 验证失败 (Pair): MAPPING_INVALID, MARKET_NOT_FOUND, NO_DATA_PERMISSION.
- 扫描过滤 (Opp): EDGE_LOW, NO_BOOK, STALE_SNAPSHOT, SIZE_LOW, RISK_REJECTED.

## 3. 技术栈
- Core: Node.js (tsx), Next.js 16 (App), React 19, Tailwind v4, PostgreSQL (Prisma).
- Automation: Playwright, Bridge (task_manager + sender).
- Script: 全异步 I/O，必须有顶层 try/catch，错误退出码 1。

## 4. 开发红线
- 数据层: 严格使用 Prisma 类型，禁止原生 SQL。
- 变更原则: 新增/修改状态词，必须先更新本 Rules。
- AI 协议: 复杂任务必须遵循：意图确认 -> 分析策略 -> 执行计划。
- 模式锁定: "老板"开头(无任务) XOR `task_id:`开头(纯任务)。
  - **Task 模式硬规则**: 仅允许 `task_id:` 前缀。**严禁**使用 `TraeTask`/`TraeTask_` (出现即判失败)。

## 5. 开发哲学 (5S & 6A)
### 5S (代码卫生)
- **Sort (整理)**: 及时清理无用代码/注释 (Dead Code)。
- **Set in order (整顿)**: 保持目录结构清晰，就近原则 (Co-location)。
- **Shine (清扫)**: 提交前确保无 Lint 错误，格式化代码。
- **Standardize (清洁)**: 严格遵守命名规范和架构模式。
- **Sustain (素养)**: 坚持 Fail-fast 和 Full Envelope 纪律。
- **Tooling (工具)**: 优先使用 IDE 原生工具 (Read/Write)；Shell 命令需兼容 PowerShell 并清理临时文件。

### 6A (执行标准)
- **Alignment (对齐)**: 深刻理解 Master Plan 和用户意图 (Intent)。
- **Analysis (分析)**: 动手前先搜索上下文，拒绝臆测 (No Hallucination)。
- **Architecture (架构)**: 优先复用现有模式，不随意造轮子 (Reusability)。
- **Action (执行)**: 原子化修改，一步一测 (Step-by-step)。
- **Audit (审查)**: 自我校验输出，确保通过自测 (Verification)。
- **Adaptation (适应)**: 遇到错误主动更新 Memory 和 Rules (Feedback)。

## 6. Observability First (可观测性优先)
- **Evidence Envelope**:
  - **Required Fields**: `request_id`, `ts`, `status`, `stage`, `summary`, `debug_schema_version`.
  - **Gate Policy**: 缺证据 = 0分 (FAILED)。
  - **Contract (v3.9)**: Status=DONE/FAILED; Index=size+hash; Notify=Healthcheck Summary(/ & /pairs 200).
- **Port Standard**: arb-validate-web 必须使用端口 `53121`。
- **Report Binding (v3.9)**: report_file in JSON must match INDEX & actual file SHA (8-char hex).

# Arb Validate Web - 项目规则总纲 (极简版)

> 进度控制: 开发前务必阅读 [PROJECT_MASTER_PLAN.md](PROJECT_MASTER_PLAN.md) 获取当前里程碑。

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
- Core: Node.js v24 (LTS), Next.js 16 (App), React 19, Tailwind v3 (STRICT v3; v4 PROHIBITED), PostgreSQL (Prisma).
- Automation: Playwright, Bridge (task_manager + sender).
- Script: 全异步 I/O，必须有顶层 try/catch，错误退出码 1。

## 4. 开发红线
- 数据层: 严格使用 Prisma 类型，禁止原生 SQL。
- 变更原则: 新增/修改状态词，必须先更新本 Rules。
- AI 协议: 复杂任务必须遵循：意图确认 -> 分析策略 -> 执行计划。
- 模式锁定: "老板"开头(无任务) XOR `task_id:`开头(纯任务)。
  - **Task 模式硬规则**: 仅允许 `task_id:` 前缀。**严禁**使用 `TraeTask`/`TraeTask_` (出现即判失败)。
- **交互安全**: 遇到 `(y/N)` 必须 Fail-Fast；DB 迁移禁止自动化弹窗 (需 Pre-flight Check + Non-interactive Exec)。

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

## 7. Trae/Windows Environment Tips
- **Curl Alias Trap**: In Trae PowerShell, `curl` is aliased to `Invoke-WebRequest`.
  - **Problem**: Running `curl -I ...` without `-Uri` causes it to hang waiting for input.
  - **Fix**: ALWAYS use `curl.exe` explicitly, or use the provided script: `scripts/healthcheck_53121.ps1`.
  - **Do not chain**: Avoid `;` chaining for curl commands in the terminal; run them on separate lines.

- **Tailwind v4 Crash**: On Windows + Next.js 16, Tailwind v4 (CSS-first) fails to scan paths correctly (3.6KB CSS) and throws PostCSS errors.
  - **Rule**: MUST use Tailwind v3.4+ with `tailwind.config.js` and `postcss.config.js`. DO NOT UPGRADE to v4.

## 8. UI & Reporting Protocol
- **UI Localization**: 所有用户可见文案必须使用 **中文 (zh-CN)**。
  - 实现: 必须通过 `src/lib/i18n/zh.ts` 集中管理，禁止硬编码英文。
  - 术语: 可保留英文术语但需括号标注，例: "模拟交易 (Paper Trading)"。
- **Task Reporting (任务回报)**:
  - **必做**: 每次任务结束必须生成回报文件并更新索引。
  - **Path**: `rules/task-reports/YYYY-MM/TraeTask_*.md`
  - **Index**: `rules/TASK_REPORTS_INDEX.md`
  - **Report Header (Strict Format)**: 必须且仅输出以下 4 行作为回报头部 (5行起放其他详情)：
    ```text
    PR: <url 或 N/A>
    HEAD: <short sha>
    gate-light: PASS|FAIL (check=<真实check名>)
    healthcheck: / <code>, /pairs <code> (或 N/A)
    ```
  - **Fail-Fast**: 若 `gate-light=FAIL` 或 `healthcheck` 非 200，**严禁标记 DONE**。必须自动修复直到通过后，才输出最终回报。

## 9. GatePack (M2.4) - 门禁体系
> **任何 Blocker 出现 => 任务 FAILED，禁止交付。**

### 9.1 拦截级错误清单 (Blocker List)
1. **站点健康**: `/` 或 `/pairs` 返回非 200。
2. **环境**: 端口非 53121，或 Dev Server 启动失败。
3. **运行时**: 控制台出现红屏 (Next.js Overlay)、UnhandledRejection、Error Boundary。
4. **关键 API**: 扫描触发、添加交易对 (POST)、删除交易对 (DELETE) 返回非 2xx。
5. **冒烟测试**: `scripts/acceptance_smoke.ps1` 任意断言失败 (Exit Code != 0)。
6. **数据一致性**: 数据库迁移失败，或 "模拟 vs 实盘" 出现未批准的口径变更。

### 9.2 门禁执行顺序 (Pipeline)
所有交付前必须按序执行：
1. **Git Check**: `git status` 必须干净 (或明确记录未提交原因)。
2. **Env Reset**: 运行 `scripts/dev_start.ps1` (清端口/缓存/启动)。
3. **Healthcheck**: 运行 `scripts/healthcheck_53121.ps1` (必须 PASS)。
4. **Smoke Test**: 运行 `scripts/acceptance_smoke.ps1` (必须 ALL PASS)。
5. **Report**: 生成任务回报并落盘。

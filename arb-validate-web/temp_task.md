task_id: M0_Flow_v3_4_RemoveZip_FromPipeline_260125_003
milestone: M0
title: TraeTask_M0_RemoveZip_FromPipeline_v3_4
TYPE: SMART_AGENT

GOAL:
彻底从 traeback 流程中移除 zip 产物与 zip 解析依赖，消灭“生成困难/解析困难/元数据漂移（声明有但实际无）”：

任何情况下（含 --zip on/off）都不再生成任何 zip 文件（finalizer/handover/manager 归档层全部禁用）。

result_json / deliverables_index / LATEST / notify / run log 中不再声明 bundle_zip 或任何 zip 文件条目（永远不列出）。

为向后兼容：保留 CLI 参数 --zip（on/off）但改为被忽略；日志明确提示 Zip disabled；result_json 记录 zip_disabled/zip_requested/zip_generated=false。

SCOPE:
A) 禁用 zip 生成（保持 v3.4 CLI 兼容，不改 strict 解析器/沟通协议/触发器）

Finalizer：scripts/finalize_task_v3.4.mjs

删除/禁用 zip 生成逻辑：无论 --zip on/off 都不生成。

若传入 --zip <value>：

打印：[Finalizer] Zip disabled (deprecated). Ignoring --zip <value>.

result_<taskId>.json 新增字段（不破坏旧字段）：

zip_disabled: true

zip_requested: "on"|"off"|"unset"

zip_generated: false

artifacts 中不得出现 bundle_zip 字段（直接删除，不要空字符串）。

deliverables_index 不得列出 zip；若目录残留旧 zip，可清理删除或忽略，但不得列出。

Handover：scripts/smart_agent_handover.mjs

移除任何 zip 相关分支/依赖（等待/打包/marker 逻辑里不能再依赖 zip）。

若仍接受 --zip 参数：同样打印 Zip disabled 提示，但不影响流程。

Manager/归档层（如果 bundle_<taskId>.zip 是在 Manager 侧生成/声明的）

定位并移除“自动 bundle zip”步骤：不再生成 bundle_*.zip。

修复外层 result_json.artifacts 的 bundle_zip 默认写入：禁止再写入 bundle_zip。

确保 index/清单逻辑：只列出真实存在文件；本任务目标是 zip 永远不存在。

B) 新增 selftest（覆盖旧调用方仍传 --zip on 的兼容）
新增脚本：scripts/selftest_nozip_pipeline_v3.4.mjs
要求：

清晰 PASS/FAIL + 关键计数；失败 process.exit(1)

fail-fast：全程不允许超过 10 秒无输出；若等待必须有 ≤10 秒超时并退出；建议每 1-2 秒心跳

Case 1（Finalizer 直接调用，传 --zip on）：

taskId=SelfTest_NoZip_Finalizer_On_<ts>

创建 results/<taskId>/ 下：

agent_done.json（可空 json）

evidence.log（任意少量行即可）

调用：
node scripts/finalize_task_v3.4.mjs --task_id <id> --task_dir E:\polymaket\Github\traeback\results<id> --zip on --status DONE --summary "selftest"

断言并打印计数：

目录中不存在 *.zip（glob）

result_<id>.json：zip_disabled=true, zip_requested="on", zip_generated=false

result_json.artifacts 不包含 bundle_zip

deliverables_index 不包含任何 zip 条目

Case 2（Handover 调用，传 --zip on）：

taskId=SelfTest_NoZip_Handover_On_<ts>

走 handover 流（模拟 agent_done.json 写入），传 --zip on

断言同 Case 1（不存在 zip + 元数据不列出）

Case 3（兼容 --zip off）：

重复 Case 1 但 --zip off

断言 zip_requested="off" 且仍无 zip、无 bundle_zip

ACCEPTANCE:

node .\scripts\selftest_nozip_pipeline_v3.4.mjs 一次性稳定 PASS（不依赖重试，不出现 MODULE_NOT_FOUND）。

任意真实极短任务（echo/1 条命令）完成后：

results/<taskId>/ 下无任何 zip 文件

result_json.artifacts / deliverables_index / LATEST 不包含 zip 相关字段或条目

旧调用方即便传 --zip on/off，流程不失败，只打印 Zip disabled 提示，并正确写 zip_disabled/zip_requested/zip_generated=false

RUN:
CMD: powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; cd 'E:\polymaket\Github\traeback'; node .\scripts\selftest_nozip_pipeline_v3.4.mjs"

NOTES:

不改：strict 解析器规则 / Tampermonkey 触发条件 / 沟通协议。

仅移除 zip：生成、列出、依赖、解析全部拿掉；参数保留但忽略以兼容旧调用方。

如发现历史残留 zip 影响 index，一并清理并确保不再生成。

本次任务发布完毕。

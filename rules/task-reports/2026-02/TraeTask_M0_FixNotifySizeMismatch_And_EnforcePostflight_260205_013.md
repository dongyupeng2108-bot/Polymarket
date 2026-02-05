# TraeTask_M0_FixNotifySizeMismatch_And_EnforcePostflight_260205_013

## 1. 任务目标
修复 `260205_012` 的 `notify` 空文件/索引不一致问题，并加固 `postflight_validate_envelope.mjs` 校验器，确保未来此类缺陷直接 FAIL。

## 2. 修复执行 (012 Notify & Index)
- **问题现状**: 
  - `notify_260205_012.txt`: 真实文件 size > 0 (1848 bytes)，但内部 INDEX 标记为 size=0。
  - `deliverables_index_260205_012.json`: 索引中 notify 条目 size=0。
- **修复动作**:
  - 使用 `repair_notify_index.mjs` 脚本进行收敛修复。
  - **修复后结果**:
    - `notify_260205_012.txt`: Size = 1851 bytes.
    - `deliverables_index_260205_012.json`: Size = 1851 bytes.
    - 状态: **一致 (Consistent)**.

## 3. 校验器加固 (Postflight Hardening)
对 `scripts/postflight_validate_envelope.mjs` 进行了以下加固：
1.  **Notify 实体检查**: 增加 `POSTFLIGHT_NOTIFY_EMPTY_OR_MISSING` 错误码，若 notify 文件不存在或 size=0 直接 FAIL。
2.  **索引一致性检查**: 增加 `POSTFLIGHT_NOTIFY_ZERO_IN_INDEX` 和 `POSTFLIGHT_NOTIFY_SIZE_MISMATCH` 错误码。
    - 必须检查 INDEX 中 notify 条目的 size 是否 > 0。
    - 必须检查 INDEX 中 notify 条目的 size 是否等于真实文件 size。

## 4. 回归验证
- `260205_010`: **PASS**
- `260205_011`: **PASS**
- `260205_012`: **PASS** (修复后)

## 5. 健康检查
```text
/ -> 200 OK
/pairs -> 200 OK
```

## 6. 结论
任务完成。012 证据包已修复，校验器已具备拦截 notify 空包或索引欺骗的能力。

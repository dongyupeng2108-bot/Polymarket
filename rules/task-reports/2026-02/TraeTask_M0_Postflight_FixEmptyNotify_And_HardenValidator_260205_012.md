# TraeTask_M0_Postflight_FixEmptyNotify_And_HardenValidator_260205_012

## Task Goal
Fix the vulnerability where empty notify files could pass postflight, and remediate tasks 010/011.

## Fixes Implemented
1. **Notify Files Repaired**:
   - `notify_260205_010.txt`: Restored content, size > 0.
   - `notify_260205_011.txt`: Restored content, size > 0.
   - Added specific healthcheck lines to notify files.
   - Updated `deliverables_index` for both tasks with REAL SHA256 and size.

2. **Postflight Hardening**:
   - Modified `scripts/postflight_validate_envelope.mjs`.
   - **New Fail Conditions**:
     - Notify file empty or missing.
     - Notify index entry size = 0.
     - Notify index entry sha256_short = 'SELF_REF'.
   - Added error code `POSTFLIGHT_NOTIFY_EMPTY_OR_SELFREF`.

3. **Index Formatting**:
   - Fixed `rules/TASK_REPORTS_INDEX.md` table alignment.

## Verification
- **Healthcheck**:
  ```
  / -> 200
  /pairs -> 200
  ```
- **Postflight Re-run**:
  - 260205_010: PASS
  - 260205_011: PASS

## Artifacts
- `scripts/postflight_validate_envelope.mjs` (Hardened)
- `rules/task-reports/2026-02/notify_260205_010.txt` (Fixed)
- `rules/task-reports/2026-02/notify_260205_011.txt` (Fixed)

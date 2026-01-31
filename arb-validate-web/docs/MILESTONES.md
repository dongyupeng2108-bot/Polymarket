
# Project Milestones (MVP)

## M1: Observable Network Layer (Current Focus)
**Goal**: Ensure the system can reliably connect to Kalshi/Polymarket and diagnose failures accurately.
- [x] Proxy Selector logic (Rotation, Cooldown, Fallback).
- [x] `/api/debug/proxy/ping` returns structured JSON with health status.
- [x] `/api/debug/kh/ping` returns structured JSON with DNS/TCP/TLS/HTTP diagnostics.
- [x] Settings UI reflects REAL health (Ping status, Latency, Reason Code), not just "pair count".
- **Acceptance Criteria**: `node scripts/smoke.mjs` passes and generates valid `docs/smoke_report.json` showing specific error codes (e.g., `proxy_refused`, `timeout`) instead of generic errors.

## M2: Pair Normalization & Data Integrity
**Goal**: Ensure every tracked pair is valid, clickable, and traceable.
- [ ] DB Schema enforces `pm_market_id` (Gamma ID), `pm_yes_token_id`, `kh_ticker` (Canonical).
- [ ] Backend generates canonical `pm_open_url` and `kh_open_url` on save.
- [ ] UI Lists/Cards use DB-stored URLs (no frontend string concatenation).
- [ ] Debug endpoint `/api/debug/pair/:id/resolve` validates IDs against live APIs.
- **Acceptance Criteria**: Clicking "Open PM" / "Open KH" in UI always lands on the correct market page (not 404).

## M3: Scanner Stability & Logging
**Goal**: The background scanner runs reliably and logs actionable error data.
- [ ] `ScanRun` and `Evaluation` tables store detailed error info (`kh_http_status`, `kh_error_code`, `kh_proxy_used`).
- [ ] Scanner handles specific errors (429, 5xx, timeouts) with appropriate backoff/skip logic (not crashing).
- [ ] `reason_code` in Evaluation is specific (e.g., `no_orderbook_kh`, `depth_insufficient_pm`).
- **Acceptance Criteria**: Leaving scanner running for 1 hour produces consistent logs; no unhandled promise rejections in console.

## M4: Opportunity Logic Verification
**Goal**: Arbitrage calculation is mathematically correct and filterable.
- [ ] VWAP calculation covers full `qty_default`.
- [ ] Fees and slippage are correctly deducted from `edge_pct`.
- [ ] `TopN` opportunities endpoint works correctly.
- [ ] System can explain "0 opportunities" (e.g., "All edges negative", "Depth insufficient").
- **Acceptance Criteria**: Manual verification of a Snapshot matches the System's calculated `edge_pct`.

## M5: Export & Retrospective
**Goal**: Enable data analysis outside the system.
- [ ] Export Evaluations/Opportunities to CSV/JSON.
- [ ] Aggregate stats per Pair (Win Rate, Avg Edge, Fail Rate).
- [ ] Final "Project Report" generation script.
- **Acceptance Criteria**: Owner can download a CSV and open it in Excel/Python for analysis.

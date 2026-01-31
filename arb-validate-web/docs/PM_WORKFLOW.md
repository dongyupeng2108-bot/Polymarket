
# PM Workflow & Collaboration Charter

## 1. Roles & Responsibilities
- **Owner (User)**: Defines high-level goals, approves critical trade-offs, and provides final sign-off.
- **PM (ChatGPT)**: Breaks down goals into specific Milestones (M1-M5), defines Acceptance Criteria (AC), and manages the backlog. Prevents scope creep.
- **Dev (Trae + Gemini3)**: Implements features, fixes bugs, and runs automated verification. Must provide evidence (JSON) for every task completion.

## 2. Workflow Rhythm
1. **Milestone Assignment**: Each iteration focuses on ONE specific Milestone (M1-M5). Do not jump between milestones arbitrarily.
2. **Implementation & Fix Limit**: 
   - Dev has max **2 repair attempts** per sub-task within a milestone.
   - If a feature is still broken after 2 attempts, Dev must propose a "Trade-off" (Cut scope / Downgrade feature / Postpone) to PM/Owner.
   - **No infinite loops**.
3. **Delivery Standard**:
   - Code must build (`npm run build`).
   - Automated Smoke Test must run (`node scripts/smoke.mjs`).
   - Evidence Package (JSON from smoke test) must be included in `docs/trae_sync.md`.

## 3. Freeze Rules
- **Verified Modules are Frozen**: Once a Milestone is marked "Done", its core logic is frozen. 
- **No Refactoring** without explicit Owner request or critical regression failure.
- **UI Tweaks**: Minor UI changes (colors, text) are low priority and should not block Milestone completion.

## 4. MVP Definition of Done
The project (Arb-Validate Web MVP) is considered COMPLETE when:
- **M1 (Network)**: Proxy/Env/Kalshi connectivity is observable and diagnosable (JSON evidence).
- **M2 (Data Integrity)**: Pairs have canonical IDs and clickable URLs that work.
- **M3 (Scan Stability)**: Scanner runs without crashing; errors are logged with specific codes (not generic "fail").
- **M4 (Logic)**: Opportunity detection logic is verifiable (edge calc is correct based on snapshot).
- **M5 (Export)**: Data can be exported for analysis.

## 5. Exit Criteria
- When M1-M5 are Done, the project enters "Maintenance Mode".
- Dev stops proactive refactoring.
- Dev waits for new Feature Requests from Owner.

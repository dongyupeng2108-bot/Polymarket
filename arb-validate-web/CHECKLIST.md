
# Deployment Checklist

## Self-Verification
- [ ] **/settings** page loads without errors (Status 200).
- [ ] **Pairs Management**:
    - [ ] Edit button is clickable for every pair.
    - [ ] Edit Dialog opens.
    - [ ] Can change Status and Save.
    - [ ] Can Delete pair (with confirmation).
- [ ] **Evaluation Log / Opportunities**:
    - [ ] "Open PM" link is visible (if slug exists) or disabled with tooltip.
    - [ ] "Open PM" link opens valid `polymarket.com` URL.
    - [ ] "Open KH" link is visible (if ticker exists) or disabled with tooltip.
    - [ ] "Open KH" link opens valid `kalshi.com` URL (no 404).
- [ ] **Data Integrity**:
    - [ ] Refreshing page retains data.
    - [ ] Status changes reflect immediately.

## Automated Tests
Run `npx playwright test` (requires setup) or `npm run test:smoke` (if configured).

## Smoke Test Script (Manual Fallback)
1. Open http://localhost:3000/opportunities
2. Click any "Open KH" link. Verify it is NOT 404.
3. Open http://localhost:3000/pairs
4. Click "Edit" on first pair.
5. Change Note -> Save. Verify update.

# Arb Validate Web

**项目根目录固定为**: `E:\polymaket\program\arb-validate-web`

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   Copy `.env.example` to `.env` and fill in:
   ```bash
   cp .env.example .env
   ```
   **Port Configuration**: The project runs on port **53121** by default.
   Ensure `APP_BASE_URL` or `NEXT_PUBLIC_BASE_URL` is set if running on a custom port/domain.

3. **Run Development Server**
   ```bash
   npm run dev
   # Runs on http://localhost:53121
   ```

4. **Network Self-Check**
   If you encounter WebSocket timeouts or connection issues:
   ```bash
   npx tsx src/scripts/check_network.ts
   ```

5. **Run Shadow Validation**
   ```bash
   npx tsx src/scripts/shadow_validate.ts
   ```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:53121](http://localhost:53121) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Configuration

### Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (Supabase Transaction Mode).
- `DIRECT_URL`: PostgreSQL connection string (Session Mode) for migrations.
- `KALSHI_API_URL`: (Optional) Custom Kalshi API endpoint.
- `POLYMARKET_API_URL`: (Optional) Custom Polymarket CLOB API endpoint.

### Opportunity Thresholds (Dev/Prod)

The system supports a two-tier threshold configuration to separate development (debugging) from production (actual opportunities).

- **`OPP_MODE`**: `dev` | `prod` (default: `prod`)
- **`OPP_EDGE_THRESHOLD`**: Minimum edge % for PRODUCTION (default: `0.01` i.e., 1%). **Must be > 0 in prod mode, otherwise it will fallback to 0.01.**
- **`OPP_EDGE_THRESHOLD_DEV`**: Minimum edge % for DEVELOPMENT (default: `-1` to show all negative spreads).

**Recommended Defaults:**

- **Production**:
  ```env
  OPP_MODE=prod
  OPP_EDGE_THRESHOLD=0.01
  ```
  *Result*: Only opportunities with >1% edge are shown/stored.

- **Development**:
  ```env
  OPP_MODE=dev
  OPP_EDGE_THRESHOLD_DEV=-1
  ```
  *Result*: All pairs, even with negative edge (down to -100%), are processed for debugging.

You can verify the current configuration at `/api/config`.

### Simulation Settings (M1)

For simulated PnL calculation without real execution:

- `SIM_NOTIONAL`: Notional size in USD for simulation (default: 100).
- `SIM_FEE_RATE_PM`: Polymarket fee rate (e.g., 0 for limit orders, or 0.01 for taker).
- `SIM_FEE_RATE_KH`: Kalshi fee rate.
- `SIM_SLIPPAGE_BPS`: Assumed slippage in basis points (default: 10).
- `SIM_LATENCY_PENALTY_BPS_PER_100MS`: Penalty in basis points per 100ms of latency (default: 1).

## Scripts

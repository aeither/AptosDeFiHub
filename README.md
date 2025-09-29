# AptosDeFiHub

## Description

AptosDeFiHub is a Telegram bot for automated DeFi portfolio management on Aptos, offering liquidity tracking, auto-rebalancing, and real-time analytics

## Vision

Eliminate the complexity and constant monitoring required for DeFi liquidity management by providing intelligent automation that maximizes yields while minimizing user intervention.

### Key Features
- **Automated Portfolio Monitoring**: Track multiple Aptos addresses and liquidity positions
- **Smart Rebalancing**: Automatic position rebalancing when out of range
- **Real-time Analytics**: Portfolio value tracking, token balances, and position analysis
- **Multi-Pool Support**: Manage positions across APT/USDC, APT/stkAPT, APT/kAPT pairs
- **Telegram Integration**: Complete bot interface for portfolio management
- **Cloudflare Workers**: Scalable serverless deployment with scheduled automation

## Logo Design Prompt

Create a minimalist logo for "AptosDeFiHub" - a DeFi portfolio management bot for Aptos blockchain. The logo should combine:
- A stylized "A" for Aptos in geometric form
- Subtle DeFi elements like interconnected nodes or liquidity pool curves
- Modern, clean typography with the text "AptosDeFiHub"
- Color scheme: Deep blue (#0052FF Aptos brand) with accent mint green (#00D4AA)
- Simple geometric shapes, minimal gradients
- Professional, tech-focused aesthetic suitable for financial applications
- Icon should work well at small sizes (telegram bot avatar)
- Optional: subtle infinity symbol or circular flow representing continuous portfolio rebalancing

## Info
.dev for polling
.dev.vars for cf webhook

## Development

### Start polling
bun run dev.ts

### For webhook testing (optional)
bunx wrangler dev src/worker.ts

---

## Production

### Install Wrangler CLI
bunx wrangler login

### Deploy to Cloudflare
bunx wrangler deploy

### Set secret in production
bunx wrangler secret put BOT_TOKEN

### Set webhook after deployment (* remember the slash at the end of the url /)
curl -X POST "https://api.telegram.org/bot{BOT_TOKEN}/setWebhook" \
     -d '{"url": "https://basically-enough-clam.ngrok-free.app/"}' \
     -H "Content-Type: application/json"

---

## Scheduled
npx wrangler dev --test-scheduled

curl "http://localhost:3000/cdn-cgi/handler/scheduled"
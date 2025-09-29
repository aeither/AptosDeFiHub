

<div align="center">
    <img src="https://github.com/user-attachments/assets/3831a05c-b80a-4ee7-b48b-47f0c4c40b4e" alt="Logo" width="400">
</div>

# AptosDeFiHub

## Description

AptosDeFiHub is a Telegram bot for automated DeFi portfolio management on Aptos, offering liquidity tracking, auto-rebalancing, and real-time analytics

## Vision

Eliminate the complexity and constant monitoring required for DeFi liquidity management by providing intelligent automation that maximizes yields while minimizing user intervention.

### Key Features
- **Automated Portfolio Monitoring**: Track multiple Aptos addresses and liquidity positions powered by Nodit RPC infrastructure
- **Smart Rebalancing**: Automatic position rebalancing leveraging Hyperion's CLMM for optimal capital efficiency
- **Intelligent Swap Routing**: Kana Labs aggregation to find best rates across DEXs
- **Advanced Trading Tools**: Integration with Tapp.Exchange for next-gen DeFi beyond traditional AMMs
- **Real-time Analytics**: Portfolio value tracking, token balances, and position analysis
- **Multi-Pool Support**: Manage positions across APT/USDC, APT/stkAPT, APT/kAPT pairs
- **Telegram Integration**: Complete bot interface for portfolio management
- **Cloudflare Workers**: Scalable serverless deployment with scheduled automation

### Technology Stack
- **Hyperion Protocol**: Concentrated Liquidity Market Maker (CLMM) for automated rebalancing and capital efficiency optimization
- **Kana Labs**: Swap aggregation for best rate discovery across multiple DEXs
- **Tapp.Exchange**: Next-generation DeFi trading tools beyond traditional AMMs
- **Nodit RPC**: Reliable Aptos infrastructure for on-chain monitoring and data retrieval
- **Aptos Blockchain**: Fast, secure, and scalable Layer 1 for DeFi operations

## Hyperion CLM Auto-rebalance for optimal capital efficiency

<img width="1327" height="417" alt="image" src="https://github.com/user-attachments/assets/390d496c-9b0b-4ec4-b7ca-894cea27e8dd" />

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

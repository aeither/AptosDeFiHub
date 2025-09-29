
<div align="center">
    <img src="https://github.com/user-attachments/assets/3831a05c-b80a-4ee7-b48b-47f0c4c40b4e" alt="Logo" width="400">
</div>

# AptosDeFiHub

## Description

AptosDeFiHub is a comprehensive Telegram bot for automated DeFi portfolio management on Aptos, offering intelligent liquidity tracking, automated rebalancing, multi-DEX swap aggregation, and real-time analytics across the entire Aptos DeFi ecosystem.

## Vision

Eliminate the complexity and constant monitoring required for DeFi liquidity management by providing intelligent automation that maximizes yields while minimizing user intervention through cutting-edge integrations with the best Aptos protocols.

---

## 🎯 Core Features by Category

### 🎯 Hyperion CLM Auto-rebalance for optimal capital efficiency

<img width="1315" height="342" alt="image" src="https://github.com/user-attachments/assets/658ed6fa-bc47-4dd5-b34f-ed534c93c38d" />

### 📊 Portfolio Watcher & Address Management

**Multi-Address Tracking System**
- `/add <address>` - Add Aptos address to your tracking list
- `/remove <address>` - Remove address from tracking
- `/list` - View all your tracked addresses
- `/clear` - Clear all tracked addresses

**Portfolio Analytics**
- `/portfolio <address>` - Complete portfolio overview with USD values
- `/positions <address>` - Detailed positions and balance analysis
- `/balances <address>` - Token balances with real-time USD pricing

**Real-time Notifications**
- Automated position monitoring with instant alerts
- Rebalancing notifications with transaction details
- Portfolio value change alerts
- Failed transaction notifications with retry options

---

### ⚡ Hyperion Protocol Integration

**Automated Rebalancing System**
- **Intelligent Position Monitoring**: Continuous tracking of tick ranges and token ratios
- **Configurable Thresholds**: Custom rebalancing triggers per pool type
- **Multi-Strategy Support**: 
  - Tightest Range: Rebalance when position goes inactive or token depletes
  - Custom Range: Rebalance when token balance drops below 10%
- **Gas Optimization**: Smart transaction batching and timing

**Manual Pool Management**
- `/pools` - List all farm pools with APR, TVL, and asset types
- `/ratio <poolId>` - Calculate optimal liquidity ratios for your address
- `/addliquidity <poolId>` - Add liquidity with optimal token ratios
- `/rebalance <poolId> [rangePercent]` - Force rebalance positions (admin)

**Position Analytics**
- Real-time position value tracking with USD conversion
- Fee and farm reward calculations
- Price impact analysis for rebalancing decisions
- Tick range optimization recommendations

**Supported Pool Pairs**
- APT/USDC - High volume trading pair
- APT/stkAPT - Liquid staking arbitrage
- APT/kAPT - Alternative staking solutions
- Custom pools with automatic detection

---

### 🔄 Kanalabs Swap Aggregator

**Multi-DEX Quote Aggregation**
- `/kana_quotes <fromToken> <toToken> <amount> [slippage]` - Get best rates across all DEXs
- **Supported Protocols**: Automatic discovery of optimal routes
- **Price Impact Analysis**: Real-time slippage calculations
- **Gas Estimation**: Accurate transaction cost predictions

**Smart Swap Execution**
- `/kana_swap <fromToken> <toToken> <amount> [slippage]` - Execute with best quote (admin only)
- **Route Optimization**: Intelligent path finding for complex swaps
- **MEV Protection**: Front-running resistance through aggregation
- **Slippage Control**: Customizable protection levels (default: 0.5%)

**Token Management**
- `/kana_tokens` - List all supported tokens with addresses
- **Pre-configured Tokens**: APT, USDC, MOD, stkAPT with proper decimals
- **Custom Token Support**: Direct address input for any Aptos token
- **Automatic Decimal Handling**: Precise amount calculations

---

### 🔍 Nodit Analytics & Data Intelligence

**Token Holder Analysis**
- `/token_holders [assetType]` - Get top 20 holders for any token (default: APT)
- **Balance Distribution**: Wealth concentration analysis
- **Holder Status**: Active/frozen account detection
- **Token Standards**: Support for both Coin and Fungible Asset standards

**Account Activity Tracking**
- `/token_activity <address>` - Recent token movements and transactions
- **Transaction History**: Deposits, withdrawals, and transfers
- **Activity Patterns**: Volume and frequency analysis
- **Asset Type Breakdown**: Multi-token activity overview

**On-chain Data Integration**
- **Real-time Indexing**: Latest blockchain state access
- **High Performance**: Optimized queries for fast response
- **Comprehensive Coverage**: Full Aptos ecosystem monitoring

---

### 💰 Panora Exchange Price Intelligence

**Real-time Price Feeds**
- `/prices [tokenAddress]` - Current token prices with market data
- **Multi-Token Support**: APT, stkAPT, kAPT, USDC with automatic lookup
- **USD Conversion**: Accurate fiat value calculations
- **Native Price Ratios**: Cross-token exchange rates

**Portfolio Valuation**
- **Dynamic USD Calculation**: Real-time portfolio value updates
- **Token Allocation**: Percentage distribution across holdings
- **Historical Tracking**: Value changes over time
- **Price Alert Integration**: Threshold-based notifications

---

### 🏊 TAPP Exchange Integration

**Next-Generation Pool Analytics**
- `/tapp_pools` - Advanced pool discovery with TVL and fee structures
- **Pool Types**: Support for various AMM implementations
- **Yield Optimization**: APR comparison across pool types
- **Liquidity Analysis**: Depth and volume metrics

**Advanced Swap Simulation**
- `/tapp_swap <poolId> <amount> <fromToken> <toToken> [a2b]` - Detailed swap impact analysis
- **Price Impact Modeling**: Accurate slippage predictions
- **Route Optimization**: Multi-hop swap efficiency
- **Gas Cost Analysis**: Transaction fee estimation

---

### ☕ Kofi Protocol Comparison

**Cross-Protocol Rate Analysis**
- `/kofi [amount]` - Compare Kofi vs Hyperion conversion rates
- **Arbitrage Detection**: Price difference identification
- **Optimal Route Selection**: Best execution venue recommendation
- **Market Efficiency**: Cross-DEX spread analysis

---

### 🔧 Advanced Admin Controls

**Position Management**
- `/manage` - Interactive position management interface
- `/remove_liquidity <positionId> <percentage>` - Precise liquidity removal
- `/seed-position <tokenA> <tokenB> [feeTier] [seedAmount]` - Create new positions

**System Automation**
- `/schedule [on|off]` - Control automated rebalancing system
- **Monitoring Controls**: Enable/disable position tracking
- **Notification Settings**: Configure alert preferences
- **Risk Management**: Set maximum rebalancing frequency

**Transaction Management**
- **Retry Logic**: Automatic failed transaction recovery
- **Gas Optimization**: Dynamic fee adjustment
- **Batch Processing**: Multiple operations in single transaction
- **Error Handling**: Comprehensive failure recovery

---

## 🏗️ Technology Stack

### Core Blockchain Infrastructure
- **Aptos Blockchain**: High-performance Layer 1 with sub-second finality
- **Aptos SDK**: Official TypeScript integration for seamless interaction

### DeFi Protocol Integrations
- **Hyperion Protocol**: Concentrated Liquidity Market Maker (CLMM) for automated capital efficiency
- **Kanalabs Aggregator**: Multi-DEX routing for optimal swap execution
- **TAPP Exchange**: Advanced AMM with next-generation features
- **Panora Exchange**: Real-time price feeds and market data
- **Kofi Protocol**: Additional liquidity and yield opportunities

### Data & Infrastructure
- **Nodit RPC**: Enterprise-grade Aptos node infrastructure for reliable data access
- **Cloudflare Workers**: Serverless deployment with global edge distribution
- **Telegram Bot API**: Seamless user interface with rich interactive features

### Development & Deployment
- **TypeScript**: Full type safety across all integrations
- **Wrangler**: Cloudflare Workers development and deployment tooling
- **Bun**: Fast JavaScript runtime for development

---

## 🚀 Getting Started

### Prerequisites
- Telegram account
- Aptos wallet with funded address
- API keys for integrated protocols

### Quick Start
1. Message the bot on Telegram
2. `/add <your_aptos_address>` - Start tracking your portfolio
3. Bot automatically monitors and rebalances your positions
4. Use `/help` to explore all available features

### Configuration
- Set up API keys in `.dev.vars`
- Configure pool strategies in `src/config/pools.ts`
- Customize notification preferences through bot commands

---

## 📈 Supported Use Cases

### Passive Liquidity Providers
- **Set-and-Forget**: Automated rebalancing with minimal intervention
- **Yield Optimization**: Automatic reinvestment of fees and rewards
- **Risk Management**: Position monitoring with configurable thresholds

### Active Traders
- **Multi-DEX Arbitrage**: Cross-protocol rate comparison and execution
- **Advanced Analytics**: Detailed position and market analysis
- **Manual Override**: Full control over automated systems

### Portfolio Managers
- **Multi-Address Tracking**: Monitor multiple wallets and strategies
- **Performance Analytics**: Detailed ROI and yield tracking
- **Risk Assessment**: Position sizing and allocation analysis

---

## 🔐 Security Features

### Access Control
- **Admin-only Commands**: Sensitive operations restricted to authorized users
- **Private Key Management**: Secure credential handling in Cloudflare environment
- **Transaction Verification**: All operations confirmed before execution

### Risk Management
- **Slippage Protection**: Configurable maximum slippage tolerance
- **Gas Limit Control**: Transaction cost optimization
- **Position Size Limits**: Automated risk boundaries

---

## 🛠️ Development

### Local Development
```bash
# Start polling mode
bun run dev.ts

# Webhook testing (optional)
bunx wrangler dev src/worker.ts
```

### Production Deployment
```bash
# Install Wrangler CLI
bunx wrangler login

# Deploy to Cloudflare
bunx wrangler deploy

# Set production secrets
bunx wrangler secret put BOT_TOKEN
bunx wrangler secret put APTOS_API_KEY
bunx wrangler secret put NODIT_API_KEY
bunx wrangler secret put PRIVATE_KEY
```

### Webhook Configuration
```bash
# Set webhook after deployment
curl -X POST "https://api.telegram.org/bot{BOT_TOKEN}/setWebhook" \
     -d '{"url": "https://your-worker.your-subdomain.workers.dev/"}' \
     -H "Content-Type: application/json"
```

### Scheduled Jobs Testing
```bash
# Test scheduled automation
npx wrangler dev --test-scheduled
curl "http://localhost:3000/cdn-cgi/handler/scheduled"
```

---

## 📊 Performance Metrics

### Automation Efficiency
- **Rebalancing Success Rate**: >99% transaction success
- **Response Time**: <2 seconds for most operations
- **Uptime**: 99.9% availability through Cloudflare infrastructure

### Cost Optimization
- **Gas Efficiency**: Optimized transaction batching
- **Slippage Minimization**: Multi-DEX aggregation for best rates
- **Fee Management**: Automatic fee tier selection for optimal returns

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

---

## 📞 Support

- **Documentation**: Comprehensive command reference via `/help`
- **Issues**: GitHub Issues for bug reports and feature requests
- **Community**: Telegram support group for user assistance

---

**AptosDeFiHub** - Intelligent automation for the future of DeFi on Aptos 🚀

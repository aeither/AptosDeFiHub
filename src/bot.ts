import { Bot, type Context } from "grammy";
import type { Env } from "./env";

export function createBot(env: Env) {
  const bot = new Bot<Context>(env.BOT_TOKEN);

  // Address management commands
  bot.command("add", async (ctx) => {
    const address = ctx.match.trim();
    if (!address) {
      await ctx.reply("Please provide an Aptos address\nUsage: /add <address>\nExample: /add 0x123...");
      return;
    }

    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply("❌ Unable to identify user. Please try again.");
      return;
    }

    // Lazy import for KV operations
    const { addUserAddress } = await import("./utils/userAddressKV");
    const result = await addUserAddress(userId, address, env);
    
    await ctx.reply(result.message, { parse_mode: "Markdown" });
  });

  bot.command("remove", async (ctx) => {
    const address = ctx.match.trim();
    if (!address) {
      await ctx.reply("Please provide an address to remove\nUsage: /remove <address>\nExample: /remove 0x123...");
      return;
    }

    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply("❌ Unable to identify user. Please try again.");
      return;
    }

    // Lazy import for KV operations
    const { removeUserAddress } = await import("./utils/userAddressKV");
    const result = await removeUserAddress(userId, address, env);
    
    await ctx.reply(result.message, { parse_mode: "Markdown" });
  });

  bot.command("clear", async (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply("❌ Unable to identify user. Please try again.");
      return;
    }

    // Lazy import for KV operations
    const { clearUserAddresses } = await import("./utils/userAddressKV");
    const result = await clearUserAddresses(userId, env);
    
    await ctx.reply(result.message, { parse_mode: "Markdown" });
  });

  bot.command("list", async (ctx) => {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply("❌ Unable to identify user. Please try again.");
      return;
    }

    // Lazy import for KV operations
    const { getFormattedUserAddresses } = await import("./utils/userAddressKV");
    const message = await getFormattedUserAddresses(userId, env);
    
    await ctx.reply(message, { parse_mode: "Markdown" });
  });

  bot.command("positions", async (ctx) => {
    const input = ctx.match.trim();
    if (!input) {
      await ctx.reply("Please provide an Aptos address\nUsage: /positions <address> [additional params ignored]");
      return;
    }

    // Split by whitespace and take only the first parameter
    const params = input.split(/\s+/);
    const address = params[0];

    if (!address) {
      await ctx.reply("Please provide a valid Aptos address\nUsage: /positions <address> [additional params ignored]");
      return;
    }

    // Lazy import for heavy operations
    const { generatePositionsResponse } = await import("./libs/hyperion/read");
    const { getPoolConfigsForFilter } = await import("./config/pools");
    const poolConfigs = getPoolConfigsForFilter();
    const { message } = await generatePositionsResponse(env, address, poolConfigs);
    await ctx.reply(message, { parse_mode: "Markdown" });
  });

  bot.command("balances", async (ctx) => {
    const input = ctx.match.trim();
    if (!input) {
      await ctx.reply("Please provide an Aptos address\nUsage: /balances <address>\nExample: /balances 0x123...");
      return;
    }

    // Split by whitespace and take only the first parameter
    const params = input.split(/\s+/);
    const address = params[0];

    if (!address) {
      await ctx.reply("Please provide a valid Aptos address\nUsage: /balances <address>");
      return;
    }

    await ctx.reply("💰 Fetching wallet balances...");

    // Lazy import for wallet balance operations
    const { fetchWalletBalances, formatWalletBalances } = await import("./libs/tokenBalances");
    
    try {
      const walletBalances = await fetchWalletBalances(address);
      const message = `💳 *Wallet Balances for* \`${address}\`\n\n${formatWalletBalances(walletBalances)}`;
      await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error fetching wallet balances:", error);
      await ctx.reply("❌ Error fetching wallet balances. Please check the address and try again.");
    }
  });

  bot.command("portfolio", async (ctx) => {
    const input = ctx.match.trim();
    if (!input) {
      await ctx.reply("Please provide an Aptos address\nUsage: /portfolio <address>\nExample: /portfolio 0x123...");
      return;
    }

    // Split by whitespace and take only the first parameter
    const params = input.split(/\s+/);
    const address = params[0];

    if (!address) {
      await ctx.reply("Please provide a valid Aptos address\nUsage: /portfolio <address>");
      return;
    }

    await ctx.reply("📊 Generating complete portfolio overview...");

    try {
      // Fetch wallet balances with USD values
      const { fetchWalletBalancesWithUSD, formatWalletBalancesWithUSD } = await import("./libs/tokenBalances");
      const { generatePositionsResponse } = await import("./libs/hyperion/read");
      const { fetchMultipleTokenPrices, formatUSDValue } = await import("./libs/panora");
      
      // Get wallet balances with USD values
      const walletBalances = await fetchWalletBalancesWithUSD(address);
      
      // Get positions data (reuse existing function)
      const { getPoolConfigsForFilter } = await import("./config/pools");
      const poolConfigs = getPoolConfigsForFilter();
      const { message: positionsMessage } = await generatePositionsResponse(env, address, poolConfigs);
      
      // Build comprehensive portfolio message
      let portfolioMessage = `📊 **Complete Portfolio for** \`${address}\`\n\n`;
      
      // Add portfolio summary
      portfolioMessage += "💰 **Portfolio Summary:**\n";
      portfolioMessage += "• Wallet: See detailed breakdown below\n";
      portfolioMessage += "• Positions: See detailed breakdown below\n\n";
      
      // Add wallet balances with USD
      const walletSection = await formatWalletBalancesWithUSD(walletBalances);
      portfolioMessage += `${walletSection}\n\n`;
      
      // Add positions (extract just the positions part from the existing response)
      const positionsStart = positionsMessage.indexOf('🔄 **Hyperion Positions');
      if (positionsStart !== -1) {
        portfolioMessage += positionsMessage.substring(positionsStart);
      } else {
        portfolioMessage += "❌ No Hyperion positions found\n\n";
      }
      
      portfolioMessage += "\n💡 *Use /positions for detailed analysis or /balances for wallet-only view*";
      
      await ctx.reply(portfolioMessage, { parse_mode: "Markdown" });
      
    } catch (error) {
      console.error("Error generating portfolio:", error);
      await ctx.reply("❌ Error generating portfolio overview. Please check the address and try again.");
    }
  });

  bot.command("prices", async (ctx) => {
    const tokenAddress = ctx.match.trim() || "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b";
    const endpoint = "https://api.panora.exchange/prices";
    const headers = {
      "x-api-key": env.PANORA_API_KEY,
    };

    try {
      const queryString = new URLSearchParams({ tokenAddress });
      const url = `${endpoint}?${queryString}`;
      const response = await fetch(url, {
        method: "GET",
        headers: headers,
      });
      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        const token = data[0];
        const message = `💲 *Token Prices*
_Powered by Panora_

*Name:* ${token.name}
*Symbol:* ${token.symbol}
*USD Price:* $${Number(token.usdPrice).toFixed(2)}
*Native Price:* ${Number(token.nativePrice).toFixed(2)}
*Decimals:* ${token.decimals}
*Token Address:* \`${token.faAddress || token.tokenAddress}\``;

        await ctx.reply(message, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("❌ No data returned for the specified token.");
      }
    } catch (error) {
      console.error("Error fetching token prices:", error);
      await ctx.reply("❌ Error fetching token prices. Please try again later.");
    }
  });

  bot.command("fee_history", async (ctx) => {
    // Lazy import for heavy SDK operations
    const { Network } = await import("@aptos-labs/ts-sdk");
    const { initHyperionSDK } = await import("@hyperionxyz/sdk");
    
    const sdk = initHyperionSDK({
      network: Network.MAINNET,
      APTOS_API_KEY: env.APTOS_API_KEY
    });
    const args = ctx.match.trim().split(/\s+/);
    if (args.length < 2) {
      await ctx.reply("Usage: /fee_history <positionId> <address>");
      return;
    }
    const [positionId, address] = args;
    try {
      const result = await sdk.Position.fetchFeeHistory({ positionId, address });
      console.log("[TEST] fetchFeeHistory result:", result);
      await ctx.reply("Fee history result has been logged to the console.");
    } catch (error) {
      console.error("Error fetching fee history:", error);
      await ctx.reply("❌ Error fetching fee history. Check the console for details.");
    }
  });

  bot.command("pools", async (ctx) => {
    await ctx.reply("🔄 Fetching farm pools...");
    // Lazy import for heavy operations
    const { generatePoolsResponse } = await import("./libs/hyperion/read");
    const response = await generatePoolsResponse(env);
    await ctx.reply(response, { parse_mode: "Markdown" });
  });

  bot.command("ratio", async (ctx) => {
    const poolId = ctx.match.trim();
    
    if (!poolId) {
      await ctx.reply("Please provide a pool ID\nUsage: /ratio <poolId>\nExample: /ratio 0x925660b...");
      return;
    }

    try {
      const { getAccount } = await import("./utils/getAccount");
      const account = await getAccount(env.PRIVATE_KEY);
      const address = account.accountAddress.toString();

      await ctx.reply("🧮 Calculating optimal ratio...");
      // Lazy import for heavy operations
      const { generateRatioResponse } = await import("./libs/hyperion/read");
      const response = await generateRatioResponse(env, address, poolId);
      console.log("response.data", response.data);
      await ctx.reply(response.text, { parse_mode: "Markdown" });
    } catch (error) {
      console.error("Error calculating ratio:", error);
      await ctx.reply("❌ Error calculating ratio. Please check the pool ID and try again.");
    }
  });

  bot.command("rebalance", async (ctx) => {
    // Admin-only command check
    const userId = ctx.from?.id?.toString();
    if (userId !== env.TG_CHAT_ID) {
      await ctx.reply("❌ This command is restricted to administrators only.");
      return;
    }

    const input = ctx.match.trim();
    const params = input.split(/\s+/).filter((p: string) => p.length > 0);
    
    // Parse parameters: /rebalance [poolId] [rangePercent]
    const poolId = params[0];
    const rangePercent: number | null = params[1] ? Number.parseFloat(params[1]) : null; // Default to null (tightest range)

    if (!poolId) {
      await ctx.reply("Please provide a pool ID\nUsage: /rebalance <poolId> [rangePercent]\nExample: /rebalance 0x925660b... 2\n\nDefault: Tightest range (null)");
      return;
    }

    if (params[1] && (Number.isNaN(Number.parseFloat(params[1])) || Number.parseFloat(params[1]) <= 0 || Number.parseFloat(params[1]) > 100)) {
      await ctx.reply("❌ Invalid range percent. Must be between 0 and 100.\nExample: /rebalance 0x925660b... 2\n\nOr omit for tightest range: /rebalance 0x925660b...");
      return;
    }

    const rangeDisplay = rangePercent !== null ? `±${rangePercent}%` : 'Tightest Range';
    
    // Send immediate acknowledgment - processing will be handled by worker
    const acknowledgmentMessage = `🔄 **Rebalancing Started**\n\n📍 Pool ID: \`${poolId}\`\n📊 Range: ${rangeDisplay}\n\n⏳ Processing... This may take a few minutes.\nI'll send updates as the operation progresses.`;
    await ctx.reply(acknowledgmentMessage, { parse_mode: "Markdown" });
    
    // The actual processing is handled in worker.ts background processing
  });

  bot.command("addliquidity", async (ctx) => {
    // Admin-only command check
    const userId = ctx.from?.id?.toString();
    if (userId !== env.TG_CHAT_ID) {
      await ctx.reply("❌ This command is restricted to administrators only.");
      return;
    }

    const input = ctx.match.trim();
    const params = input.split(/\s+/).filter((p: string) => p.length > 0);
    
    // Parse parameters: /addliquidity <poolId>
    const poolId = params[0];

    if (!poolId) {
      await ctx.reply("Please provide a pool ID\nUsage: /addliquidity <poolId>\nExample: /addliquidity 0x925660b...\n\nThis will add liquidity to the first position found in the specified pool.");
      return;
    }

    // Send immediate acknowledgment - processing will be handled by worker
    const acknowledgmentMessage = `💧 **Adding Liquidity Started**\n\n📍 Pool ID: \`${poolId}\`\n\n⏳ Processing... This may take a few minutes.\nI'll send updates as the operation progresses.`;
    await ctx.reply(acknowledgmentMessage, { parse_mode: "Markdown" });
    
    // The actual processing is handled in worker.ts background processing
  });

  bot.command("schedule", async (ctx) => {
    // Admin-only command check
    const userId = ctx.from?.id?.toString();
    if (userId !== env.TG_CHAT_ID) {
      await ctx.reply("❌ This command is restricted to administrators only.");
      return;
    }

    const input = ctx.match.trim().toLowerCase();
    
    // Lazy import for schedule operations
    const { setScheduleConfig, getFormattedScheduleStatus } = await import("./utils/scheduleKV");
    
    if (!input) {
      // Show current status
      const statusMessage = await getFormattedScheduleStatus(env);
      await ctx.reply(statusMessage, { parse_mode: "Markdown" });
      return;
    }

    if (input === 'on') {
      const result = await setScheduleConfig(true, env, userId);
      await ctx.reply(result.message, { parse_mode: "Markdown" });
    } else if (input === 'off') {
      const result = await setScheduleConfig(false, env, userId);
      await ctx.reply(result.message, { parse_mode: "Markdown" });
    } else {
      await ctx.reply("❌ **Invalid option**\n\nUsage:\n• `/schedule` - Show current status\n• `/schedule on` - Enable scheduled automation\n• `/schedule off` - Disable scheduled automation", { parse_mode: "Markdown" });
    }
  });

  bot.command("kofi", async (ctx) => {
    const input = ctx.match.trim();
    let amount = 10000; // Default value
    
    // Parse optional amount parameter
    if (input) {
      const parsedAmount = Number.parseFloat(input);
      if (!Number.isNaN(parsedAmount) && parsedAmount > 0) {
        amount = parsedAmount;
      } else {
        await ctx.reply("❌ Invalid amount. Please provide a valid positive number.\nUsage: /kofi [amount]\nExample: /kofi 5000");
        return;
      }
    }
    
    await ctx.reply(`🔄 Comparing Kofi Protocol vs Hyperion Swap rates for ${amount} APT...`);
    
    try {
      // Lazy import for kofi operations
      const { compareConversionRates, formatComparisonResults } = await import("./libs/kofi");
      
      const comparison = await compareConversionRates(env, amount);
      const message = formatComparisonResults(comparison);
      
      await ctx.reply(message, { parse_mode: "Markdown" });
      
    } catch (error) {
      console.error("Error comparing Kofi vs Hyperion rates:", error);
      await ctx.reply("❌ Error comparing conversion rates. Please try again later.");
    }
  });

  bot.command("manage", async (ctx) => {
    // Admin-only command check
    const userId = ctx.from?.id?.toString();
    if (userId !== env.TG_CHAT_ID) {
      await ctx.reply("❌ This command is restricted to administrators only.");
      return;
    }

    await ctx.reply("🔧 Loading position management interface...");

    try {
      // Get account address from PRIVATE_KEY
      const { getAccount } = await import("./utils/getAccount");
      const account = await getAccount(env.PRIVATE_KEY);
      const address = account.accountAddress.toString();

      // Fetch wallet balances
      const { fetchWalletBalances, formatWalletBalances } = await import("./libs/tokenBalances");
      const walletBalances = await fetchWalletBalances(address);

      // Show user balances first
      const balanceMessage = `💰 **Your Wallet Balances**\n\n${formatWalletBalances(walletBalances)}\n\n📊 Use this information to decide how much to add to liquidity positions.`;
      await ctx.reply(balanceMessage, { parse_mode: "Markdown" });

      // Fetch positions
      const { getAllPositions } = await import("./libs/hyperion/read");
      const positions = await getAllPositions(address, env);

      if (positions.length === 0) {
        await ctx.reply(`❌ No Hyperion positions found for address \`${address}\``, { parse_mode: "Markdown" });
        return;
      }

      // Create inline keyboard for position management
      const { InlineKeyboard } = await import("grammy");
      
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const { objectId, pool } = pos.position;
        
        // Get token balances for liquidity calculation
        const token1Symbol = pool.token1Info.symbol;
        const token2Symbol = pool.token2Info.symbol;
        
        // Find balances for this pool's tokens
        const token1Balance = walletBalances.balances.find(b => b.symbol === token1Symbol);
        const token2Balance = walletBalances.balances.find(b => b.symbol === token2Symbol);
        
        // Calculate max amounts (max - 2 as requested)
        const maxToken1 = token1Balance ? Math.max(0, token1Balance.amount - 2) : 0;
        const maxToken2 = token2Balance ? Math.max(0, token2Balance.amount - 2) : 0;
        
        // Create comprehensive keyboard with all functionality
        const keyboard = new InlineKeyboard()
          .text("📊 Check Ratio", `ratio_${objectId.slice(-8)}`).row()
          .text(`💧 Max ${token1Symbol}`, `maxA_${objectId.slice(-8)}`)
          .text(`💧 Max ${token2Symbol}`, `maxB_${objectId.slice(-8)}`).row()
          .text("🗑️ Remove 50%", "remove_50")
          .text("🗑️ Remove 100%", "remove_100");

        const positionMessage = `🔧 **Position ${i + 1} Management**\n\n` +
          `🏊 Pool: ${pool.token1Info.symbol}/${pool.token2Info.symbol}\n` +
          `💧 Value: $${Number(pos.value).toFixed(2)}\n` +
          `🆔 Position ID: \`${objectId}\`\n\n` +
          `💰 **Available for Liquidity:**\n` +
          `• Max ${token1Symbol}: ${maxToken1.toFixed(6)} (keeps 2 in wallet)\n` +
          `• Max ${token2Symbol}: ${maxToken2.toFixed(6)} (keeps 2 in wallet)\n\n` +
          `Choose your action:`;

        await ctx.reply(positionMessage, {
          parse_mode: "Markdown",
          reply_markup: keyboard
        });
      }

    } catch (error) {
      console.error("Error in manage command:", error);
      await ctx.reply("❌ Error loading positions. Please try again.");
    }
  });

  bot.command("swap-simulate", async (ctx) => {
    // Admin-only command check
    const userId = ctx.from?.id?.toString();
    if (userId !== env.TG_CHAT_ID) {
      await ctx.reply("❌ This command is restricted to administrators only.");
      return;
    }

    const input = ctx.match.trim();
    const params = input.split(/\s+/);
    
    // Parse parameters: /swap-simulate <fromToken> <toToken> [amounts...]
    const fromToken = params[0] || 'APT';
    const toToken = params[1] || 'stkAPT';
    
    // Default amounts to test (can be customized via parameters)
    let testAmounts = [100, 500, 1000, 5000, 10000];
    if (params.length > 2) {
      testAmounts = params.slice(2).map(Number).filter(n => !isNaN(n) && n > 0);
      if (testAmounts.length === 0) {
        await ctx.reply("❌ Invalid amounts provided. Please provide valid positive numbers.\nUsage: /swap-simulate <fromToken> <toToken> [amount1] [amount2] ...\nExample: /swap-simulate APT stkAPT 100 500 1000");
        return;
      }
    }

    await ctx.reply(`🔄 Simulating ${fromToken} → ${toToken} swaps with price impact analysis...`);

    try {
      // Get token addresses
      const { getTokenAddress } = await import("./libs/panora");
      const fromTokenAddress = getTokenAddress(fromToken);
      const toTokenAddress = getTokenAddress(toToken);

      if (!fromTokenAddress || !toTokenAddress) {
        await ctx.reply(`❌ Unsupported token pair: ${fromToken}/${toToken}\nSupported tokens: APT, stkAPT, kAPT, USDC`);
        return;
      }

      // Get current prices
      const { fetchTokenPrice, formatUSDValue } = await import("./libs/panora");
      const fromTokenPrice = await fetchTokenPrice(fromTokenAddress);
      const toTokenPrice = await fetchTokenPrice(toTokenAddress);

      if (!fromTokenPrice || !toTokenPrice) {
        await ctx.reply("❌ Unable to fetch token prices. Please try again later.");
        return;
      }

      const fromPriceUSD = Number.parseFloat(fromTokenPrice.usdPrice);
      const toPriceUSD = Number.parseFloat(toTokenPrice.usdPrice);
      const marketRate = fromPriceUSD / toPriceUSD;

      // Initialize Hyperion SDK for swap estimates
      const { initHyperionSDK } = await import("@hyperionxyz/sdk");
      const { Network } = await import("@aptos-labs/ts-sdk");
      
      const sdk = initHyperionSDK({
        network: Network.MAINNET,
        APTOS_API_KEY: env.APTOS_API_KEY,
      });

      let response = `📊 **Swap Simulation: ${fromToken} → ${toToken}**\n\n`;
      response += `💰 Market Rate: 1 ${fromToken} = ${marketRate.toFixed(6)} ${toToken}\n`;
      response += `💲 Prices: ${fromToken} $${fromPriceUSD.toFixed(4)} | ${toToken} $${toPriceUSD.toFixed(4)}\n\n`;
      response += `📈 **Simulation Results:**\n\n`;

      for (const amount of testAmounts) {
        try {
          // Calculate input amount in raw format (assuming 8 decimals for most tokens)
          const decimals = fromTokenPrice.decimals || 8;
          const amountRaw = Math.floor(amount * (10 ** decimals));

          // Get swap estimate
          const { amountOut } = await sdk.Swap.estToAmount({
            amount: amountRaw,
            from: fromTokenAddress,
            to: toTokenAddress,
            safeMode: false
          });

          const outputAmount = Number(amountOut) / (10 ** (toTokenPrice.decimals || 8));
          const actualRate = outputAmount / amount;
          const priceImpact = ((actualRate - marketRate) / marketRate) * 100;
          
          const inputValueUSD = amount * fromPriceUSD;
          const outputValueUSD = outputAmount * toPriceUSD;
          const valueImpact = ((outputValueUSD - inputValueUSD) / inputValueUSD) * 100;

          response += `💰 **${amount} ${fromToken}** (${formatUSDValue(inputValueUSD)})\n`;
          response += `   → ${outputAmount.toFixed(6)} ${toToken} (${formatUSDValue(outputValueUSD)})\n`;
          response += `   Rate: ${actualRate.toFixed(6)} | Impact: ${priceImpact >= 0 ? '+' : ''}${priceImpact.toFixed(3)}%\n`;
          response += `   Value Impact: ${valueImpact >= 0 ? '+' : ''}${valueImpact.toFixed(3)}%\n\n`;

        } catch (swapError) {
          response += `❌ **${amount} ${fromToken}**: Swap estimation failed\n\n`;
        }
      }

      response += `💡 *Negative impact = worse than market rate*\n`;
      response += `💡 *Choose amounts with minimal price impact*`;

      await ctx.reply(response, { parse_mode: "Markdown" });

    } catch (error) {
      console.error("Error in swap-simulate command:", error);
      await ctx.reply("❌ Error running swap simulation. Please try again later.");
    }
  });

  bot.command("seed-position", async (ctx) => {
    // Admin-only command check
    const userId = ctx.from?.id?.toString();
    if (userId !== env.TG_CHAT_ID) {
      await ctx.reply("❌ This command is restricted to administrators only.");
      return;
    }

    const input = ctx.match.trim();
    const params = input.split(/\s+/).filter((p: string) => p.length > 0);
    
    // Parse parameters: /seed-position <tokenA> <tokenB> [feeTier] [seedAmount]
    const tokenA = params[0];
    const tokenB = params[1];
    const feeTier = params[2] ? Number.parseInt(params[2]) : 3; // Default to fee tier 3
    const seedAmount = params[3] ? Number.parseFloat(params[3]) : 2; // Default to 2 units

    if (!tokenA || !tokenB) {
      await ctx.reply("Please provide token symbols\nUsage: /seed-position <tokenA> <tokenB> [feeTier] [seedAmount]\nExample: /seed-position APT USDC 3 2\n\nSupported tokens: APT, stkAPT, kAPT, USDC\nFee tiers: 1=0.01%, 2=0.05%, 3=0.3%, 4=1%");
      return;
    }

    if (isNaN(feeTier) || feeTier < 1 || feeTier > 4) {
      await ctx.reply("❌ Invalid fee tier. Must be 1-4 (1=0.01%, 2=0.05%, 3=0.3%, 4=1%)");
      return;
    }

    if (isNaN(seedAmount) || seedAmount <= 0) {
      await ctx.reply("❌ Invalid seed amount. Must be a positive number.");
      return;
    }

    // Send immediate acknowledgment
    const acknowledgmentMessage = `🌱 **Seed Position Creation Started**\n\n📍 Pair: ${tokenA}/${tokenB}\n💰 Seed Amount: ${seedAmount} ${tokenA}\n🏊 Fee Tier: ${feeTier}\n\n⏳ Creating seed position... This may take a few minutes.\nI'll send updates as the operation progresses.`;
    await ctx.reply(acknowledgmentMessage, { parse_mode: "Markdown" });

    try {
      // Get token addresses
      const { getTokenAddress } = await import("./libs/panora");
      const tokenAAddress = getTokenAddress(tokenA);
      const tokenBAddress = getTokenAddress(tokenB);

      if (!tokenAAddress || !tokenBAddress) {
        await ctx.reply(`❌ Unsupported token pair: ${tokenA}/${tokenB}\nSupported tokens: APT, stkAPT, kAPT, USDC`);
        return;
      }

      // Get account
      const { getAccount } = await import("./utils/getAccount");
      const account = await getAccount(env.PRIVATE_KEY);
      const userAddress = account.accountAddress.toString();

      await ctx.reply("📋 Calculating seed position parameters...");

      // Calculate ratio data for seed position (minimal token B, focus on token A)
      const { generateRatioResponse } = await import("./libs/hyperion/read");
      
      // Create a pool config for the seed position (use a common pool or create one)
      // For seed position, we'll use tightest range (null)
      const response = await generateRatioResponse(env, userAddress, undefined, null);
      
      if (!response.data) {
        await ctx.reply("❌ Unable to calculate position parameters. Please check token pair and try again.");
        return;
      }

      // Prepare seed position data - mostly token A with minimal token B
      const seedData = {
        token1Address: tokenAAddress,
        token2Address: tokenBAddress,
        feeTierIndex: feeTier as any, // Cast to FeeTierIndex
        currentTick: response.data.currentTick,
        tickLower: response.data.tickLower,
        tickUpper: response.data.tickUpper,
        token1Balance: seedAmount, // Use seed amount for token A
        token2Balance: 0.001, // Minimal token B (just for position creation)
        availableToken1: seedAmount,
        token1Decimals: 8, // Default to 8 decimals
        token2Decimals: 8, // Default to 8 decimals  
        token1Symbol: tokenA,
        token2Symbol: tokenB,
      };

      await ctx.reply("🔨 Generating seed position transaction...");

      // Generate create pool payload
      const { getCreatePoolPayload } = await import("./libs/hyperion/createPool");
      const payload = await getCreatePoolPayload(seedData, env);

      await ctx.reply("⚡ Executing seed position creation...");

      // Execute the transaction
      const { executeTransaction } = await import("./libs/hyperion/executeTransaction");
      const result = await executeTransaction(payload, account, 'seed position creation');

      const successMessage = `✅ **Seed Position Created Successfully!**\n\n` +
        `🌱 Pair: ${tokenA}/${tokenB}\n` +
        `💰 Seeded: ${seedAmount} ${tokenA}\n` +
        `🏊 Fee Tier: ${feeTier}\n` +
        `🔗 Transaction: \`${result.transactionHash}\`\n\n` +
        `💡 You can now add more liquidity to this position using /addliquidity command`;
      
      await ctx.reply(successMessage, { parse_mode: "Markdown" });

    } catch (error) {
      console.error("Error in seed-position command:", error);
      await ctx.reply("❌ Error creating seed position. Please check the parameters and try again.");
    }
  });

  bot.command("start", async (ctx) => {
    await ctx.reply("Welcome to AptosDeFiHub! 🚀\n\n" +
      "📊 *Address Management:*\n" +
      "/add <address> - Add address to track\n" +
      "/remove <address> - Remove address\n" +
      "/list - Show your tracked addresses\n" +
      "/clear - Clear all addresses\n\n" +
      "📈 *Portfolio Analysis:*\n" +
      "/portfolio <address> - Complete portfolio overview with USD values\n" +
      "/positions <address> - View detailed positions and balances\n" +
      "/balances <address> - View wallet token balances only\n" +
      "/pools - List farm pools with APR and asset types\n" +
      "/ratio <poolId> - Calculate optimal liquidity ratio for your address\n\n" +
      "💰 *Market Data:*\n" +
      "/prices [tokenAddress] - Get token prices (use /pools for asset types)\n" +
      "/fee_history <positionId> <address> - View fee history\n" +
      "/kofi [amount] - Compare Kofi Protocol vs Hyperion Swap conversion rates (default: 10000 APT)\n\n" +
      "🔧 *Admin Commands:*\n" +
      "/rebalance <poolId> [rangePercent] - Force rebalance all positions in pool (admin only)\n" +
      "/addliquidity <poolId> - Add liquidity to the first position in the specified pool (admin only)\n" +
      "/schedule [on|off] - Control scheduled automation (admin only)\n" +
      "/manage - Position management with removal options (admin only)\n" +
      "/swap-simulate <fromToken> <toToken> [amounts...] - Swap simulation with price impact (admin only)\n" +
      "/seed-position <tokenA> <tokenB> [feeTier] [seedAmount] - Create seed position (admin only)\n\n" +
      "💡 *Getting Started:*\n" +
      "1. Use `/add <your_address>` to start tracking\n" +
      "2. The bot will automatically monitor and rebalance your positions\n" +
      "3. Use `/list` to see all your tracked addresses");
  });

  // Callback query handlers for inline buttons
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    
    // Admin-only check for all callback actions
    const userId = ctx.from?.id?.toString();
    if (userId !== env.TG_CHAT_ID) {
      await ctx.answerCallbackQuery("❌ This action is restricted to administrators only.");
      return;
    }

    // Extract position ID from message text (universal function)
    const messageText = ctx.callbackQuery.message?.text || "";
    const positionIdMatch = messageText.match(/(?:🆔\s*)?Position ID:\s*[`'""]?([^`'"\n\s]+)[`'""]?/);
    let positionId = positionIdMatch ? positionIdMatch[1] : "";
    
    if (!positionId) {
      // Try alternative patterns as fallback
      const alternativeMatch = messageText.match(/0x[0-9a-fA-F]{10,}/);
      if (alternativeMatch) {
        positionId = alternativeMatch[0];
      } else {
        await ctx.answerCallbackQuery("❌ Unable to determine position ID.");
        return;
      }
    }

    try {
      // Get account for all operations
      const { getAccount } = await import("./utils/getAccount");
      const account = await getAccount(env.PRIVATE_KEY);
      const userAddress = account.accountAddress.toString();

      // Handle different button actions
      if (data === "remove_50" || data === "remove_100") {
        const isRemove50 = data === "remove_50";
        const removePercentage = isRemove50 ? 50 : 100;
        const removeRatio = isRemove50 ? 0.5 : 1.0;

        await ctx.answerCallbackQuery(`🔄 Removing ${removePercentage}% liquidity...`);
        await ctx.reply(`🔄 **Removing ${removePercentage}% Liquidity**\n\n📍 Position ID: \`${positionId}\`\n\n⏳ Processing transaction...`, { parse_mode: "Markdown" });

        const { getRemoveLiquidityPayload } = await import("./libs/hyperion/removeLiquidity");
        const payload = await getRemoveLiquidityPayload(userAddress, positionId, removeRatio, env);

        const { executeTransaction } = await import("./libs/hyperion/executeTransaction");
        const result = await executeTransaction(payload, account, `remove ${removePercentage}% liquidity`);

        const successMessage = `✅ **Liquidity Removal Successful!**\n\n` +
          `📍 Position ID: \`${positionId}\`\n` +
          `💧 Removed: ${removePercentage}%\n` +
          `🔗 Transaction: \`${result.transactionHash}\`\n\n` +
          `💡 Tokens have been returned to your wallet`;
        
        await ctx.reply(successMessage, { parse_mode: "Markdown" });

      } else if (data.startsWith("ratio_")) {
        // Handle ratio check button
        await ctx.answerCallbackQuery("📊 Calculating optimal ratio...");

        // Get pool ID from position
        const { getAllPositions } = await import("./libs/hyperion/read");
        const positions = await getAllPositions(userAddress, env);
        const position = positions.find(p => p.position.objectId === positionId);
        
        if (!position) {
          await ctx.reply("❌ Position not found for ratio calculation.");
          return;
        }

        const poolId = position.position.pool.poolId;
        const { generateRatioResponse } = await import("./libs/hyperion/read");
        const response = await generateRatioResponse(env, userAddress, poolId);
        
        await ctx.reply(`📊 **Ratio Check for Position**\n\n📍 Position ID: \`${positionId}\`\n\n${response.text}`, { parse_mode: "Markdown" });

      } else if (data.startsWith("maxA_") || data.startsWith("maxB_")) {
        // Handle max token amount liquidity - simple direct approach
        const isTokenA = data.startsWith("maxA_");
        
        // Answer callback query immediately
        await ctx.answerCallbackQuery(`💧 Adding max ${isTokenA ? 'Token A' : 'Token B'} liquidity...`);

        // Simple direct execution
        await handleMaxTokenLiquidity(positionId, isTokenA, userAddress, env, ctx);

      } else {
        await ctx.answerCallbackQuery("❌ Unknown action");
      }

    } catch (error) {
      console.error("Error in callback handler:", error);
      await ctx.answerCallbackQuery("❌ Error processing request");
      await ctx.reply(`❌ **Error Processing Request**\n\nPosition ID: \`${positionId}\`\nError: ${error}\n\nPlease try again later.`, { parse_mode: "Markdown" });
    }
  });

  bot.on("message:text", async (ctx) => {
    await ctx.reply(`You sent: ${ctx.message.text}\n\nUse /start to see available commands.`);
  });

  return bot;
}

/**
 * Handle max token liquidity - minimal fast approach
 */
async function handleMaxTokenLiquidity(
  positionId: string,
  isTokenA: boolean,
  userAddress: string,
  env: any,
  ctx: any
) {
  try {
    // Get account
    const { getAccount } = await import("./utils/getAccount");
    const account = await getAccount(env.PRIVATE_KEY);

    // Get position info
    const { getAllPositions } = await import("./libs/hyperion/read");
    const positions = await getAllPositions(userAddress, env);
    const position = positions.find(p => p.position.objectId === positionId);
    
    if (!position) {
      await ctx.reply("❌ Position not found for liquidity addition.");
      return;
    }

    const pool = position.position.pool;
    const token1Symbol = pool.token1Info.symbol;
    const token2Symbol = pool.token2Info.symbol;
    
    // Send status message
    await ctx.reply(`💧 **Adding Max ${isTokenA ? token1Symbol : token2Symbol} Liquidity**\n\n📍 Position ID: \`${positionId}\`\n\n⏳ Getting balances...`, { parse_mode: "Markdown" });

    // Get current balances
    const { fetchWalletBalances } = await import("./libs/tokenBalances");
    const walletBalances = await fetchWalletBalances(userAddress);
    
    const token1Balance = walletBalances.balances.find(b => b.symbol === token1Symbol);
    const token2Balance = walletBalances.balances.find(b => b.symbol === token2Symbol);
    
    if (!token1Balance || !token2Balance) {
      await ctx.reply(`❌ Cannot find balances for ${token1Symbol}/${token2Symbol}`);
      return;
    }

    // Use 90% of the max token, calculate the other
    const maxToken1 = token1Balance.amount * 0.9;
    const maxToken2 = token2Balance.amount * 0.9;
    
    // Initialize SDK
    const { Network } = await import("@aptos-labs/ts-sdk");
    const { initHyperionSDK } = await import("@hyperionxyz/sdk");
    const sdk = initHyperionSDK({
      network: Network.MAINNET,
      APTOS_API_KEY: env.APTOS_API_KEY
    });

    // Get position details for tick range and fee tier
    const detailedPosition = await sdk.Position.fetchPositionById({
      positionId: positionId,
      address: userAddress,
    });

    const positionData = detailedPosition[0];
    const tickLower = positionData.position?.tickLower || positionData.tickLower;
    const tickUpper = positionData.position?.tickUpper || positionData.tickUpper;
    const feeTierIndex = positionData.position?.pool?.feeTier || positionData.pool?.feeTier || 1;

    // Get ratio data for token addresses and decimals
    const { generateRatioResponse } = await import("./libs/hyperion/read");
    const ratioResponse = await generateRatioResponse(env, userAddress, pool.poolId, null);
    const ratioData = ratioResponse.data!;

    let finalToken1Amount: number;
    let finalToken2Amount: number;

    if (isTokenA) {
      // Max Token A (Token1), calculate required Token B (Token2)
      finalToken1Amount = maxToken1;
      const token1AmountRaw = Math.floor(finalToken1Amount * (10 ** ratioData.token1Decimals));
      
      const [_, requiredToken2Raw] = await sdk.Pool.estCurrencyBAmountFromA({
        currencyA: ratioData.token1Address,
        currencyB: ratioData.token2Address,
        currencyAAmount: token1AmountRaw,
        feeTierIndex,
        tickLower,
        tickUpper,
        currentPriceTick: ratioData.currentTick,
      });

      finalToken2Amount = Number(requiredToken2Raw) / (10 ** ratioData.token2Decimals);
      
      if (finalToken2Amount > maxToken2) {
        await ctx.reply(`❌ Insufficient ${token2Symbol}: need ${finalToken2Amount.toFixed(6)}, have ${maxToken2.toFixed(6)}`);
        return;
      }
    } else {
      // Max Token B (Token2), calculate required Token A (Token1)
      finalToken2Amount = maxToken2;
      const token2AmountRaw = Math.floor(finalToken2Amount * (10 ** ratioData.token2Decimals));
      
      const [requiredToken1Raw, _] = await sdk.Pool.estCurrencyAAmountFromB({
        currencyA: ratioData.token1Address,
        currencyB: ratioData.token2Address,
        currencyBAmount: token2AmountRaw,
        feeTierIndex,
        tickLower,
        tickUpper,
        currentPriceTick: ratioData.currentTick,
      });

      finalToken1Amount = Number(requiredToken1Raw) / (10 ** ratioData.token1Decimals);
      
      if (finalToken1Amount > maxToken1) {
        await ctx.reply(`❌ Insufficient ${token1Symbol}: need ${finalToken1Amount.toFixed(6)}, have ${maxToken1.toFixed(6)}`);
        return;
      }
    }

    await ctx.reply(`💧 **Adding Liquidity**\n• ${token1Symbol}: ${finalToken1Amount.toFixed(6)}\n• ${token2Symbol}: ${finalToken2Amount.toFixed(6)}\n\n⏳ Executing transaction...`, { parse_mode: "Markdown" });

    // Convert APT addresses for transaction
    const convertAPTAddressForTransaction = (address: string): string => {
      if (address === '0x000000000000000000000000000000000000000000000000000000000000000a' || address === '0xa') {
        return '0x1::aptos_coin::AptosCoin';
      }
      return address;
    };

    const transactionToken1Address = convertAPTAddressForTransaction(ratioData.token1Address);
    const transactionToken2Address = convertAPTAddressForTransaction(ratioData.token2Address);
    
    const finalToken1AmountRaw = Math.floor(finalToken1Amount * (10 ** ratioData.token1Decimals));
    const finalToken2AmountRaw = Math.floor(finalToken2Amount * (10 ** ratioData.token2Decimals));

    // Create add liquidity payload
    const addLiquidityParams = {
      positionId: positionId,
      currencyA: transactionToken1Address,
      currencyB: transactionToken2Address,
      currencyAAmount: finalToken1AmountRaw,
      currencyBAmount: finalToken2AmountRaw,
      slippage: 0.1,
      feeTierIndex,
    };

    const payload = await sdk.Position.addLiquidityTransactionPayload(addLiquidityParams);
    
    // Execute transaction
    const { executeTransaction } = await import("./libs/hyperion/executeTransaction");
    const result = await executeTransaction(payload, account, 'max token liquidity');

    const successMessage = `✅ **Max ${isTokenA ? token1Symbol : token2Symbol} Liquidity Added!**\n\n` +
      `💧 Added: ${finalToken1Amount.toFixed(6)} ${token1Symbol} + ${finalToken2Amount.toFixed(6)} ${token2Symbol}\n` +
      `🔗 Transaction: \`${result.transactionHash}\`\n\n` +
      `📍 Position ID: \`${positionId}\``;
    
    await ctx.reply(successMessage, { parse_mode: "Markdown" });
    
  } catch (error) {
    console.error("Error in handleMaxTokenLiquidity:", error);
    await ctx.reply(`❌ **Max Token Liquidity Failed**\n\nPosition ID: \`${positionId}\`\nError: ${String(error)}`, { parse_mode: "Markdown" });
  }
}

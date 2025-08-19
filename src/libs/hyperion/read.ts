import type { Env } from '../../env';

export interface HyperionPosition {
  isActive: boolean;
  value: string;
  farm: {
    claimed: unknown[];
    unclaimed: Array<{
      amount: string;
      amountUSD: string;
      token: string;
    }>;
  };
  fees: {
    claimed: unknown[];
    unclaimed: Array<{
      amount: string;
      amountUSD: string;
      token: string;
    }>;
  };
  position: {
    objectId: string;
    poolId: string;
    tickLower: number;
    tickUpper: number;
    createdAt: string;
    pool: {
      currentTick: number;
      feeRate: string;
      feeTier: number;
      poolId: string;
      senderAddress: string;
      sqrtPrice: string;
      token1: string;
      token2: string;
      token1Info: {
        assetType: string;
        bridge: string | null;
        coinMarketcapId: string;
        coinType: string | null;
        coingeckoId: string;
        decimals: number;
        faType: string;
        hyperfluidSymbol: string;
        logoUrl: string;
        name: string;
        symbol: string;
        isBanned: boolean;
        websiteUrl: string | null;
      };
      token2Info: {
        assetType: string;
        bridge: string | null;
        coinMarketcapId: string;
        coinType: string | null;
        coingeckoId: string;
        decimals: number;
        faType: string;
        hyperfluidSymbol: string;
        logoUrl: string;
        name: string;
        symbol: string;
        isBanned: boolean;
        websiteUrl: string | null;
      };
    };
  };
}

export interface TokenBalance {
  amount: number;
  symbol: string;
  decimals: number;
}

export interface RatioResponseData {
  // Pool identifiers
  poolId: string;
  token1Address: string;
  token2Address: string;
  token1Symbol: string;
  token2Symbol: string;

  // Pool parameters
  currentTick: number;
  feeTierIndex: number;
  tickLower: number;
  tickUpper: number;

  // Display info
  feeRate: number;
  feeAPR: number;
  farmAPR: number;
  tvlUSD: string;
  liquidityRatio: number;
  marketPrice: number;

  // User balances
  token1Balance: number;
  token2Balance: number;
  availableToken1: number; // After gas reserve

  // Token info for calculations
  token1Decimals: number;
  token2Decimals: number;

  // Pre-calculated swap parameters (if swap needed)
  swapAmount?: number;
  swapAmountRaw?: number;
  swapFromToken?: string;
  swapToToken?: string;
  swapFromSymbol?: string;
  swapToSymbol?: string;
}

export interface RatioResponse {
  text: string;
  data: RatioResponseData | null;
}

/**
 * Fetch token balance for a specific asset type with enhanced error handling
 */
export async function fetchTokenBalance(ownerAddress: string, assetType: string): Promise<TokenBalance> {
  const maxRetries = 1; // Reduced from 2 to 1 to avoid Cloudflare subrequest limits
  const retryDelay = 4000; // Increased from 2.5 to 4 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`💰 Fetching ${assetType} balance (attempt ${attempt}/${maxRetries})...`);
      
      // Lazy import heavy SDK
      const { Aptos, AptosConfig, Network } = await import("@aptos-labs/ts-sdk");

      const config = new AptosConfig({ network: Network.MAINNET });
      const aptos = new Aptos(config);

      // Get the fungible asset balance
      const balance = await aptos.getCurrentFungibleAssetBalances({
        options: {
          where: {
            owner_address: { _eq: ownerAddress },
            asset_type: { _eq: assetType }
          }
        }
      });

      if (!balance || balance.length === 0) {
        console.log(`✅ No balance found for ${assetType} (likely 0 balance)`);
        return { amount: 0, symbol: 'Unknown', decimals: 8 };
      }

      const assetBalance = balance[0];

      // Get metadata for the fungible asset
      const metadata = await aptos.getFungibleAssetMetadata({
        options: {
          where: {
            asset_type: { _eq: assetType }
          }
        }
      });

      const rawAmount = Number(assetBalance.amount);
      const decimals = metadata[0]?.decimals || 8;
      const symbol = metadata[0]?.symbol || 'Unknown';

      // Convert from raw amount to decimal amount
      const amount = rawAmount / 10 ** decimals;

      console.log(`✅ ${symbol} balance fetched: ${amount}`);
      return {
        amount,
        symbol,
        decimals
      };

    } catch (error) {
      console.error(`❌ Error fetching balance for ${assetType} (attempt ${attempt}/${maxRetries}):`, error);
      
      // Parse the error message to provide better insights
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Unexpected token')) {
        console.log(`🔍 API returned HTML instead of JSON - likely service issue`);
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        console.log(`⏰ Request timeout - API might be slow`);
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
        console.log(`🌐 Network connection issue`);
      }
      
      // If this is the last attempt, return fallback
      if (attempt === maxRetries) {
        console.log(`💥 All token balance fetch attempts failed for ${assetType}, returning 0 balance`);
        return { amount: 0, symbol: 'Unknown', decimals: 8 };
      }
      
      // Wait before retry
      console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  // This should never be reached, but adding for safety
  return { amount: 0, symbol: 'Unknown', decimals: 8 };
}

/**
 * Fetch APT balance specifically with enhanced error handling
 */
export async function fetchAPTBalance(ownerAddress: string): Promise<TokenBalance> {
  const maxRetries = 1; // Reduced from 2 to 1 to avoid Cloudflare subrequest limits
  const retryDelay = 4000; // Increased from 3 to 4 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`💰 Fetching APT balance (attempt ${attempt}/${maxRetries})...`);
      
      // Lazy import heavy SDK
      const { Aptos, AptosConfig, Network } = await import("@aptos-labs/ts-sdk");

      const config = new AptosConfig({ 
        network: Network.MAINNET
      });
      const aptos = new Aptos(config);

      const accountAPTAmount = await aptos.getAccountAPTAmount({
        accountAddress: ownerAddress
      });

      // Convert from octas to APT (APT has 8 decimals)
      const amount = accountAPTAmount / 10 ** 8;

      console.log(`✅ APT balance fetched: ${amount} APT`);
      return {
        amount,
        symbol: 'APT',
        decimals: 8
      };

    } catch (error) {
      console.error(`❌ Error fetching APT balance (attempt ${attempt}/${maxRetries}):`, error);
      
      // Parse the error message to provide better insights
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('Unexpected token')) {
        console.log(`🔍 API returned HTML instead of JSON - likely service issue`);
      } else if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
        console.log(`⏰ Request timeout - API might be slow`);
      } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
        console.log(`🌐 Network connection issue`);
      }
      
      // If this is the last attempt, return fallback
      if (attempt === maxRetries) {
        console.log(`💥 All APT balance fetch attempts failed, returning 0 balance`);
        return {
          amount: 0,
          symbol: 'APT',
          decimals: 8
        };
      }
      
      // Wait before retry
      console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  // This should never be reached, but adding for safety
  return {
    amount: 0,
    symbol: 'APT',
    decimals: 8
  };
}

/**
 * Fetch user token balances for two specific tokens
 */
export async function fetchUserTokenBalances(userAddress: string, tokenA: string, tokenB: string): Promise<{ balanceA: number; balanceB: number }> {
  try {
    console.log('💰 Fetching token balances...');
    console.log(`📍 Address: ${userAddress}`);
    console.log(`🪙 Token A (FA): ${tokenA}`);
    console.log(`🪙 Token B (FA): ${tokenB}`);

    // Special handling for APT (always use native coin balance for actual APT)
    let balanceA: TokenBalance;
    if (tokenA === '0x000000000000000000000000000000000000000000000000000000000000000a') {
      // This is APT - use native coin balance directly since that's where the real balance is
      balanceA = await fetchAPTBalance(userAddress);
      console.log(`✅ APT balance: ${balanceA.amount} ${balanceA.symbol} (${balanceA.decimals} decimals)`);
    } else {
      // Regular FA token
      balanceA = await fetchTokenBalance(userAddress, tokenA);
      console.log(`✅ Token A balance: ${balanceA.amount} ${balanceA.symbol} (${balanceA.decimals} decimals)`);
    }

    // Fetch balance for Token B (usually an FA token)
    const balanceB = await fetchTokenBalance(userAddress, tokenB);
    console.log(`✅ Token B balance: ${balanceB.amount} ${balanceB.symbol} (${balanceB.decimals} decimals)`);

    console.log(`📊 Final balances - A: ${balanceA.amount}, B: ${balanceB.amount}`);

    return {
      balanceA: balanceA.amount,
      balanceB: balanceB.amount,
    };
  } catch (error) {
    console.error("❌ Error fetching balances:", error);
    console.log("🔄 Falling back to mock data for testing...");

    // Fallback to mock data if fetch fails
    return {
      balanceA: 100, // Fallback mock data
      balanceB: 50   // Fallback mock data
    };
  }
}

/**
 * Get all positions for a user address
 */
export async function getAllPositions(userAddress: string, env: Env): Promise<HyperionPosition[]> {
  try {
    console.log('🚀 Initializing Hyperion SDK...');

    const apiKey = env.APTOS_API_KEY;
    if (!apiKey) {
      throw new Error('APTOS_API_KEY environment variable is not set.');
    }

    const { initHyperionSDK } = await import("@hyperionxyz/sdk");
    const { Aptos, AptosConfig, Network } = await import("@aptos-labs/ts-sdk");

    const sdk = initHyperionSDK({
      network: Network.MAINNET,
      APTOS_API_KEY: apiKey,
    });

    console.log('📡 Fetching all positions for address:', userAddress);

    const positions: HyperionPosition[] = await sdk.Position.fetchAllPositionsByAddress({
      address: userAddress
    });

    console.log('✅ Successfully fetched positions!');
    console.log('📊 Total positions found:', positions.length);

    return positions;

  } catch (error) {
    console.error('❌ Error fetching positions:', error);
    if (error instanceof Error) {
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
    }
    throw error;
  }
}

/**
 * Filter positions that need rebalancing based on position type and token balance percentage
 * For rangePercent = null (tightest range): only rebalance when inactive or token reaches 0%
 * For rangePercent != null (custom range): rebalance when one token reaches < 10%
 */
export async function filterInactivePositions(positions: HyperionPosition[], env: any, poolConfigs?: Array<{poolId: string, rangePercent: number | null}>): Promise<HyperionPosition[]> {
  const { initHyperionSDK } = await import("@hyperionxyz/sdk");
  const { Network } = await import("@aptos-labs/ts-sdk");

  const sdk = initHyperionSDK({
    network: Network.MAINNET,
    APTOS_API_KEY: env.APTOS_API_KEY
  });

  const positionsToRebalance: HyperionPosition[] = [];

  for (const pos of positions) {
    const { objectId, tickLower, tickUpper, pool } = pos.position;
    const currentTick = pool.currentTick;

    try {
      // Find the pool configuration for this position
      const poolConfig = poolConfigs?.find(config => 
        config.poolId.toLowerCase() === pool.poolId.toLowerCase()
      );
      const rangePercent = poolConfig?.rangePercent;

      // Convert sqrtPrice to price
      const sqrtPriceDecimal = Number(pool.sqrtPrice) / 2 ** 64;
      const decimalsRatio = 10 ** (pool.token1Info.decimals - pool.token2Info.decimals);
      const price = (sqrtPriceDecimal ** 2) * decimalsRatio;

      // Fetch token balances for this position
      let token1Amount = 0;
      let token2Amount = 0;
      try {
        const [t1, t2] = await sdk.Position.fetchTokensAmountByPositionId({ positionId: objectId });
        token1Amount = t1 / 10 ** pool.token1Info.decimals;
        token2Amount = t2 / 10 ** pool.token2Info.decimals;
      } catch (e) {
        console.error(`Failed to fetch token amounts for position ${objectId}:`, e);
        continue;
      }

      // Calculate token percentages
      const valueToken1InToken2 = token1Amount * price;
      const valueToken2InToken2 = token2Amount;
      const totalValueInToken2 = valueToken1InToken2 + valueToken2InToken2;
      const pctToken1 = totalValueInToken2 > 0 ? (valueToken1InToken2 / totalValueInToken2) * 100 : 0;
      const pctToken2 = totalValueInToken2 > 0 ? (valueToken2InToken2 / totalValueInToken2) * 100 : 0;

      // Check if position is active
      const isActive = tickLower < currentTick && currentTick < tickUpper;

      // Different rebalancing logic based on range type
      let needsRebalancing = false;
      let rebalanceReason = '';

      if (rangePercent === null) {
        // Tightest range positions: only rebalance when inactive or token reaches 0%
        if (!isActive) {
          needsRebalancing = true;
          rebalanceReason = 'Position inactive (outside range)';
        } else if (pctToken1 === 0 || pctToken2 === 0) {
          needsRebalancing = true;
          rebalanceReason = `${pctToken1 === 0 ? pool.token1Info.symbol : pool.token2Info.symbol} = 0%`;
        }
      } else {
        // Custom range positions: rebalance when one token reaches < 10%
        if (pctToken1 < 10 || pctToken2 < 10) {
          needsRebalancing = true;
          rebalanceReason = `${pctToken1 < 10 ? `${pool.token1Info.symbol} < 10%` : `${pool.token2Info.symbol} < 10%`}`;
        }
      }

      if (needsRebalancing) {
        console.log(`🔄 Position ${objectId} needs rebalancing:`);
        console.log(`  Pool: ${pool.token1Info.symbol}/${pool.token2Info.symbol}`);
        console.log(`  Range Type: ${rangePercent === null ? 'Tightest' : `±${rangePercent}%`}`);
        console.log(`  Status: ${isActive ? 'Active' : 'Inactive'}`);
        console.log(`  Token 1: ${token1Amount.toFixed(2)} ${pool.token1Info.symbol} (${pctToken1.toFixed(2)}%)`);
        console.log(`  Token 2: ${token2Amount.toFixed(2)} ${pool.token2Info.symbol} (${pctToken2.toFixed(2)}%)`);
        console.log(`  Reason: ${rebalanceReason}`);
        
        positionsToRebalance.push(pos);
      }
    } catch (error) {
      console.error(`Error analyzing position ${objectId}:`, error);
      // If we can't analyze the position, fall back to the old logic
      const isActive = tickLower < currentTick && currentTick < tickUpper;
      if (!isActive) {
        console.log(`🔄 Position ${objectId} needs rebalancing (fallback - inactive)`);
        positionsToRebalance.push(pos);
      }
    }
  }

  return positionsToRebalance;
}

/**
 * Filter active positions from a list of positions
 */
export function filterActivePositions(positions: HyperionPosition[]): HyperionPosition[] {
  return positions.filter((pos) => {
    const { tickLower, tickUpper, pool } = pos.position;
    const currentTick = pool.currentTick;
    const isActive = tickLower < currentTick && currentTick < tickUpper;
    return isActive; // We want active positions
  });
}

/**
 * Generate a formatted positions response for Telegram
 */
export async function generatePositionsResponse(env: Env, address: string, poolConfigs?: Array<{poolId: string, rangePercent: number | null}>): Promise<{ message: string; hasInactive: boolean }> {
  // Lazy import heavy SDK
  const { initHyperionSDK } = await import("@hyperionxyz/sdk");
  const { Network } = await import("@aptos-labs/ts-sdk");

  const sdk = initHyperionSDK({
    network: Network.MAINNET,
    APTOS_API_KEY: env.APTOS_API_KEY
  });

  try {
    const positions: HyperionPosition[] = await sdk.Position.fetchAllPositionsByAddress({ address });

    // Fetch wallet balances with USD values in parallel
    console.log("💰 Fetching wallet balances with USD values...");
    const { fetchWalletBalancesWithUSD, formatWalletBalancesWithUSD } = await import("../tokenBalances");
    const walletBalances = await fetchWalletBalancesWithUSD(address);

    if (positions.length === 0) {
      // Include wallet balances even if no positions
      const walletSection = await formatWalletBalancesWithUSD(walletBalances);
      return {
        message: `📊 *Portfolio for* \`${address}\`\n\n${walletSection}\n\n❌ No Hyperion positions found`,
        hasInactive: false
      };
    }

    let response = `📊 *Portfolio for* \`${address}\`\n\n`;

    // Add wallet balances section with USD values at the top
    const walletSection = await formatWalletBalancesWithUSD(walletBalances);
    response += `${walletSection}\n\n`;

    // Add positions header
    response += `🔄 **Hyperion Positions (${positions.length}):**\n\n`;

    let hasInactive = false;

    for (let index = 0; index < positions.length; index++) {
      const pos = positions[index];
      const { objectId, tickLower, tickUpper, pool } = pos.position;
      const currentTick = pool.currentTick;

      // Convert sqrtPrice to price
      const sqrtPriceDecimal = Number(pool.sqrtPrice) / 2 ** 64;
      const decimalsRatio = 10 ** (pool.token1Info.decimals - pool.token2Info.decimals);
      const price = (sqrtPriceDecimal ** 2) * decimalsRatio;

      // Fetch token balances for this position
      let token1Amount = 0;
      let token2Amount = 0;
      try {
        const [t1, t2] = await sdk.Position.fetchTokensAmountByPositionId({ positionId: objectId });
        token1Amount = t1 / 10 ** pool.token1Info.decimals;
        token2Amount = t2 / 10 ** pool.token2Info.decimals;
      } catch (_e) { }

      // Value in terms of token2
      const valueToken1InToken2 = token1Amount * price;
      const valueToken2InToken2 = token2Amount;
      const totalValueInToken2 = valueToken1InToken2 + valueToken2InToken2;
      const pctToken1 = totalValueInToken2 > 0 ? (valueToken1InToken2 / totalValueInToken2) * 100 : 0;
      const pctToken2 = totalValueInToken2 > 0 ? (valueToken2InToken2 / totalValueInToken2) * 100 : 0;

      // Find the pool configuration for this position
      const poolConfig = poolConfigs?.find(config => 
        config.poolId.toLowerCase() === pool.poolId.toLowerCase()
      );
      const rangePercent = poolConfig?.rangePercent;

      const isActive = tickLower < currentTick && currentTick < tickUpper;
      
      // Different rebalancing logic based on range type (same as filterInactivePositions)
      let needsRebalancing = false;
      
      if (rangePercent === null) {
        // Tightest range positions: only rebalance when inactive or token reaches 0%
        if (!isActive) {
          needsRebalancing = true;
        } else if (pctToken1 === 0 || pctToken2 === 0) {
          needsRebalancing = true;
        }
      } else {
        // Custom range positions: rebalance when one token reaches < 10%
        if (pctToken1 < 10 || pctToken2 < 10) {
          needsRebalancing = true;
        }
      }
      
      if (!isActive || needsRebalancing) {
        hasInactive = true;
      }
      // Determine status display
      let statusDot = '🟢';
      let statusText = 'Active';
      
      if (!isActive) {
        statusDot = '🔴';
        statusText = 'Inactive';
      } else if (needsRebalancing) {
        statusDot = '🟡';
        statusText = `Active (Needs Rebalancing - ${rangePercent === null ? 'Token Depleted' : 'Low Balance'})`;
      }

      response += `*Position ${index + 1}:*\n` +
        `🔄 Pool: ${pool.token1Info.symbol}/${pool.token2Info.symbol}\n` +
        `${statusDot} Status: ${statusText}\n` +
        `💧 Liquidity Value: $${Number(pos.value).toFixed(2)}\n` +
        `📊 Range: [${tickLower}, ${tickUpper}], Current Tick: ${currentTick}\n` +
        `💸 Price: 1 ${pool.token1Info.symbol} = ${price.toFixed(4)} ${pool.token2Info.symbol}\n` +
        `💎 Token 1: ${token1Amount.toFixed(2)} ${pool.token1Info.symbol} (${pctToken1.toFixed(2)}%)\n` +
        `💎 Token 2: ${token2Amount.toFixed(2)} ${pool.token2Info.symbol} (${pctToken2.toFixed(2)}%)\n` +
        `💰 Unclaimed Fees: $${(pos.fees?.unclaimed ?? []).reduce((sum, fee) => sum + Number(fee.amountUSD), 0).toFixed(2)}\n` +
        `🌾 Unclaimed Farm Rewards: $${(pos.farm?.unclaimed ?? []).reduce((sum, farm) => sum + Number(farm.amountUSD), 0).toFixed(2)}\n\n`;
    }

    return { message: response, hasInactive };
  } catch (error) {
    console.error("Error fetching positions:", error);
    return {
      message: "❌ Error fetching portfolio data. Please check the address and try again.",
      hasInactive: false
    };
  }
}

/**
 * Generate a formatted pools response for Telegram
 */
export async function generatePoolsResponse(env: Env): Promise<string> {
  // Lazy import heavy SDK
  const { initHyperionSDK } = await import("@hyperionxyz/sdk");
  const { Network } = await import("@aptos-labs/ts-sdk");

  const sdk = initHyperionSDK({
    network: Network.MAINNET,
    APTOS_API_KEY: env.APTOS_API_KEY
  });

  try {
    const poolItems = await sdk.Pool.fetchAllPools();

    // Filter pools with non-zero farm APR
    const poolsWithFarmAPR = poolItems.filter((pool: { farmAPR?: string }) =>
      pool.farmAPR && pool.farmAPR !== "0" && Number.parseFloat(pool.farmAPR) > 0
    );

    if (poolsWithFarmAPR.length === 0) {
      return "❌ No pools found with Farm APR > 0";
    }

    // Sort by total APR (fee + farm) descending
    const sortedPools = poolsWithFarmAPR.sort((a: { feeAPR?: string; farmAPR?: string }, b: { feeAPR?: string; farmAPR?: string }) => {
      const totalAprA = Number.parseFloat(a.feeAPR || '0') + Number.parseFloat(a.farmAPR || '0');
      const totalAprB = Number.parseFloat(b.feeAPR || '0') + Number.parseFloat(b.farmAPR || '0');
      return totalAprB - totalAprA;
    });

    let response = `🌾 *Farm Pools (${sortedPools.length} total)*\n_Sorted by Total APR_\n\n`;

    // Show top 10 pools to avoid message length limits
    const displayPools = sortedPools.slice(0, 10);

    for (let i = 0; i < displayPools.length; i++) {
      const pool = displayPools[i];
      const poolId = pool.pool?.poolId || 'N/A';
      const token1Symbol = pool.pool?.token1Info?.symbol || 'Unknown';
      const token2Symbol = pool.pool?.token2Info?.symbol || 'Unknown';
      const _token1AssetType = pool.pool?.token1Info?.assetType || 'N/A';
      const _token2AssetType = pool.pool?.token2Info?.assetType || 'N/A';
      const feeAPR = Number.parseFloat(pool.feeAPR || '0');
      const farmAPR = Number.parseFloat(pool.farmAPR || '0');
      const totalAPR = feeAPR + farmAPR;
      const tvl = Number.parseFloat(pool.tvlUSD || '0');
      const _feeTier = pool.pool?.feeTier;
      const currentTick = pool.pool?.currentTick;

      response += `*${i + 1}. ${token1Symbol}/${token2Symbol}*\n` +
        `🎯 Total APR: *${totalAPR.toFixed(2)}%* (Fee: ${feeAPR.toFixed(2)}%, Farm: ${farmAPR.toFixed(2)}%)\n` +
        `💰 TVL: $${tvl.toLocaleString()}\n` +
        `📍 Current Tick: ${currentTick !== undefined ? currentTick : 'N/A'}\n` +
        `🆔 Pool ID: \`/addliquidity ${poolId}\`\n\n`;
    }

    if (sortedPools.length > 10) {
      response += `_... and ${sortedPools.length - 10} more pools_\n\n`;
    }

    response += "💡 *Tips:*\n" +
      "• Tap Pool ID to copy complete /addliquidity command\n" +
      "• Use /ratio command for optimal liquidity calculations";

    return response;
  } catch (error) {
    console.error("Error fetching pools:", error);
    return "❌ Error fetching pools. Please try again later.";
  }
}


/**
 * Calculate optimal ratio data for swaps and pool creation
 */
export async function calculateOptimalRatioData(
  env: Env,
  address: string,
  poolId?: string,
  rangePercent?: number | null
): Promise<RatioResponseData | null> {
  // Lazy import heavy SDKs
  const { FeeTierIndex, initHyperionSDK, priceToTick } = await import("@hyperionxyz/sdk");
  const { Network } = await import("@aptos-labs/ts-sdk");

  const defaultPoolId = '0x925660b8618394809f89f8002e2926600c775221f43bf1919782b297a79400d8';
  const targetPoolId = poolId || defaultPoolId;
  const gasReserveAPT = 1.0;

  const sdk = initHyperionSDK({
    network: Network.MAINNET,
    APTOS_API_KEY: env.APTOS_API_KEY
  });

  try {
    // Fetch and validate pool data
    const pool = await sdk.Pool.fetchPoolById({ poolId: targetPoolId });
    if (!pool?.[0]?.pool) return null;

    const poolInfo = pool[0].pool;
    const poolData = pool[0];

    // Extract pool properties
    const {
      currentTick,
      feeRate: feeRateStr = '3000',
      sqrtPrice,
      token1,
      token2,
      token1Info,
      token2Info
    } = poolInfo;

    const feeRate = Number.parseInt(feeRateStr);
    const feeAPR = Number.parseFloat(poolData.feeAPR || '0');
    const farmAPR = Number.parseFloat(poolData.farmAPR || '0');
    const { symbol: token1Symbol = 'Token1', decimals: token1Decimals } = token1Info;
    const { symbol: token2Symbol = 'Token2', decimals: token2Decimals } = token2Info;

    // Fee tier configuration with proper typing
    type FeeConfigType = Record<number, { index: number; spacing: number; tier: number }>;
    const feeConfig: FeeConfigType = {
      100: { index: FeeTierIndex["PER_0.01_SPACING_1"], spacing: 1, tier: 0 },
      500: { index: FeeTierIndex["PER_0.05_SPACING_5"], spacing: 5, tier: 1 },
      3000: { index: FeeTierIndex["PER_0.3_SPACING_60"], spacing: 60, tier: 2 },
      10000: { index: FeeTierIndex.PER_1_SPACING_200, spacing: 200, tier: 3 }
    };

    const { index: feeTierIndex, spacing: tickSpacing } = feeConfig[feeRate] || feeConfig[3000];

    // Calculate market price
    const sqrtPriceDecimal = Number(sqrtPrice) / 2 ** 64;
    const decimalsRatio = 10 ** (token1Decimals - token2Decimals);
    const marketPrice = (sqrtPriceDecimal ** 2) * decimalsRatio;

    // Calculate tick range
    let tickLower: number;
    let tickUpper: number;

    if (rangePercent !== null && rangePercent !== undefined) {
      const priceDelta = rangePercent / 100;
      const lowerPrice = marketPrice * (1 - priceDelta);
      const upperPrice = marketPrice * (1 + priceDelta);

      const rawTickLower = Number(priceToTick({ price: lowerPrice, feeTierIndex, decimalsRatio }) || 0);
      const rawTickUpper = Number(priceToTick({ price: upperPrice, feeTierIndex, decimalsRatio }) || 0);

      tickLower = Math.floor(rawTickLower / tickSpacing) * tickSpacing;
      tickUpper = Math.ceil(rawTickUpper / tickSpacing) * tickSpacing;
    } else {
      tickLower = Math.floor((currentTick - tickSpacing) / tickSpacing) * tickSpacing;
      tickUpper = Math.ceil((currentTick + tickSpacing) / tickSpacing) * tickSpacing;
    }

    // Fetch user balances with retry and validation
    let token1Balance = 0;
    let token2Balance = 0;
    let balanceFetchAttempts = 0;
    const maxBalanceFetchAttempts = 3;
    
    while (balanceFetchAttempts < maxBalanceFetchAttempts) {
      try {
        balanceFetchAttempts++;
        console.log(`💰 Fetching balances (attempt ${balanceFetchAttempts}/${maxBalanceFetchAttempts})...`);
        
        const balance1 = token1 === '0x000000000000000000000000000000000000000000000000000000000000000a'
          ? await fetchAPTBalance(address)
          : await fetchTokenBalance(address, token1);
        const balance2 = token2 === '0x000000000000000000000000000000000000000000000000000000000000000a'
          ? await fetchAPTBalance(address)
          : await fetchTokenBalance(address, token2);

        token1Balance = balance1.amount;
        token2Balance = balance2.amount;
        
        console.log(`📊 Balance fetch result: ${token1Symbol}: ${token1Balance}, ${token2Symbol}: ${token2Balance}`);
        
        // CRITICAL: Validate balances to prevent dangerous swaps
        // For APT/stkAPT pool, if one balance is 0 but we had tokens before, retry
        if ((token1Symbol === 'APT' && token2Symbol === 'stkAPT') || 
            (token1Symbol === 'stkAPT' && token2Symbol === 'APT')) {
          
          const hasToken1 = token1Balance > 0.001; // Minimum threshold
          const hasToken2 = token2Balance > 0.001; // Minimum threshold
          
          console.log(`🔍 APT/stkAPT Balance Check: ${token1Symbol}=${hasToken1}, ${token2Symbol}=${hasToken2}`);
          
          // If one balance is suspiciously low and this isn't the last attempt, retry
          if ((!hasToken1 || !hasToken2) && balanceFetchAttempts < maxBalanceFetchAttempts) {
            console.log(`⚠️ Suspicious balance detected - ${token1Symbol}: ${token1Balance}, ${token2Symbol}: ${token2Balance}. Retrying...`);
            
            // Wait a bit before retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue;
          }
          
          // If both are very low even after retries, this might be a real empty wallet
          if (!hasToken1 && !hasToken2) {
            console.log(`ℹ️ Both balances are very low - likely empty wallet: ${token1Symbol}: ${token1Balance}, ${token2Symbol}: ${token2Balance}`);
            break;
          }
        }
        
        // If we reach here, balances are validated or max attempts reached
        console.log(`✅ Balance validation passed: ${token1Symbol}: ${token1Balance}, ${token2Symbol}: ${token2Balance}`);
        break;
        
      } catch (e) {
        console.error(`❌ Balance fetch attempt ${balanceFetchAttempts} failed:`, e);
        if (balanceFetchAttempts >= maxBalanceFetchAttempts) {
          console.log('❌ All balance fetch attempts failed, continuing with 0 balances');
          // Continue with 0 balances as fallback
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // Calculate available token1 (subtract gas reserve for APT)
    let availableToken1 = token1Balance;
    if (token1Symbol === 'APT') {
      availableToken1 = Math.max(0, token1Balance - gasReserveAPT);
    }

    // ====== FIXED CALCULATION LOGIC ======

    // Calculate the actual liquidity ratio for this specific tick range
    const largeTestAmount = Math.floor(1000.0 * (10 ** token1Decimals));

    try {
      const [_, token2NeededRaw] = await sdk.Pool.estCurrencyBAmountFromA({
        currencyA: token1,
        currencyB: token2,
        currencyAAmount: largeTestAmount,
        feeTierIndex,
        tickLower,
        tickUpper,
        currentPriceTick: currentTick,
      });

      // Calculate the actual ratio for this specific range
      const token1TestAmount = largeTestAmount / (10 ** token1Decimals);
      const token2NeededAmount = Number(token2NeededRaw) / (10 ** token2Decimals);
      const liquidityRatio = token2NeededAmount / token1TestAmount;

      // Calculate total value in token2 terms with safety buffer
      const token1ValueInToken2 = availableToken1 * marketPrice;
      const totalValueInToken2 = token1ValueInToken2 + token2Balance;

      // Calculate optimal amounts based on liquidity ratio
      const _totalRatioValue = 1 + liquidityRatio; // token1 coefficient + token2 coefficient
      const optimalToken1Amount = totalValueInToken2 / (marketPrice + liquidityRatio);
      const optimalToken2Amount = optimalToken1Amount * liquidityRatio;

      console.log('🔍 Debug Info:');
      console.log(`  Market Price: ${marketPrice}`);
      console.log(`  Liquidity Ratio: ${liquidityRatio}`);
      console.log(`  Available Token1: ${availableToken1}`);
      console.log(`  Token2 Balance: ${token2Balance}`);
      console.log(`  Total Value (in token2): ${totalValueInToken2}`);
      console.log(`  Optimal Token1: ${optimalToken1Amount}`);
      console.log(`  Optimal Token2: ${optimalToken2Amount}`);

      // Calculate swap requirements
      let swapAmount: number | undefined;
      let swapAmountRaw: number | undefined;
      let swapFromToken: string | undefined;
      let swapToToken: string | undefined;
      let swapFromSymbol: string | undefined;
      let swapToSymbol: string | undefined;

      if (availableToken1 > 0 || token2Balance > 0) {
        const token1Deficit = optimalToken1Amount - availableToken1;
        const token2Deficit = optimalToken2Amount - token2Balance;

        console.log(`  Token1 Deficit: ${token1Deficit}`);
        console.log(`  Token2 Deficit: ${token2Deficit}`);

        // Enhanced swap threshold and logic with safety checks
        const minSwapThreshold = 0.01; // Increased minimum to avoid tiny swaps
        
        // CRITICAL SAFETY CHECKS for APT/stkAPT
        const isAPTstkAPTPool = (token1Symbol === 'APT' && token2Symbol === 'stkAPT') || 
                               (token1Symbol === 'stkAPT' && token2Symbol === 'APT');
        
        if (isAPTstkAPTPool) {
          console.log('🛡️ APT/stkAPT Safety Checks:');
          
          // Safety check: Prevent swapping if BOTH balances are suspiciously low (API issue)
          const minimumBalanceThreshold = 0.01; // Very low threshold - just check for API issues
          const token1HasAnyBalance = availableToken1 >= minimumBalanceThreshold;
          const token2HasAnyBalance = token2Balance >= minimumBalanceThreshold;
          
          console.log(`  ${token1Symbol} has balance (>=${minimumBalanceThreshold}): ${token1HasAnyBalance} (${availableToken1})`);
          console.log(`  ${token2Symbol} has balance (>=${minimumBalanceThreshold}): ${token2HasAnyBalance} (${token2Balance})`);
          
          // Only block if BOTH balances are extremely low (likely API issue)
          if (!token1HasAnyBalance && !token2HasAnyBalance) {
            console.log('🚫 SWAP BLOCKED: Both token balances are extremely low - likely API issue');
            // Don't set swap parameters
          } else {
            // Normal case: Allow swaps even if one balance is low (that's exactly when we need to swap!)
            console.log('✅ APT/stkAPT swap allowed - normal rebalancing scenario');
            
            if (Math.abs(token1Deficit) > minSwapThreshold || Math.abs(token2Deficit) > minSwapThreshold) {
              if (token1Deficit > 0 && token2Balance > Math.abs(token2Deficit)) {
                // Need more token1, swap token2 -> token1
                swapAmount = Math.abs(token2Deficit);
                swapFromToken = token2;
                swapToToken = token1;
                swapFromSymbol = token2Symbol;
                swapToSymbol = token1Symbol;
                swapAmountRaw = Math.floor(swapAmount * (10 ** token2Decimals));
              } else if (token2Deficit > 0 && availableToken1 > Math.abs(token1Deficit)) {
                // Need more token2, swap token1 -> token2
                swapAmount = Math.abs(token1Deficit);
                swapFromToken = token1;
                swapToToken = token2;
                swapFromSymbol = token1Symbol;
                swapToSymbol = token2Symbol;
                swapAmountRaw = Math.floor(swapAmount * (10 ** token1Decimals));
              }
            }
          }
        } else {
          // Standard logic for non-APT/stkAPT pools
          if (Math.abs(token1Deficit) > minSwapThreshold || Math.abs(token2Deficit) > minSwapThreshold) {
            if (token1Deficit > 0 && token2Balance > Math.abs(token2Deficit)) {
              // Need more token1, swap token2 -> token1
              swapAmount = Math.abs(token2Deficit);
              swapFromToken = token2;
              swapToToken = token1;
              swapFromSymbol = token2Symbol;
              swapToSymbol = token1Symbol;
              swapAmountRaw = Math.floor(swapAmount * (10 ** token2Decimals));
            } else if (token2Deficit > 0 && availableToken1 > Math.abs(token1Deficit)) {
              // Need more token2, swap token1 -> token2
              swapAmount = Math.abs(token1Deficit);
              swapFromToken = token1;
              swapToToken = token2;
              swapFromSymbol = token1Symbol;
              swapToSymbol = token2Symbol;
              swapAmountRaw = Math.floor(swapAmount * (10 ** token1Decimals));
            }
          }
        }

        console.log(`  Final Swap Decision: ${swapFromSymbol || 'None'} → ${swapToSymbol || 'None'}`);
        console.log(`  Final Swap Amount: ${swapAmount || 'None'}`);
      }

      return {
        poolId: targetPoolId,
        token1Address: token1,
        token2Address: token2,
        token1Symbol,
        token2Symbol,
        currentTick,
        feeTierIndex,
        tickLower,
        tickUpper,
        feeRate,
        feeAPR,
        farmAPR,
        tvlUSD: poolData.tvlUSD || '0',
        liquidityRatio,
        marketPrice,
        token1Balance,
        token2Balance,
        availableToken1,
        token1Decimals,
        token2Decimals,
        swapAmount,
        swapAmountRaw,
        swapFromToken,
        swapToToken,
        swapFromSymbol,
        swapToSymbol
      };

    } catch (estError) {
      console.error('Error calculating optimal ratio:', estError);
      return null;
    }

  } catch (error) {
    console.error('Error in calculateOptimalRatioData:', error);
    return null;
  }
}


/**
 * Generate formatted text response for Telegram
 */
export function generateRatioResponseText(
  data: RatioResponseData,
  address: string,
  rangePercent?: number | null
): string {
  const rangeDescription = rangePercent !== null && rangePercent !== undefined
    ? `Custom range: ±${rangePercent}%`
    : "Tightest range";

  const totalLiquidityValue = 1 + data.liquidityRatio;
  const token1Percentage = (1 / totalLiquidityValue) * 100;
  const token2Percentage = (data.liquidityRatio / totalLiquidityValue) * 100;

  let response = '🎯 *Optimal Ratio Calculator*\n\n';
  response += `👤 *Address:* \`${address}\`\n`;
  response += `🏊 *Pool:* ${data.token1Symbol}/${data.token2Symbol}\n`;
  response += `🆔 *Pool ID:* \`${data.poolId}\`\n\n`;

  response += '📊 *Pool Details:*\n';
  response += `• Current Tick: ${data.currentTick}\n`;
  response += `• Fee Tier: ${(data.feeRate / 10000).toFixed(2)}%\n`;
  response += `• Fee APR: ${data.feeAPR.toFixed(2)}% | Farm APR: ${data.farmAPR.toFixed(2)}%\n`;
  response += `• TVL: $${Number.parseFloat(data.tvlUSD).toLocaleString()}\n\n`;

  response += `🎯 ${rangeDescription}: [${data.tickLower}, ${data.tickUpper}]\n\n`;
  response += '⚖️ *Optimal Ratio:*\n';
  response += `• 1 ${data.token1Symbol} = ${data.liquidityRatio.toFixed(8)} ${data.token2Symbol}\n`;
  response += `• Distribution: ${token1Percentage.toFixed(2)}% ${data.token1Symbol} - ${token2Percentage.toFixed(2)}% ${data.token2Symbol}\n\n`;
  response += `💸 *Market Price:* 1 ${data.token1Symbol} = ${data.marketPrice.toFixed(8)} ${data.token2Symbol}\n\n`;

  // Add balance information if available
  if (data.token1Balance > 0 || data.token2Balance > 0) {
    response += `💰 *Balances:* ${data.token1Symbol}: ${data.token1Balance.toFixed(8)}`;
    if (data.token1Symbol === 'APT') {
      response += ` (${data.availableToken1.toFixed(8)} available)`;
    }
    response += `, ${data.token2Symbol}: ${data.token2Balance.toFixed(8)}\n\n`;

    // Add swap recommendation if needed
    if (data.swapAmount && data.swapFromSymbol && data.swapToSymbol) {
      response += '💡 *Swap Recommendation:*\n';
      response += `• Swap ${data.swapAmount.toFixed(8)} ${data.swapFromSymbol} → ${data.swapToSymbol}\n`;
      response += '• This will optimize your ratio for the selected range\n\n';
    } else {
      response += "✅ Balances already optimal!\n\n";
    }
  }

  return response;
}

/**
 * Generate a formatted ratio response for Telegram (main function)
 */
export async function generateRatioResponse(
  env: Env,
  address: string,
  poolId?: string,
  rangePercent?: number | null
): Promise<RatioResponse> {
  try {
    const data = await calculateOptimalRatioData(env, address, poolId, rangePercent);

    if (!data) {
      return {
        text: "❌ Unable to fetch pool data or calculate optimal ratio. Please check the pool ID and try again.",
        data: null
      };
    }

    const responseText = generateRatioResponseText(data, address, rangePercent);

    return {
      text: responseText,
      data
    };
  } catch (error) {
    console.error('❌ Error generating ratio response:', error);
    return {
      text: "❌ Error calculating ratio. Please try again later.",
      data: null
    };
  }
}

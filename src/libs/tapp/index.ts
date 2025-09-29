import { initTappSDK } from '@tapp-exchange/sdk';
import { Network } from '@aptos-labs/ts-sdk';
import type { Env } from '../../env';

interface PoolInfo {
  id: string;
  token1Symbol: string;
  token2Symbol: string;
  tvl: number;
  type: string;
  fee?: number;
}

interface SwapEstimate {
  amountOut: number;
  amountIn: number;
  priceImpact: number;
  error?: string;
}

export function initTappClient(env: Env) {
  return initTappSDK({
    network: Network.MAINNET,
    url: process.env.APTOS_NODE_URL
  });
}

export async function getTappPools(): Promise<PoolInfo[]> {
  try {
    const sdk = initTappSDK({
      network: Network.MAINNET
    });

    const pools = await sdk.Pool.getPools({
      page: 1,
      size: 50,
      sortBy: 'tvl'
    });

    return pools.map((pool: any) => ({
      id: pool.id,
      token1Symbol: pool.token1?.symbol || 'Unknown',
      token2Symbol: pool.token2?.symbol || 'Unknown', 
      tvl: Number(pool.tvl) || 0,
      type: pool.type || 'Unknown',
      fee: pool.fee
    }));
  } catch (error) {
    console.error('Error fetching TAPP pools:', error);
    return [];
  }
}

export async function formatTappPoolsResponse(pools: PoolInfo[]): Promise<string> {
  if (pools.length === 0) {
    return "❌ No TAPP pools found or error fetching pools.";
  }

  let response = "🏊 **TAPP Exchange Pools**\n\n";
  
  pools.slice(0, 20).forEach((pool, index) => {
    const tvlFormatted = pool.tvl > 1000000 
      ? `$${(pool.tvl / 1000000).toFixed(2)}M`
      : pool.tvl > 1000 
        ? `$${(pool.tvl / 1000).toFixed(2)}K`
        : `$${pool.tvl.toFixed(2)}`;
    
    const feeText = pool.fee ? ` (${pool.fee / 10000}%)` : '';
    
    response += `${index + 1}. **${pool.token1Symbol}/${pool.token2Symbol}**\n`;
    response += `   💰 TVL: ${tvlFormatted}\n`;
    response += `   🏷️ Type: ${pool.type}${feeText}\n`;
    response += `   🆔 ID: \`${pool.id}\`\n\n`;
  });

  response += `💡 *Showing top ${Math.min(pools.length, 20)} pools by TVL*\n`;
  response += `📊 *Total pools: ${pools.length}*`;

  return response;
}

export async function estimateTappSwap(
  poolId: string,
  amount: number,
  a2b: boolean,
  pair: [number, number] = [0, 1]
): Promise<SwapEstimate> {
  try {
    const sdk = initTappSDK({
      network: Network.MAINNET
    });

    const result = await sdk.Swap.getEstSwapAmount({
      poolId,
      a2b,
      field: 'input',
      amount,
      pair
    });

    if (result.error) {
      return {
        amountOut: 0,
        amountIn: amount,
        priceImpact: 0,
        error: result.error.message || 'Swap estimation failed'
      };
    }

    return {
      amountOut: Number(result.amountOut) || 0,
      amountIn: amount,
      priceImpact: Number(result.priceImpact) || 0
    };
  } catch (error) {
    console.error('Error estimating TAPP swap:', error);
    return {
      amountOut: 0,
      amountIn: amount,
      priceImpact: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function getTappSwapRoute(token0: string, token1: string) {
  try {
    const sdk = initTappSDK({
      network: Network.MAINNET
    });

    const route = await sdk.Swap.getRoute(token0, token1);
    return route;
  } catch (error) {
    console.error('Error getting TAPP swap route:', error);
    return null;
  }
}

export function formatTappSwapEstimate(estimate: SwapEstimate, fromSymbol: string, toSymbol: string): string {
  if (estimate.error) {
    return `❌ **Swap Estimation Failed**\n\nError: ${estimate.error}`;
  }

  let response = `💱 **TAPP Swap Estimate**\n\n`;
  response += `📊 **Trade Details:**\n`;
  response += `• Input: ${estimate.amountIn.toFixed(6)} ${fromSymbol}\n`;
  response += `• Output: ${estimate.amountOut.toFixed(6)} ${toSymbol}\n`;
  response += `• Rate: 1 ${fromSymbol} = ${(estimate.amountOut / estimate.amountIn).toFixed(6)} ${toSymbol}\n`;
  
  if (estimate.priceImpact !== 0) {
    const impactColor = estimate.priceImpact > 5 ? '🔴' : estimate.priceImpact > 1 ? '🟡' : '🟢';
    response += `• Price Impact: ${impactColor} ${estimate.priceImpact.toFixed(3)}%\n`;
  }

  response += `\n💡 *Powered by TAPP Exchange*`;
  
  return response;
}
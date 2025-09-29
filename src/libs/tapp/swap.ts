import { initTappSDK } from '@tapp-exchange/sdk';
import { Network } from '@aptos-labs/ts-sdk';
import type { Env } from '../../env';

interface SwapAMMParams {
  poolId: string;
  a2b: boolean;
  fixedAmountIn: boolean;
  amount0: number;
  amount1: number;
}

interface SwapCLMMParams {
  poolId: string;
  amountIn: number;
  minAmountOut: number;
  a2b: boolean;
  fixedAmountIn: boolean;
  targetSqrtPrice: number;
}

interface SwapStableParams {
  poolId: string;
  tokenIn: number;
  tokenOut: number;
  amountIn: number;
  minAmountOut: number;
}

export async function createAMMSwapPayload(params: SwapAMMParams) {
  try {
    const sdk = initTappSDK({
      network: Network.MAINNET
    });

    return sdk.Swap.swapAMMTransactionPayload(params);
  } catch (error) {
    console.error('Error creating AMM swap payload:', error);
    throw error;
  }
}

export async function createCLMMSwapPayload(params: SwapCLMMParams) {
  try {
    const sdk = initTappSDK({
      network: Network.MAINNET
    });

    return sdk.Swap.swapCLMMTransactionPayload(params);
  } catch (error) {
    console.error('Error creating CLMM swap payload:', error);
    throw error;
  }
}

export async function createStableSwapPayload(params: SwapStableParams) {
  try {
    const sdk = initTappSDK({
      network: Network.MAINNET
    });

    return sdk.Swap.swapStableTransactionPayload(params);
  } catch (error) {
    console.error('Error creating Stable swap payload:', error);
    throw error;
  }
}

export async function simulateSwap(
  poolId: string,
  amountIn: number,
  fromTokenSymbol: string,
  toTokenSymbol: string,
  a2b: boolean = true,
  pair: [number, number] = [0, 1]
): Promise<{
  success: boolean;
  amountOut?: number;
  priceImpact?: number;
  error?: string;
  minAmountOut?: number;
}> {
  try {
    const sdk = initTappSDK({
      network: Network.MAINNET
    });

    const estimate = await sdk.Swap.getEstSwapAmount({
      poolId,
      a2b,
      field: 'input',
      amount: amountIn,
      pair
    });

    if (estimate.error) {
      return {
        success: false,
        error: estimate.error.message || 'Swap simulation failed'
      };
    }

    const amountOut = Number(estimate.amountOut) || 0;
    const priceImpact = Number(estimate.priceImpact) || 0;
    const minAmountOut = amountOut * 0.99; // 1% slippage tolerance

    return {
      success: true,
      amountOut,
      priceImpact,
      minAmountOut
    };
  } catch (error) {
    console.error('Error simulating swap:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export function formatSwapSimulation(
  simulation: Awaited<ReturnType<typeof simulateSwap>>,
  amountIn: number,
  fromSymbol: string,
  toSymbol: string
): string {
  if (!simulation.success) {
    return `❌ **TAPP Swap Simulation Failed**\n\nError: ${simulation.error}`;
  }

  const rate = simulation.amountOut! / amountIn;
  const impactColor = simulation.priceImpact! > 5 ? '🔴' : simulation.priceImpact! > 1 ? '🟡' : '🟢';

  let response = `🔄 **TAPP Swap Simulation**\n\n`;
  response += `📊 **Trade Preview:**\n`;
  response += `• Input: ${amountIn.toFixed(6)} ${fromSymbol}\n`;
  response += `• Expected Output: ${simulation.amountOut!.toFixed(6)} ${toSymbol}\n`;
  response += `• Min Output (1% slippage): ${simulation.minAmountOut!.toFixed(6)} ${toSymbol}\n`;
  response += `• Exchange Rate: 1 ${fromSymbol} = ${rate.toFixed(6)} ${toSymbol}\n`;
  response += `• Price Impact: ${impactColor} ${simulation.priceImpact!.toFixed(3)}%\n\n`;
  
  if (simulation.priceImpact! > 5) {
    response += `⚠️ **High Price Impact Warning**\n`;
    response += `Price impact is above 5%. Consider reducing trade size.\n\n`;
  }

  response += `💡 *Simulation powered by TAPP Exchange*`;
  
  return response;
}

export { SwapAMMParams, SwapCLMMParams, SwapStableParams };
import { SwapAggregator, Environment, NetworkId } from "@kanalabs/aggregator";
import {
  Account,
  AccountAddress,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
} from "@aptos-labs/ts-sdk";
import type { Env } from '../../env';

interface KanaQuote {
  inputToken: string;
  outputToken: string;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  slippage: number;
  route: any[];
  provider: string;
  gasEstimate?: string;
}

interface KanaQuotesResponse {
  data: KanaQuote[];
  success: boolean;
  message?: string;
}

interface KanaSwapParams {
  inputToken: string;
  outputToken: string;
  amountIn: string;
  slippage?: number;
  userAddress?: string;
}

interface KanaSwapResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  quotes?: KanaQuote[];
}

interface SwapTokenInfo {
  symbol: string;
  address: string;
  decimals: number;
}

const COMMON_TOKENS: Record<string, SwapTokenInfo> = {
  'APT': {
    symbol: 'APT',
    address: '0x1::aptos_coin::AptosCoin',
    decimals: 8
  },
  'USDC': {
    symbol: 'USDC',
    address: '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b',
    decimals: 6
  },
  'MOD': {
    symbol: 'MOD',
    address: '0x6f986d146e4a90b828d8c12c14b6f4e003fdff11a8eecceceb63744363eaac01::mod_coin::MOD',
    decimals: 8
  },
  'stkAPT': {
    symbol: 'stkAPT',
    address: '0x42556039b88593e768c97ab1a3ab0c6a17230825769304482dff8fdebe4c002b',
    decimals: 8
  }
};

export class KanalabsClient {
  private swap: SwapAggregator;
  private env: Env;
  private aptosSigner?: Account;

  constructor(env: Env) {
    this.env = env;
    
    const aptosConfig = new AptosConfig({ network: Network.MAINNET });
    const aptosProvider = new Aptos(aptosConfig);

    this.swap = new SwapAggregator(Environment.production, {
      providers: {
        //@ts-ignore
        aptos: aptosProvider,
      },
      signers: this.env.PRIVATE_KEY ? {
        //@ts-ignore
        aptos: this.createSigner()
      } : undefined,
    });
  }

  private createSigner(): Account {
    if (!this.aptosSigner && this.env.PRIVATE_KEY) {
      this.aptosSigner = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(this.env.PRIVATE_KEY),
        legacy: true,
      });
    }
    return this.aptosSigner!;
  }

  async getSwapQuotes(params: KanaSwapParams): Promise<KanaQuotesResponse> {
    try {
      const quotes = await this.swap.swapQuotes({
        apiKey: this.env.APTOS_API_KEY,
        inputToken: params.inputToken,
        outputToken: params.outputToken,
        amountIn: params.amountIn,
        slippage: params.slippage || 0.5,
        network: NetworkId.aptos,
      });

      return {
        data: quotes.data || [],
        success: true
      };
    } catch (error) {
      console.error('Error fetching Kana quotes:', error);
      return {
        data: [],
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async executeSwap(params: KanaSwapParams): Promise<KanaSwapResult> {
    try {
      if (!this.env.PRIVATE_KEY) {
        return {
          success: false,
          error: 'Private key not configured for swap execution'
        };
      }

      const signer = this.createSigner();
      const userAddress = params.userAddress || signer.accountAddress.toString();

      const quotes = await this.getSwapQuotes(params);
      if (!quotes.success || quotes.data.length === 0) {
        return {
          success: false,
          error: 'No quotes available for this swap',
          quotes: quotes.data
        };
      }

      const bestQuote = quotes.data[0];
      const executeSwap = await this.swap.executeSwapInstruction({
        apiKey: this.env.APTOS_API_KEY,
        quote: bestQuote,
        address: userAddress,
      });

      return {
        success: true,
        transactionHash: executeSwap,
        quotes: quotes.data
      };
    } catch (error) {
      console.error('Error executing Kana swap:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async simulateSwap(params: KanaSwapParams): Promise<KanaSwapResult> {
    try {
      const quotes = await this.getSwapQuotes(params);
      
      return {
        success: quotes.success,
        error: quotes.message,
        quotes: quotes.data
      };
    } catch (error) {
      console.error('Error simulating Kana swap:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

export function initKanalabsClient(env: Env): KanalabsClient {
  if (!env.APTOS_API_KEY) {
    throw new Error('APTOS_API_KEY environment variable is not set');
  }
  return new KanalabsClient(env);
}

export function getTokenInfo(symbol: string): SwapTokenInfo | null {
  return COMMON_TOKENS[symbol.toUpperCase()] || null;
}

export function parseTokenInput(input: string): SwapTokenInfo | null {
  if (input.startsWith('0x')) {
    return {
      symbol: 'CUSTOM',
      address: input,
      decimals: 8 // Default decimals
    };
  }
  return getTokenInfo(input);
}

export function formatAmount(amount: string, decimals: number): string {
  const num = Number(amount);
  const divisor = Math.pow(10, decimals);
  return (num / divisor).toString();
}

export function parseAmount(amount: string, decimals: number): string {
  const num = Number(amount);
  const multiplier = Math.pow(10, decimals);
  return Math.floor(num * multiplier).toString();
}

export async function kanaSwapQuotes(
  env: Env,
  fromToken: string,
  toToken: string,
  amount: string,
  slippage: number = 0.5
): Promise<KanaQuote[]> {
  try {
    const client = initKanalabsClient(env);
    
    const fromTokenInfo = parseTokenInput(fromToken);
    const toTokenInfo = parseTokenInput(toToken);
    
    if (!fromTokenInfo || !toTokenInfo) {
      throw new Error('Invalid token symbols or addresses');
    }

    const amountInRaw = parseAmount(amount, fromTokenInfo.decimals);
    
    const result = await client.getSwapQuotes({
      inputToken: fromTokenInfo.address,
      outputToken: toTokenInfo.address,
      amountIn: amountInRaw,
      slippage
    });

    if (!result.success) {
      throw new Error(result.message || 'Failed to get quotes');
    }

    return result.data;
  } catch (error) {
    console.error('Error getting Kana swap quotes:', error);
    return [];
  }
}

export async function kanaExecuteSwap(
  env: Env,
  fromToken: string,
  toToken: string,
  amount: string,
  slippage: number = 0.5,
  userAddress?: string
): Promise<KanaSwapResult> {
  try {
    const client = initKanalabsClient(env);
    
    const fromTokenInfo = parseTokenInput(fromToken);
    const toTokenInfo = parseTokenInput(toToken);
    
    if (!fromTokenInfo || !toTokenInfo) {
      return {
        success: false,
        error: 'Invalid token symbols or addresses'
      };
    }

    const amountInRaw = parseAmount(amount, fromTokenInfo.decimals);
    
    return await client.executeSwap({
      inputToken: fromTokenInfo.address,
      outputToken: toTokenInfo.address,
      amountIn: amountInRaw,
      slippage,
      userAddress
    });
  } catch (error) {
    console.error('Error executing Kana swap:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export function formatKanaQuotesResponse(
  quotes: KanaQuote[],
  fromToken: string,
  toToken: string,
  inputAmount: string
): string {
  if (quotes.length === 0) {
    return `❌ No quotes available for ${fromToken} → ${toToken}`;
  }

  const fromTokenInfo = parseTokenInput(fromToken);
  const toTokenInfo = parseTokenInput(toToken);
  
  if (!fromTokenInfo || !toTokenInfo) {
    return `❌ Invalid token symbols: ${fromToken} or ${toToken}`;
  }

  let response = `💱 **Kanalabs Swap Quotes: ${fromTokenInfo.symbol} → ${toTokenInfo.symbol}**\n\n`;
  response += `📊 **Input:** ${inputAmount} ${fromTokenInfo.symbol}\n\n`;

  quotes.slice(0, 5).forEach((quote, index) => {
    const outputAmount = formatAmount(quote.amountOut, toTokenInfo.decimals);
    const inputAmountFormatted = formatAmount(quote.amountIn, fromTokenInfo.decimals);
    const rate = Number(outputAmount) / Number(inputAmountFormatted);
    
    response += `**Quote ${index + 1}** (${quote.provider}):\n`;
    response += `• Output: ${Number(outputAmount).toFixed(6)} ${toTokenInfo.symbol}\n`;
    response += `• Rate: 1 ${fromTokenInfo.symbol} = ${rate.toFixed(6)} ${toTokenInfo.symbol}\n`;
    response += `• Price Impact: ${(quote.priceImpact * 100).toFixed(3)}%\n`;
    response += `• Slippage: ${quote.slippage}%\n`;
    if (quote.gasEstimate) {
      response += `• Gas: ${quote.gasEstimate}\n`;
    }
    response += `\n`;
  });

  if (quotes.length > 5) {
    response += `_... and ${quotes.length - 5} more quotes_\n\n`;
  }

  response += `💡 *Powered by Kanalabs Aggregator*`;
  
  return response;
}

export function formatKanaSwapResult(result: KanaSwapResult, fromToken: string, toToken: string): string {
  if (!result.success) {
    return `❌ **Swap Failed**\n\nError: ${result.error}`;
  }

  let response = `✅ **Swap Executed Successfully**\n\n`;
  response += `🔄 **Trade:** ${fromToken} → ${toToken}\n`;
  
  if (result.transactionHash) {
    response += `🆔 **Transaction:** \`${result.transactionHash}\`\n`;
  }

  if (result.quotes && result.quotes.length > 0) {
    const bestQuote = result.quotes[0];
    const fromTokenInfo = parseTokenInput(fromToken);
    const toTokenInfo = parseTokenInput(toToken);
    
    if (fromTokenInfo && toTokenInfo) {
      const inputAmount = formatAmount(bestQuote.amountIn, fromTokenInfo.decimals);
      const outputAmount = formatAmount(bestQuote.amountOut, toTokenInfo.decimals);
      
      response += `📊 **Details:**\n`;
      response += `• Input: ${Number(inputAmount).toFixed(6)} ${fromTokenInfo.symbol}\n`;
      response += `• Output: ${Number(outputAmount).toFixed(6)} ${toTokenInfo.symbol}\n`;
      response += `• Price Impact: ${(bestQuote.priceImpact * 100).toFixed(3)}%\n`;
      response += `• Provider: ${bestQuote.provider}\n`;
    }
  }

  response += `\n💡 *Powered by Kanalabs Aggregator*`;
  
  return response;
}

export function getAvailableTokens(): string {
  let response = `🪙 **Available Tokens for Kanalabs Swaps:**\n\n`;
  
  Object.entries(COMMON_TOKENS).forEach(([symbol, info]) => {
    response += `• **${symbol}** - ${info.decimals} decimals\n`;
    response += `  \`${info.address}\`\n\n`;
  });

  response += `💡 *You can also use custom token addresses directly*`;
  
  return response;
}

export {
  KanaQuote,
  KanaQuotesResponse,
  KanaSwapParams,
  KanaSwapResult,
  SwapTokenInfo,
  COMMON_TOKENS
};
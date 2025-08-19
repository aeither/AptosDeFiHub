import { Network } from '@aptos-labs/ts-sdk';
import { initHyperionSDK } from '@hyperionxyz/sdk';
import type { TransactionPayload } from './executeTransaction';

// APT address constants (same as in createPool.ts)
const APT_FA_ADDRESS = '0x000000000000000000000000000000000000000000000000000000000000000a';
const APT_COIN_TYPE = '0x1::aptos_coin::AptosCoin';

/**
 * Convert APT FA address to coin type for transactions
 */
function convertAPTAddressForTransaction(address: string): string {
  if (address === APT_FA_ADDRESS || address === '0xa') {
    return APT_COIN_TYPE;
  }
  return address;
}

/**
 * Check if an address represents APT (either FA or coin type)
 */
function isAPTAddress(address: string): boolean {
  return address === APT_FA_ADDRESS || 
         address === '0xa' || 
         address === APT_COIN_TYPE;
}

export async function getSwapPayload(
  transactionData: {
    swapFromToken: string;
    swapToToken: string;
    swapAmountRaw: number;
    recipient: string;
  },
  env?: { APTOS_API_KEY?: string }
): Promise<TransactionPayload> {
  try {
    console.log('📋 Generating swap payload...');
    console.log(`  ${transactionData.swapFromToken} -> ${transactionData.swapToToken}`);
    console.log(`  Amount: ${transactionData.swapAmountRaw}`);
    
    // Log address types for debugging
    console.log(`  From Token: ${transactionData.swapFromToken} (${isAPTAddress(transactionData.swapFromToken) ? 'APT' : 'FA'})`);
    console.log(`  To Token: ${transactionData.swapToToken} (${isAPTAddress(transactionData.swapToToken) ? 'APT' : 'FA'})`);

    const apiKey = env?.APTOS_API_KEY;
    if (!apiKey) {
      throw new Error('APTOS_API_KEY environment variable is not set.');
    }

    const sdk = initHyperionSDK({
      network: Network.MAINNET,
      APTOS_API_KEY: apiKey,
    });

    // Use FA addresses for calculations (as per documentation pattern)
    const { amountOut: currencyBAmount, path: poolRoute } = await sdk.Swap.estToAmount({
      amount: transactionData.swapAmountRaw,
      from: transactionData.swapFromToken, // Use FA address for calculations
      to: transactionData.swapToToken, // Use FA address for calculations
      safeMode: false
    });

    console.log(`📈 Estimated output: ${currencyBAmount}`);

    // Convert APT FA addresses to coin types for transaction
    const transactionFromToken = convertAPTAddressForTransaction(transactionData.swapFromToken);
    const transactionToToken = convertAPTAddressForTransaction(transactionData.swapToToken);
    
    console.log(`🔄 Address conversion for swap transaction:`);
    console.log(`  From: ${transactionData.swapFromToken} → ${transactionFromToken}`);
    console.log(`  To: ${transactionData.swapToToken} → ${transactionToToken}`);

    // Generate swap transaction payload
    const swapParams = {
      currencyA: transactionFromToken, // Use coin type for APT in transactions
      currencyB: transactionToToken, // Use coin type for APT in transactions
      currencyAAmount: transactionData.swapAmountRaw,
      currencyBAmount: Number(currencyBAmount),
      slippage: 0.1, // 0.1% slippage
      poolRoute,
      recipient: transactionData.recipient,
    };

    const payload = await sdk.Swap.swapTransactionPayload(swapParams);

    console.log('✅ Swap payload generated successfully!');
    console.log(`🔍 Generated function: ${payload.function}`);
    
    return payload;

  } catch (error) {
    console.error('❌ Error generating swap payload:', error);
    throw error;
  }
} 
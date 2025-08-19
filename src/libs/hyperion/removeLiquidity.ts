import { Network } from '@aptos-labs/ts-sdk';
import { initHyperionSDK } from '@hyperionxyz/sdk';
import type { TransactionPayload } from './executeTransaction';

// APT address constants (same as in other files)
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

export async function getRemoveLiquidityPayload(
  userAddress: string,
  positionId: string,
  removeRatio = 1.0,
  env?: { APTOS_API_KEY?: string }
): Promise<TransactionPayload> {
  try {
    console.log('📋 Generating remove liquidity payload...');
    console.log(`  Position ID: ${positionId}`);
    console.log(`  Position ID Length: ${positionId.length}`);
    console.log(`  Position ID Type: ${typeof positionId}`);
    console.log(`  User Address: ${userAddress}`);
    console.log(`  Remove Ratio: ${(removeRatio * 100).toFixed(1)}%`);

    const apiKey = env?.APTOS_API_KEY;
    if (!apiKey) {
      throw new Error('APTOS_API_KEY environment variable is not set.');
    }

    const sdk = initHyperionSDK({
      network: Network.MAINNET,
      APTOS_API_KEY: apiKey,
    });

    console.log('📡 Fetching detailed position information...');

    // Fetch detailed position information
    const detailedPosition = await sdk.Position.fetchPositionById({
      positionId: positionId,
      address: userAddress,
    });

    console.log('📡 Raw position response:', JSON.stringify(detailedPosition, null, 2));

    if (!detailedPosition || !Array.isArray(detailedPosition) || detailedPosition.length === 0) {
      console.error('❌ Position fetch failed:');
      console.error('  Position ID:', positionId);
      console.error('  User Address:', userAddress);
      console.error('  Response:', detailedPosition);
      throw new Error(`Position not found: ${positionId}`);
    }

    const positionData = detailedPosition[0];
    console.log('✅ Position details fetched successfully');
    console.log('📊 Position Data:', JSON.stringify(positionData, null, 2));

    // Fetch token amounts for the position
    console.log('💰 Fetching token amounts from position...');
    const [currencyAAmountRaw, currencyBAmountRaw] = await sdk.Position.fetchTokensAmountByPositionId({
      positionId,
    });

    console.log("📊 Token amounts fetched:");
    console.log(`  Token A Amount (raw): ${currencyAAmountRaw}`);
    console.log(`  Token B Amount (raw): ${currencyBAmountRaw}`);

    // Get liquidity amount from position data
    const currentLiquidity = positionData.currentAmount || positionData.liquidity || '1000000';
    console.log(`💧 Current Liquidity: ${currentLiquidity}`);

    // Calculate amounts to remove based on ratio
    // For 100% removal, use full amounts to avoid rounding issues
    const currencyAAmount = removeRatio >= 1.0 ? Number(currencyAAmountRaw) : Math.floor(Number(currencyAAmountRaw) * removeRatio);
    const currencyBAmount = removeRatio >= 1.0 ? Number(currencyBAmountRaw) : Math.floor(Number(currencyBAmountRaw) * removeRatio);
    const deltaLiquidity = removeRatio >= 1.0 ? Number(currentLiquidity) : Math.floor(Number(currentLiquidity) * removeRatio);

    // Get currency types - the pool data is an array, so we need to access pool[0]
    const poolData = Array.isArray(positionData.pool) ? positionData.pool[0] : positionData.pool;

    let currencyA: string;
    let currencyB: string;
    
    // Enhanced currency type detection with preference for coin types for APT
    if (poolData?.token1Info) {
      // For APT, prefer coin type; for others, use FA type
      if (poolData.token1Info.symbol === 'APT' && poolData.token1Info.coinType) {
        currencyA = poolData.token1Info.coinType;
      } else {
        currencyA = poolData.token1Info.coinType || poolData.token1Info.faType;
      }
      
      if (poolData.token2Info.symbol === 'APT' && poolData.token2Info.coinType) {
        currencyB = poolData.token2Info.coinType;
      } else {
        currencyB = poolData.token2Info.coinType || poolData.token2Info.faType;
      }
    } else if (poolData) {
      currencyA = poolData.token1;
      currencyB = poolData.token2;
    } else {
      currencyA = positionData.token1 || positionData.currencyA;
      currencyB = positionData.token2 || positionData.currencyB;
    }

    // Apply our APT address conversion for consistency
    const transactionCurrencyA = convertAPTAddressForTransaction(currencyA);
    const transactionCurrencyB = convertAPTAddressForTransaction(currencyB);

    console.log("🪙 Currency types found:");
    console.log(`  Currency A: ${currencyA} (${isAPTAddress(currencyA) ? 'APT' : 'FA'}) → ${transactionCurrencyA}`);
    console.log(`  Currency B: ${currencyB} (${isAPTAddress(currencyB) ? 'APT' : 'FA'}) → ${transactionCurrencyB}`);

    if (!transactionCurrencyA || !transactionCurrencyB) {
      throw new Error('Could not determine currency types from position data');
    }

    const removeParams = {
      positionId,
      currencyA: transactionCurrencyA, // Use coin type for APT
      currencyB: transactionCurrencyB, // Use coin type for APT
      currencyAAmount,
      currencyBAmount,
      deltaLiquidity,
      slippage: 0.1, // 0.1% slippage
      recipient: userAddress,
    };

    console.log('🔧 Remove Liquidity Parameters:');
    console.log(`  Position ID: ${removeParams.positionId}`);
    console.log(`  Currency A: ${removeParams.currencyA}`);
    console.log(`  Currency B: ${removeParams.currencyB}`);
    console.log(`  Currency A Amount: ${removeParams.currencyAAmount}`);
    console.log(`  Currency B Amount: ${removeParams.currencyBAmount}`);
    console.log(`  Delta Liquidity: ${removeParams.deltaLiquidity}`);
    console.log(`  Slippage: ${removeParams.slippage}%`);

    console.log('⚙️  Generating remove liquidity transaction payload...');

    // Generate the transaction payload
    const payload = await sdk.Position.removeLiquidityTransactionPayload(removeParams);

    console.log('✅ Remove liquidity transaction payload generated successfully!');
    console.log(`🔍 Generated function: ${payload.function}`);
    
    return payload;

  } catch (error) {
    console.error('❌ Error generating remove liquidity payload:', error);
    throw error;
  }
} 
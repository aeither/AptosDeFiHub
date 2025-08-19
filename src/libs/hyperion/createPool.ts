import { Network } from '@aptos-labs/ts-sdk';
import { type FeeTierIndex, initHyperionSDK } from '@hyperionxyz/sdk';
import type { TransactionPayload } from './executeTransaction';

// APT address constants
const APT_FA_ADDRESS = '0x000000000000000000000000000000000000000000000000000000000000000a'; // Short form of FA
const APT_COIN_TYPE = '0x1::aptos_coin::AptosCoin'; // Coin type for transactions

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

export async function getCreatePoolPayload(
  ratioData: {
    token1Address: string;
    token2Address: string;
    feeTierIndex: FeeTierIndex;
    currentTick: number;
    tickLower: number;
    tickUpper: number;
    token1Balance: number;
    token2Balance: number;
    availableToken1: number;
    token1Decimals: number;
    token2Decimals: number;
    token1Symbol: string;
    token2Symbol: string;
  },
  env?: { APTOS_API_KEY?: string }
): Promise<TransactionPayload> {
  try {
    console.log('📋 Generating create pool payload...');
    console.log(`  Pool: ${ratioData.token1Symbol}/${ratioData.token2Symbol}`);
    console.log(`  Fee Tier Index: ${ratioData.feeTierIndex}`);
    console.log(`  Current Tick: ${ratioData.currentTick}`);
    console.log(`  Tick Range: [${ratioData.tickLower}, ${ratioData.tickUpper}]`);
    console.log(`  Available: ${ratioData.availableToken1} ${ratioData.token1Symbol}, ${ratioData.token2Balance} ${ratioData.token2Symbol}`);
    console.log(`  Raw Balances: ${ratioData.token1Balance} ${ratioData.token1Symbol} (before gas reserve), ${ratioData.token2Balance} ${ratioData.token2Symbol}`);
    
    // Log the address types for debugging
    console.log(`  Token1 Address: ${ratioData.token1Address} (${isAPTAddress(ratioData.token1Address) ? 'APT' : 'FA'})`);
    console.log(`  Token2 Address: ${ratioData.token2Address} (${isAPTAddress(ratioData.token2Address) ? 'APT' : 'FA'})`);
    
    // Enhanced balance validation
    const minimumForPosition = 0.001; // Very small minimum
    if (ratioData.availableToken1 < minimumForPosition) {
      throw new Error(`Insufficient ${ratioData.token1Symbol} for position creation: ${ratioData.availableToken1.toFixed(8)} < ${minimumForPosition}`);
    }
    
    if (ratioData.token2Balance < minimumForPosition) {
      throw new Error(`Insufficient ${ratioData.token2Symbol} for position creation: ${ratioData.token2Balance.toFixed(8)} < ${minimumForPosition}`);
    }
    
    console.log('✅ Initial balance validation passed');

    // Initialize SDK
    const apiKey = env?.APTOS_API_KEY;
    if (!apiKey) {
      throw new Error('APTOS_API_KEY environment variable is not set.');
    }

    const sdk = initHyperionSDK({
      network: Network.MAINNET,
      APTOS_API_KEY: apiKey,
    });

    console.log('\n🧮 Finding optimal balance allocation with smart iteration...');

    if (ratioData.availableToken1 <= 0) {
      throw new Error('No token1 available for pool creation');
    }

    // Smart iterative approach to find maximum feasible token1 amount
    // NOTE: Using rounding to nearest 1000 to match UI behavior and prevent removal issues
    let bestToken1Amount = 0;
    let bestToken2Amount = 0;
    let bestToken1AmountRaw = 0;
    let bestToken2AmountRaw = 0;
    let found = false;

    // Binary search approach with safety limits
    let minPercentage = 50.0; // Start from 50% as minimum
    let maxPercentage = 99.9; // Maximum 99.9% to leave some buffer
    const maxIterations = 20; // Safety limit to prevent infinite loops
    const tolerance = 0.1; // 0.1% tolerance for convergence
    
    let iteration = 0;
    
    console.log(`🔍 Starting binary search between ${minPercentage}% and ${maxPercentage}%...`);
    
    while (iteration < maxIterations && (maxPercentage - minPercentage) > tolerance) {
      iteration++;
      const currentPercentage = (minPercentage + maxPercentage) / 2;
      
      try {
        console.log(`\n🎯 Iteration ${iteration}: Testing ${currentPercentage.toFixed(2)}%`);
        
        const adjustedToken1Amount = ratioData.availableToken1 * (currentPercentage / 100);
        // Use more conservative rounding to avoid precision issues
        const token1AmountRaw = Math.floor(adjustedToken1Amount * (10 ** ratioData.token1Decimals));
        
        // Apply additional rounding to make amounts more "UI-friendly" 
        // Round to nearest 1000 for better protocol compatibility
        const roundedToken1AmountRaw = Math.floor(token1AmountRaw / 1000) * 1000;
        
        // CRITICAL FIX: Use FA addresses for calculations (as per documentation)
        const [_, requiredToken2Raw] = await sdk.Pool.estCurrencyBAmountFromA({
          currencyA: ratioData.token1Address, // Use FA address for calculations
          currencyB: ratioData.token2Address, // Use FA address for calculations
          currencyAAmount: roundedToken1AmountRaw, // Use rounded amount
          feeTierIndex: ratioData.feeTierIndex,
          tickLower: ratioData.tickLower,
          tickUpper: ratioData.tickUpper,
          currentPriceTick: ratioData.currentTick,
        });

        const requiredToken2 = Number(requiredToken2Raw) / (10 ** ratioData.token2Decimals);
        
        // Apply rounding to token2 amount as well for better protocol compatibility
        const roundedToken2AmountRaw = Math.floor(Number(requiredToken2Raw) / 1000) * 1000;
        const roundedRequiredToken2 = roundedToken2AmountRaw / (10 ** ratioData.token2Decimals);
        
        console.log(`  ${adjustedToken1Amount.toFixed(8)} ${ratioData.token1Symbol} needs ${roundedRequiredToken2.toFixed(8)} ${ratioData.token2Symbol} (rounded)`);
        console.log(`  Available ${ratioData.token2Symbol}: ${ratioData.token2Balance.toFixed(8)}`);

        if (roundedRequiredToken2 <= ratioData.token2Balance) {
          console.log('  ✅ Feasible! Updating best allocation and searching higher.');
          // This percentage works, save it and try higher
          bestToken1Amount = adjustedToken1Amount;
          bestToken2Amount = roundedRequiredToken2;
          bestToken1AmountRaw = roundedToken1AmountRaw; // Use rounded amount
          bestToken2AmountRaw = roundedToken2AmountRaw; // Use rounded amount
          found = true;
          minPercentage = currentPercentage; // Search higher
        } else {
          console.log(`  ❌ Not feasible - need ${(requiredToken2 - ratioData.token2Balance).toFixed(8)} more ${ratioData.token2Symbol}. Searching lower.`);
          maxPercentage = currentPercentage; // Search lower
        }
      } catch (error) {
        console.log(`  ❌ Iteration ${iteration} failed: ${error}. Searching lower.`);
        maxPercentage = currentPercentage; // Treat error as infeasible, search lower
      }
    }

    // Final fallback: if binary search didn't find anything, try a conservative 80%
    if (!found) {
      console.log('\n🔄 Binary search failed, trying conservative 80% fallback...');
      try {
        const fallbackPercentage = 80.0;
        const adjustedToken1Amount = ratioData.availableToken1 * (fallbackPercentage / 100);
        const token1AmountRaw = Math.floor(adjustedToken1Amount * (10 ** ratioData.token1Decimals));
        
        // Apply same rounding to fallback
        const roundedToken1AmountRaw = Math.floor(token1AmountRaw / 1000) * 1000;
        
        const [_, requiredToken2Raw] = await sdk.Pool.estCurrencyBAmountFromA({
          currencyA: ratioData.token1Address, // Use FA address for calculations
          currencyB: ratioData.token2Address, // Use FA address for calculations
          currencyAAmount: roundedToken1AmountRaw, // Use rounded amount
          feeTierIndex: ratioData.feeTierIndex,
          tickLower: ratioData.tickLower,
          tickUpper: ratioData.tickUpper,
          currentPriceTick: ratioData.currentTick,
        });

        const requiredToken2 = Number(requiredToken2Raw) / (10 ** ratioData.token2Decimals);
        
        // Apply same rounding to fallback token2 amount
        const roundedToken2AmountRaw = Math.floor(Number(requiredToken2Raw) / 1000) * 1000;
        const roundedRequiredToken2 = roundedToken2AmountRaw / (10 ** ratioData.token2Decimals);
        
        if (roundedRequiredToken2 <= ratioData.token2Balance) {
          console.log('  ✅ Fallback 80% works!');
          bestToken1Amount = adjustedToken1Amount;
          bestToken2Amount = roundedRequiredToken2;
          bestToken1AmountRaw = roundedToken1AmountRaw; // Use rounded amount
          bestToken2AmountRaw = roundedToken2AmountRaw; // Use rounded amount
          found = true;
        }
      } catch (error) {
        console.log(`  ❌ Fallback also failed: ${error}`);
      }
    }

    if (!found) {
      throw new Error(`No feasible allocation found after ${iteration} iterations. Available: ${ratioData.availableToken1.toFixed(8)} ${ratioData.token1Symbol}, ${ratioData.token2Balance.toFixed(8)} ${ratioData.token2Symbol}`);
    }

    console.log(`\n🎯 Optimal allocation found after ${iteration} iterations:`);
    console.log(`  ${ratioData.token1Symbol}: ${bestToken1Amount.toFixed(8)} (${bestToken1AmountRaw} raw)`);
    console.log(`  ${ratioData.token2Symbol}: ${bestToken2Amount.toFixed(8)} (${bestToken2AmountRaw} raw)`);
    console.log(`  Utilization: ${((bestToken1Amount / ratioData.availableToken1) * 100).toFixed(2)}% of available ${ratioData.token1Symbol}`);
    
    // Final safety validation before transaction creation
    console.log('\n🛡️ Final safety validation...');
    
    // Check if we have enough raw balance for the calculated amounts
    const requiredToken1Raw = bestToken1AmountRaw;
    const requiredToken2Raw = bestToken2AmountRaw;
    const availableToken1Raw = Math.floor(ratioData.availableToken1 * (10 ** ratioData.token1Decimals));
    const availableToken2Raw = Math.floor(ratioData.token2Balance * (10 ** ratioData.token2Decimals));
    
    console.log(`  Required Raw Amounts: ${requiredToken1Raw} ${ratioData.token1Symbol}, ${requiredToken2Raw} ${ratioData.token2Symbol}`);
    console.log(`  Available Raw Amounts: ${availableToken1Raw} ${ratioData.token1Symbol}, ${availableToken2Raw} ${ratioData.token2Symbol}`);
    
    if (requiredToken1Raw > availableToken1Raw) {
      throw new Error(`Insufficient ${ratioData.token1Symbol} balance: need ${requiredToken1Raw} but only have ${availableToken1Raw} (${(requiredToken1Raw - availableToken1Raw)} short)`);
    }
    
    if (requiredToken2Raw > availableToken2Raw) {
      throw new Error(`Insufficient ${ratioData.token2Symbol} balance: need ${requiredToken2Raw} but only have ${availableToken2Raw} (${(requiredToken2Raw - availableToken2Raw)} short)`);
    }
    
    console.log('✅ Final balance validation passed - proceeding with position creation');

    // CRITICAL FIX: Convert APT FA addresses to coin types for transaction
    const transactionToken1Address = convertAPTAddressForTransaction(ratioData.token1Address);
    const transactionToken2Address = convertAPTAddressForTransaction(ratioData.token2Address);
    
    console.log('\n🔄 Address conversion for transaction:');
    console.log(`  Token1: ${ratioData.token1Address} → ${transactionToken1Address}`);
    console.log(`  Token2: ${ratioData.token2Address} → ${transactionToken2Address}`);

    // Create pool transaction payload parameters
    const params = {
      currencyA: transactionToken1Address, // Use coin type for APT in transactions
      currencyB: transactionToken2Address, // Use coin type for APT in transactions
      currencyAAmount: bestToken1AmountRaw,
      currencyBAmount: bestToken2AmountRaw,
      feeTierIndex: ratioData.feeTierIndex,
      currentPriceTick: ratioData.currentTick,
      tickLower: ratioData.tickLower,
      tickUpper: ratioData.tickUpper,
      slippage: 0.1 // 0.1%
    };

    console.log('\n⚙️ Create Pool Parameters:');
    console.log(JSON.stringify(params, null, 2));

    // Generate payload
    console.log('\n🔧 Generating Create Pool Transaction Payload...');
    const payload = await sdk.Pool.createPoolTransactionPayload(params);

    console.log('✅ Create pool transaction payload generated successfully!');
    console.log(`🔍 Generated function: ${payload.function}`);
    
    // Log whether it uses coin or FA function for debugging
    if (payload.function.includes('create_liquidity_coin_entry')) {
      console.log('📍 Using coin entry function (correct for APT transactions)');
    } else if (payload.function.includes('create_liquidity_entry')) {
      console.log('📍 Using FA entry function (correct for pure FA transactions)');
    }
    
    return payload;

  } catch (error) {
    console.error('❌ Error generating create pool payload:', error);
    throw error;
  }
}

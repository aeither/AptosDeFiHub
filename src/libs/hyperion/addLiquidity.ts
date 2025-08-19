import type { Env } from '../../env';
import { getAccount } from '../../utils/getAccount';
import { executeTransaction } from './executeTransaction';
import { generateRatioResponse, getAllPositions } from './read';
import { getSwapPayload } from './swap';

// APT address constants
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

export interface AddLiquidityParams {
    positionId: string;
    poolId: string;
    swapPercentage?: number; // Percentage of needed swap to execute (default: 90%)
    liquidityPercentage?: number; // Percentage of available balance to use (default: 90%)
    performSwap?: boolean; // Whether to perform swap before adding liquidity (default: true)
}

export interface MaxTokenLiquidityParams {
    positionId: string;
    poolId: string;
    maxTokenA: boolean; // True to use max Token A, false for max Token B
    maxAmountA: number; // Available amount of Token A (after subtracting 2)
    maxAmountB: number; // Available amount of Token B (after subtracting 2)
    performSwap?: boolean; // Whether to allow swapping (default: false for max token strategy)
}

export interface AddLiquidityResult {
    success: boolean;
    message: string;
    details: {
        swapExecuted: boolean;
        liquidityAdded: boolean;
        transactionHashes: string[];
        swapDetails?: {
            fromSymbol: string;
            toSymbol: string;
            amount: number;
            txHash: string;
        };
        liquidityDetails?: {
            token1Amount: number;
            token2Amount: number;
            token1Symbol: string;
            token2Symbol: string;
            txHash: string;
        };
        error?: string;
    };
}

/**
 * Get the first position ID from a specific pool
 */
export async function getFirstPositionInPool(
    poolId: string,
    env: Env
): Promise<string | null> {
    try {
        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();

        // Get all positions
        const allPositions = await getAllPositions(address, env);
        
        console.log(`🔍 Looking for pool: ${poolId}`);
        console.log(`📋 Found ${allPositions.length} total positions:`);
        
        // Log all positions with their pool IDs for debugging
        allPositions.forEach((pos, index) => {
            console.log(`  Position ${index + 1}:`);
            console.log(`    Object ID: ${pos.position.objectId}`);
            console.log(`    Pool ID: ${pos.position.pool.poolId}`);
            console.log(`    Pool: ${pos.position.pool.token1Info.symbol}/${pos.position.pool.token2Info.symbol}`);
            console.log(`    Match: ${pos.position.pool.poolId.toLowerCase() === poolId.toLowerCase() ? '✅' : '❌'}`);
        });

        // Find first position in the specified pool (case-insensitive comparison)
        const poolPosition = allPositions.find(pos => 
            pos.position.pool.poolId.toLowerCase() === poolId.toLowerCase()
        );

        if (!poolPosition) {
            console.log(`❌ No positions found in pool: ${poolId}`);
            console.log(`Available pools: ${allPositions.map(p => p.position.pool.poolId).join(', ')}`);
            return null;
        }

        console.log(`✅ Found position ${poolPosition.position.objectId} in pool ${poolId}`);
        return poolPosition.position.objectId;

    } catch (error) {
        console.error('❌ Error finding position in pool:', error);
        return null;
    }
}

/**
 * Execute smart liquidity addition with automatic swapping and optimal allocation
 * This function:
 * 1. Checks current token balances and position requirements
 * 2. Performs optimal swap if needed to balance tokens
 * 3. Uses smart allocation to find maximum feasible liquidity amounts
 * 4. Adds liquidity to the position
 */
export async function executeAddLiquidity(
    params: AddLiquidityParams,
    env: Env
): Promise<AddLiquidityResult> {

    const {
        positionId,
        poolId,
        swapPercentage = 0.9, // Default 90% more aggressive swap
        liquidityPercentage = 0.9, // Default 90% of available balance
        performSwap = true
    } = params;

    const result: AddLiquidityResult = {
        success: false,
        message: '',
        details: {
            swapExecuted: false,
            liquidityAdded: false,
            transactionHashes: []
        }
    };

    try {
        console.log(`💧 Starting smart liquidity addition for position ${positionId}...`);

        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();

        // Lazy import heavy SDK components
        const { Network } = await import("@aptos-labs/ts-sdk");
        const { initHyperionSDK } = await import("@hyperionxyz/sdk");

        const sdk = initHyperionSDK({
            network: Network.MAINNET,
            APTOS_API_KEY: env.APTOS_API_KEY
        });

        // Step 1: Get current ratio and analyze swap needs
        console.log('📊 Analyzing current token balances and position requirements...');
        const ratioResponse = await generateRatioResponse(env, address, poolId, null);
        const ratioData = ratioResponse.data;

        if (!ratioData) {
            throw new Error('Failed to get ratio data for liquidity addition');
        }

        console.log(`📊 Current balances: ${ratioData.availableToken1.toFixed(6)} ${ratioData.token1Symbol}, ${ratioData.token2Balance.toFixed(6)} ${ratioData.token2Symbol}`);
        console.log(`📊 Optimal ratio: 1 ${ratioData.token1Symbol} = ${ratioData.liquidityRatio.toFixed(8)} ${ratioData.token2Symbol}`);
        
        // Log address types for debugging
        console.log(`📊 Token1 Address: ${ratioData.token1Address} (${isAPTAddress(ratioData.token1Address) ? 'APT' : 'FA'})`);
        console.log(`📊 Token2 Address: ${ratioData.token2Address} (${isAPTAddress(ratioData.token2Address) ? 'APT' : 'FA'})`);

        // Step 2: Execute swap if needed and enabled
        if (performSwap && ratioData.swapAmount && ratioData.swapAmountRaw && ratioData.swapFromToken && ratioData.swapToToken) {
            console.log(`💱 Swap needed: ${ratioData.swapAmount.toFixed(6)} ${ratioData.swapFromSymbol} → ${ratioData.swapToSymbol}`);
            
            // Execute conservative swap
            const actualSwapAmountRaw = Math.floor(ratioData.swapAmountRaw * swapPercentage);
            const actualSwapAmount = ratioData.swapAmount * swapPercentage;
            
            console.log(`🎯 Executing conservative swap (${(swapPercentage * 100).toFixed(0)}%): ${actualSwapAmount.toFixed(6)} ${ratioData.swapFromSymbol} → ${ratioData.swapToSymbol}`);
            
            const swapPayload = await getSwapPayload({
                swapFromToken: ratioData.swapFromToken,
                swapToToken: ratioData.swapToToken,
                swapAmountRaw: actualSwapAmountRaw,
                recipient: address
            }, env);

            const swapResult = await executeTransaction(swapPayload, account, 'liquidity addition swap');
            result.details.transactionHashes.push(swapResult.transactionHash);
            result.details.swapExecuted = true;
            result.details.swapDetails = {
                fromSymbol: ratioData.swapFromSymbol || '',
                toSymbol: ratioData.swapToSymbol || '',
                amount: actualSwapAmount,
                txHash: swapResult.transactionHash
            };
            console.log(`✅ Swap completed: ${swapResult.transactionHash}`);

            // Wait a moment for balances to update
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            console.log('✅ No swap needed - balances are already suitable');
        }

        // Step 3: Get updated balances after swap
        console.log('🔄 Fetching updated balances after swap...');
        const updatedRatioResponse = await generateRatioResponse(env, address, poolId, null);
        const updatedRatioData = updatedRatioResponse.data;

        if (!updatedRatioData) {
            throw new Error('Failed to get updated ratio data after swap');
        }

        console.log(`📊 Updated balances: ${updatedRatioData.availableToken1.toFixed(6)} ${updatedRatioData.token1Symbol}, ${updatedRatioData.token2Balance.toFixed(6)} ${updatedRatioData.token2Symbol}`);

        // Step 4: Smart allocation using binary search
        console.log('🧮 Finding optimal liquidity allocation...');

        // Enhanced balance validation
        const minimumForPosition = 0.01; // Minimum 0.01 tokens to proceed
        if (updatedRatioData.availableToken1 <= minimumForPosition) {
            throw new Error(`Insufficient ${updatedRatioData.token1Symbol} balance: ${updatedRatioData.availableToken1.toFixed(6)} <= ${minimumForPosition}`);
        }
        
        if (updatedRatioData.token2Balance <= 0.005 && updatedRatioData.availableToken1 <= minimumForPosition * 2) {
            throw new Error(`Insufficient combined balance. ${updatedRatioData.token1Symbol}: ${updatedRatioData.availableToken1.toFixed(6)}, ${updatedRatioData.token2Symbol}: ${updatedRatioData.token2Balance.toFixed(6)}`);
        }
        
        console.log('✅ Balance validation passed');

                 // Get actual position details for tick range and fee tier
         console.log('📍 Fetching position details...');
         
         let actualTickLower: number;
         let actualTickUpper: number;
         let actualFeeTierIndex: number;
         
         try {
             const detailedPosition = await sdk.Position.fetchPositionById({
                 positionId: positionId,
                 address: address,
             });
             console.log("🚀 ~ detailedPosition:", JSON.stringify(detailedPosition, null, 2));

             if (!detailedPosition || !Array.isArray(detailedPosition) || detailedPosition.length === 0) {
                 throw new Error(`Position not found: ${positionId}`);
             }

             const positionData = detailedPosition[0];
             
             // Get tick range from position
             if (positionData.position) {
                 actualTickLower = positionData.position.tickLower;
                 actualTickUpper = positionData.position.tickUpper;
             } else {
                 actualTickLower = positionData.tickLower;
                 actualTickUpper = positionData.tickUpper;
             }
             
             // Get fee tier from position's pool data
             let poolData;
             if (positionData.position && positionData.position.pool) {
                 poolData = positionData.position.pool;
             } else if (positionData.pool) {
                 poolData = Array.isArray(positionData.pool) ? positionData.pool[0] : positionData.pool;
             }
             
             if (poolData && poolData.feeTier !== undefined) {
                 actualFeeTierIndex = poolData.feeTier;
             } else {
                 actualFeeTierIndex = updatedRatioData.feeTierIndex;
             }
             
             if (actualTickLower === undefined || actualTickUpper === undefined || 
                 typeof actualTickLower !== 'number' || typeof actualTickUpper !== 'number' ||
                 actualTickLower >= actualTickUpper) {
                 throw new Error(`Invalid tick range: [${actualTickLower}, ${actualTickUpper}]`);
             }
             
             console.log(`✅ Position details:`);
             console.log(`  Tick range: [${actualTickLower}, ${actualTickUpper}]`);
             console.log(`  Fee tier index: ${actualFeeTierIndex}`);
         } catch (error) {
             console.error('❌ Failed to fetch position details:', error);
             
             // Use ratio data as fallback
             actualTickLower = updatedRatioData.tickLower;
             actualTickUpper = updatedRatioData.tickUpper;
             actualFeeTierIndex = updatedRatioData.feeTierIndex;
             
             if (actualTickLower === undefined || actualTickUpper === undefined || 
                 typeof actualTickLower !== 'number' || typeof actualTickUpper !== 'number' ||
                 actualTickLower >= actualTickUpper) {
                 throw new Error(`Invalid fallback tick range: [${actualTickLower}, ${actualTickUpper}]`);
             }
             
             console.log(`⚠️ Using fallback position data:`);
             console.log(`  Tick range: [${actualTickLower}, ${actualTickUpper}]`);
             console.log(`  Fee tier index: ${actualFeeTierIndex}`);
         }

        // Binary search for optimal allocation
        let bestToken1Amount = 0;
        let bestToken2Amount = 0;
        let bestToken1AmountRaw = 0;
        let bestToken2AmountRaw = 0;
        let found = false;

        const maxUsableToken1 = updatedRatioData.availableToken1 * liquidityPercentage;
        
        // Binary search approach
        let minPercentage = 50.0;
        let maxPercentage = 99.9;
        const maxIterations = 10; // Reduced for simplicity
        const tolerance = 1.0; // Simplified tolerance
        
        let iteration = 0;
        
        console.log(`🔍 Starting binary search for optimal allocation (${maxUsableToken1.toFixed(6)} ${updatedRatioData.token1Symbol} max)...`);
        
        while (iteration < maxIterations && (maxPercentage - minPercentage) > tolerance) {
            iteration++;
            const currentPercentage = (minPercentage + maxPercentage) / 2;
            
            try {
                const adjustedToken1Amount = maxUsableToken1 * (currentPercentage / 100);
                const token1AmountRaw = Math.floor(adjustedToken1Amount * (10 ** updatedRatioData.token1Decimals));
                
                                 console.log(`🔍 Iteration ${iteration}: Testing ${currentPercentage.toFixed(2)}%`);
                 console.log(`  Token1Amount: ${adjustedToken1Amount.toFixed(8)} (${token1AmountRaw} raw)`);
                 
                 // Use FA addresses for calculations (as per documentation)
                 const [_, requiredToken2Raw] = await sdk.Pool.estCurrencyBAmountFromA({
                     currencyA: updatedRatioData.token1Address, // Must be FA type for calculations
                     currencyB: updatedRatioData.token2Address, // Must be FA type for calculations
                     currencyAAmount: token1AmountRaw,
                     feeTierIndex: actualFeeTierIndex, // Use actual position's fee tier
                     tickLower: actualTickLower,
                     tickUpper: actualTickUpper,
                     currentPriceTick: updatedRatioData.currentTick,
                 });

                const requiredToken2 = Number(requiredToken2Raw) / (10 ** updatedRatioData.token2Decimals);
                console.log(`  Required ${updatedRatioData.token2Symbol}: ${requiredToken2.toFixed(8)} (available: ${updatedRatioData.token2Balance.toFixed(8)})`);

                if (requiredToken2 <= updatedRatioData.token2Balance) {
                    // This percentage works, save it and try higher
                    bestToken1Amount = adjustedToken1Amount;
                    bestToken2Amount = requiredToken2;
                    bestToken1AmountRaw = token1AmountRaw;
                    bestToken2AmountRaw = Number(requiredToken2Raw);
                    found = true;
                    minPercentage = currentPercentage; // Search higher
                    console.log(`  ✅ Feasible! Updating best allocation and searching higher.`);
                } else {
                    maxPercentage = currentPercentage; // Search lower
                    console.log(`  ❌ Not feasible - need ${(requiredToken2 - updatedRatioData.token2Balance).toFixed(8)} more ${updatedRatioData.token2Symbol}. Searching lower.`);
                }
            } catch (error) {
                console.log(`  ❌ Iteration ${iteration} failed: ${error}. Searching lower.`);
                maxPercentage = currentPercentage;
            }
        }

        // Fallback if binary search fails
        if (!found) {
            console.log('🔄 Binary search failed, trying 70% fallback...');
            try {
                const fallbackPercentage = 70.0;
                const adjustedToken1Amount = maxUsableToken1 * (fallbackPercentage / 100);
                const token1AmountRaw = Math.floor(adjustedToken1Amount * (10 ** updatedRatioData.token1Decimals));
                
                                 // Use FA addresses for calculations (as per documentation)
                 const [_, requiredToken2Raw] = await sdk.Pool.estCurrencyBAmountFromA({
                     currencyA: updatedRatioData.token1Address, // Must be FA type for calculations
                     currencyB: updatedRatioData.token2Address, // Must be FA type for calculations
                     currencyAAmount: token1AmountRaw,
                     feeTierIndex: actualFeeTierIndex, // Use actual position's fee tier
                     tickLower: actualTickLower,
                     tickUpper: actualTickUpper,
                     currentPriceTick: updatedRatioData.currentTick,
                 });

                const requiredToken2 = Number(requiredToken2Raw) / (10 ** updatedRatioData.token2Decimals);
                
                if (requiredToken2 <= updatedRatioData.token2Balance) {
                    console.log('  ✅ Fallback 70% works!');
                    bestToken1Amount = adjustedToken1Amount;
                    bestToken2Amount = requiredToken2;
                    bestToken1AmountRaw = token1AmountRaw;
                    bestToken2AmountRaw = Number(requiredToken2Raw);
                    found = true;
                } else {
                    console.log(`  ❌ Fallback not feasible - need ${(requiredToken2 - updatedRatioData.token2Balance).toFixed(8)} more ${updatedRatioData.token2Symbol}`);
                }
            } catch (error) {
                console.log(`  ❌ Fallback also failed: ${error}`);
            }
        }

        if (!found) {
            throw new Error(`No feasible allocation found after ${iteration} iterations. Available: ${updatedRatioData.availableToken1.toFixed(6)} ${updatedRatioData.token1Symbol}, ${updatedRatioData.token2Balance.toFixed(6)} ${updatedRatioData.token2Symbol}`);
        }

        console.log(`🎯 Optimal allocation found after ${iteration} iterations:`);
        console.log(`  ${updatedRatioData.token1Symbol}: ${bestToken1Amount.toFixed(6)} (${bestToken1AmountRaw} raw)`);
        console.log(`  ${updatedRatioData.token2Symbol}: ${bestToken2Amount.toFixed(6)} (${bestToken2AmountRaw} raw)`);

                 // Final validation with more reasonable minimums
         const finalMinToken1Raw = 100000; // Reduced from 1M to 100K raw units minimum
         const finalMinToken2Raw = 100000; // Reduced from 1M to 100K raw units minimum
         
         if (bestToken1AmountRaw < finalMinToken1Raw) {
             throw new Error(`Token1 amount too small: ${bestToken1AmountRaw} raw (need at least ${finalMinToken1Raw}). Consider adding more ${updatedRatioData.token1Symbol}.`);
         }
         
         if (bestToken2AmountRaw < finalMinToken2Raw) {
             throw new Error(`Token2 amount too small: ${bestToken2AmountRaw} raw (need at least ${finalMinToken2Raw}). Consider adding more ${updatedRatioData.token2Symbol}.`);
         }

         console.log(`✅ Final amount validation passed: ${bestToken1AmountRaw} >= ${finalMinToken1Raw}, ${bestToken2AmountRaw} >= ${finalMinToken2Raw}`);

        // Step 5: Add liquidity
        console.log('💧 Adding liquidity with optimized amounts...');
        
        // Convert APT FA addresses to coin types for transaction
        const transactionToken1Address = convertAPTAddressForTransaction(updatedRatioData.token1Address);
        const transactionToken2Address = convertAPTAddressForTransaction(updatedRatioData.token2Address);
        
        console.log('🔄 Address conversion for transaction:');
        console.log(`  Token1: ${updatedRatioData.token1Address} → ${transactionToken1Address}`);
        console.log(`  Token2: ${updatedRatioData.token2Address} → ${transactionToken2Address}`);
        
                 // Prepare parameters according to documentation
         const addLiquidityParams = {
             positionId: positionId,
             currencyA: transactionToken1Address, // Use coin type for transactions
             currencyB: transactionToken2Address, // Use coin type for transactions
             currencyAAmount: bestToken1AmountRaw,
             currencyBAmount: bestToken2AmountRaw,
             slippage: 0.1, // 0.1% slippage as per documentation (0.1 means 0.1%)
             feeTierIndex: actualFeeTierIndex, // CRITICAL: Must match position's fee tier
         };

        console.log('⚙️ Add Liquidity Parameters:');
        console.log(JSON.stringify(addLiquidityParams, null, 2));

        const addLiquidityPayload = await sdk.Position.addLiquidityTransactionPayload(addLiquidityParams);
        
        console.log(`🔍 Generated function: ${addLiquidityPayload.function}`);
        
        // Small delay before transaction
        console.log('⏳ Waiting for optimal timing...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const addLiquidityResult = await executeTransaction(addLiquidityPayload, account, 'add liquidity');

        result.details.liquidityAdded = true;
        result.details.transactionHashes.push(addLiquidityResult.transactionHash);
        result.details.liquidityDetails = {
            token1Amount: bestToken1Amount,
            token2Amount: bestToken2Amount,
            token1Symbol: updatedRatioData.token1Symbol,
            token2Symbol: updatedRatioData.token2Symbol,
            txHash: addLiquidityResult.transactionHash
        };

        console.log(`✅ Liquidity added successfully: ${addLiquidityResult.transactionHash}`);

        result.success = true;
        result.message = '✅ **Smart Liquidity Addition Complete**';

        return result;

    } catch (error) {
        console.error(`❌ Smart liquidity addition failed: ${error}`);
        result.success = false;
        result.details.error = String(error);
        result.message = `❌ **Smart Liquidity Addition Failed**: ${String(error)}`;
        return result;
    }
}

/**
 * Add liquidity to an existing position using smart execution (main entry point)
 */
export async function addLiquidityToPosition(
    positionId: string,
    poolId: string,
    env: Env
): Promise<{ success: boolean; message: string; transactionHash?: string }> {
    try {
        console.log(`💧 Starting smart liquidity addition for position ${positionId}...`);

        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();

        // Use the smart liquidity addition
        const result = await executeAddLiquidity({
            positionId,
            poolId,
            swapPercentage: 0.9, // 90% aggressive swap
            liquidityPercentage: 0.9, // Use 90% of available balance
            performSwap: true // Enable automatic swapping
        }, env);

        if (result.success) {
            // Format success message
            const formattedMessage = formatAddLiquidityMessage(result, positionId, poolId, address);
            
            return {
                success: true,
                message: formattedMessage,
                transactionHash: result.details.transactionHashes[result.details.transactionHashes.length - 1]
            };
        } else {
            return {
                success: false,
                message: result.message
            };
        }

    } catch (error) {
        console.error(`❌ Add liquidity failed: ${error}`);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            message: `❌ **Add Liquidity Failed**\n\n📍 Position: \`${positionId}\`\n📍 Pool: \`${poolId}\`\n\n**Error:** ${errorMessage}`
        };
    }
}

/**
 * Execute max token liquidity addition using proven working logic with max token constraints
 */
export async function executeAddLiquidityWithMaxTokenStrategy(
    params: MaxTokenLiquidityParams,
    env: Env
): Promise<AddLiquidityResult> {
    const {
        positionId,
        poolId,
        maxTokenA,
        maxAmountA,
        maxAmountB
    } = params;

    console.log(`💧 Starting max token strategy: ${maxTokenA ? 'Token A' : 'Token B'} for position ${positionId}...`);
    console.log(`📊 Available amounts: Token A = ${maxAmountA}, Token B = ${maxAmountB}`);

    try {
        // Create custom parameters for the proven working function with max token constraints
        const customParams: AddLiquidityParams = {
            positionId,
            poolId,
            swapPercentage: maxTokenA ? 0.1 : 0.9, // Low swap if maxing Token A, high if maxing Token B
            liquidityPercentage: 0.98, // Use 98% of available to avoid rounding issues
            performSwap: true // Allow swapping to optimize
        };

        // For max token strategy, temporarily modify the balance calculation in the working function
        // We'll do this by using the existing smart logic but with custom balance constraints
        
        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();

        // Get ratio data to understand token mapping
        const ratioResponse = await generateRatioResponse(env, address, poolId, null);
        const ratioData = ratioResponse.data;

        if (!ratioData) {
            throw new Error('Failed to get ratio data for max token strategy');
        }

        console.log(`📊 Token mapping: ${ratioData.token1Symbol} = Token A, ${ratioData.token2Symbol} = Token B`);
        console.log(`🎯 Max strategy: Using max ${maxTokenA ? ratioData.token1Symbol : ratioData.token2Symbol}`);

        // Create a modified version of the working add liquidity logic
        // that respects our max token constraints
        const result = await executeAddLiquidityWithCustomBalances({
            positionId,
            poolId,
            customToken1Balance: maxAmountA,
            customToken2Balance: maxAmountB,
            prioritizeToken: maxTokenA ? 'A' : 'B',
            swapPercentage: 0.8, // Conservative swap
            liquidityPercentage: 0.95 // Use 95% of available
        }, env);

        if (result.success) {
            result.message = `✅ **Max ${maxTokenA ? ratioData.token1Symbol : ratioData.token2Symbol} Liquidity Addition Complete**`;
        }

        return result;

    } catch (error) {
        console.error(`❌ Max token strategy failed: ${error}`);
        return {
            success: false,
            message: `❌ **Max Token Strategy Failed**: ${String(error)}`,
            details: {
                swapExecuted: false,
                liquidityAdded: false,
                transactionHashes: [],
                error: String(error)
            }
        };
    }
}

/**
 * Execute add liquidity with custom balance constraints (leverages proven working logic)
 */
export async function executeAddLiquidityWithCustomBalances(
    params: {
        positionId: string;
        poolId: string;
        customToken1Balance: number;
        customToken2Balance: number;
        prioritizeToken: 'A' | 'B';
        swapPercentage: number;
        liquidityPercentage: number;
    },
    env: Env
): Promise<AddLiquidityResult> {
    
    const result: AddLiquidityResult = {
        success: false,
        message: '',
        details: {
            swapExecuted: false,
            liquidityAdded: false,
            transactionHashes: []
        }
    };

    try {
        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();

        // Lazy import heavy SDK components
        const { Network } = await import("@aptos-labs/ts-sdk");
        const { initHyperionSDK } = await import("@hyperionxyz/sdk");

        const sdk = initHyperionSDK({
            network: Network.MAINNET,
            APTOS_API_KEY: env.APTOS_API_KEY
        });

        // Get current ratio and analyze requirements (reuse existing proven logic)
        console.log('📊 Analyzing position with custom balance constraints...');
        const ratioResponse = await generateRatioResponse(env, address, params.poolId, null);
        const ratioData = ratioResponse.data;

        if (!ratioData) {
            throw new Error('Failed to get ratio data');
        }

        // Override the available balances with our custom max amounts
        const customRatioData = {
            ...ratioData,
            availableToken1: params.customToken1Balance,
            token2Balance: params.customToken2Balance
        };

        console.log(`📊 Custom balances: ${customRatioData.token1Symbol} = ${params.customToken1Balance}, ${customRatioData.token2Symbol} = ${params.customToken2Balance}`);
        console.log(`🎯 Prioritizing: Token ${params.prioritizeToken}`);

        // Get position details (reuse existing logic)
        let actualTickLower = customRatioData.tickLower;
        let actualTickUpper = customRatioData.tickUpper;
        let actualFeeTierIndex = customRatioData.feeTierIndex;
        
        try {
            const detailedPosition = await sdk.Position.fetchPositionById({
                positionId: params.positionId,
                address: address,
            });

            if (detailedPosition && Array.isArray(detailedPosition) && detailedPosition.length > 0) {
                const positionData = detailedPosition[0];
                
                if (positionData.position) {
                    actualTickLower = positionData.position.tickLower;
                    actualTickUpper = positionData.position.tickUpper;
                } else {
                    actualTickLower = positionData.tickLower;
                    actualTickUpper = positionData.tickUpper;
                }
                
                let poolData;
                if (positionData.position && positionData.position.pool) {
                    poolData = positionData.position.pool;
                } else if (positionData.pool) {
                    poolData = Array.isArray(positionData.pool) ? positionData.pool[0] : positionData.pool;
                }
                
                if (poolData && poolData.feeTier !== undefined) {
                    actualFeeTierIndex = poolData.feeTier;
                }
                
                console.log(`✅ Position details: Tick range [${actualTickLower}, ${actualTickUpper}], Fee tier ${actualFeeTierIndex}`);
            }
        } catch (error) {
            console.log(`⚠️ Using fallback position data: ${error}`);
        }

        // Calculate optimal amounts using the prioritization strategy
        let finalToken1Amount: number;
        let finalToken2Amount: number;

        if (params.prioritizeToken === 'A') {
            // Use maximum Token A, calculate required Token B
            finalToken1Amount = params.customToken1Balance * params.liquidityPercentage;
            const token1AmountRaw = Math.floor(finalToken1Amount * (10 ** customRatioData.token1Decimals));
            
            const [_, requiredToken2Raw] = await sdk.Pool.estCurrencyBAmountFromA({
                currencyA: customRatioData.token1Address,
                currencyB: customRatioData.token2Address,
                currencyAAmount: token1AmountRaw,
                feeTierIndex: actualFeeTierIndex,
                tickLower: actualTickLower,
                tickUpper: actualTickUpper,
                currentPriceTick: customRatioData.currentTick,
            });

            finalToken2Amount = Number(requiredToken2Raw) / (10 ** customRatioData.token2Decimals);
            
            // Check if we have enough Token B
            if (finalToken2Amount > params.customToken2Balance) {
                throw new Error(`Insufficient ${customRatioData.token2Symbol}: need ${finalToken2Amount.toFixed(6)}, have ${params.customToken2Balance.toFixed(6)}`);
            }
            
        } else {
            // Use maximum Token B, calculate required Token A  
            finalToken2Amount = params.customToken2Balance * params.liquidityPercentage;
            const token2AmountRaw = Math.floor(finalToken2Amount * (10 ** customRatioData.token2Decimals));
            
            // Check if we have a method to calculate A from B
            try {
                const [requiredToken1Raw, _] = await sdk.Pool.estCurrencyAAmountFromB({
                    currencyA: customRatioData.token1Address,
                    currencyB: customRatioData.token2Address,
                    currencyBAmount: token2AmountRaw,
                    feeTierIndex: actualFeeTierIndex,
                    tickLower: actualTickLower,
                    tickUpper: actualTickUpper,
                    currentPriceTick: customRatioData.currentTick,
                });

                finalToken1Amount = Number(requiredToken1Raw) / (10 ** customRatioData.token1Decimals);
                
                if (finalToken1Amount > params.customToken1Balance) {
                    throw new Error(`Insufficient ${customRatioData.token1Symbol}: need ${finalToken1Amount.toFixed(6)}, have ${params.customToken1Balance.toFixed(6)}`);
                }
            } catch (methodError) {
                // If estCurrencyAAmountFromB doesn't exist, use ratio calculation
                console.log('⚠️ Using ratio-based calculation for Token A from Token B');
                finalToken1Amount = finalToken2Amount / customRatioData.liquidityRatio;
                
                if (finalToken1Amount > params.customToken1Balance) {
                    // Reduce Token B amount to fit available Token A
                    finalToken1Amount = params.customToken1Balance * params.liquidityPercentage;
                    finalToken2Amount = finalToken1Amount * customRatioData.liquidityRatio;
                }
            }
        }

        console.log(`🎯 Final amounts: ${finalToken1Amount.toFixed(6)} ${customRatioData.token1Symbol}, ${finalToken2Amount.toFixed(6)} ${customRatioData.token2Symbol}`);

        // Validate minimum amounts
        const finalToken1AmountRaw = Math.floor(finalToken1Amount * (10 ** customRatioData.token1Decimals));
        const finalToken2AmountRaw = Math.floor(finalToken2Amount * (10 ** customRatioData.token2Decimals));
        
        if (finalToken1AmountRaw < 100000 || finalToken2AmountRaw < 100000) {
            throw new Error(`Amounts too small for liquidity addition: ${finalToken1AmountRaw}, ${finalToken2AmountRaw}`);
        }

        // Execute the add liquidity transaction (reuse existing logic)
        console.log('💧 Adding liquidity with max token strategy...');
        
        const transactionToken1Address = convertAPTAddressForTransaction(customRatioData.token1Address);
        const transactionToken2Address = convertAPTAddressForTransaction(customRatioData.token2Address);
        
        const addLiquidityParams = {
            positionId: params.positionId,
            currencyA: transactionToken1Address,
            currencyB: transactionToken2Address,
            currencyAAmount: finalToken1AmountRaw,
            currencyBAmount: finalToken2AmountRaw,
            slippage: 0.1,
            feeTierIndex: actualFeeTierIndex,
        };

        console.log('⚙️ Add Liquidity Parameters:');
        console.log(JSON.stringify(addLiquidityParams, null, 2));

        const addLiquidityPayload = await sdk.Position.addLiquidityTransactionPayload(addLiquidityParams);
        const addLiquidityResult = await executeTransaction(addLiquidityPayload, account, 'max token liquidity addition');

        result.details.liquidityAdded = true;
        result.details.transactionHashes.push(addLiquidityResult.transactionHash);
        result.details.liquidityDetails = {
            token1Amount: finalToken1Amount,
            token2Amount: finalToken2Amount,
            token1Symbol: customRatioData.token1Symbol,
            token2Symbol: customRatioData.token2Symbol,
            txHash: addLiquidityResult.transactionHash
        };

        result.success = true;
        result.message = '✅ **Max Token Liquidity Addition Complete**';

        return result;

    } catch (error) {
        console.error(`❌ Custom balance liquidity addition failed: ${error}`);
        result.success = false;
        result.details.error = String(error);
        result.message = `❌ **Liquidity Addition Failed**: ${String(error)}`;
        return result;
    }
}

/**
 * Add liquidity with max token constraint using proven working logic
 */
export async function addLiquidityWithMaxTokenConstraint(
    params: {
        positionId: string;
        poolId: string;
        maxTokenA: boolean;
        token1MaxAmount: number;
        token2MaxAmount: number;
        token1Symbol: string;
        token2Symbol: string;
    },
    env: Env
): Promise<{ success: boolean; message: string; transactionHash?: string }> {
    try {
        console.log(`💧 Starting max token constraint liquidity addition...`);
        console.log(`🎯 Strategy: Max ${params.maxTokenA ? params.token1Symbol : params.token2Symbol} (keeping 2 in wallet)`);
        console.log(`📊 Available: ${params.token1Symbol}=${params.token1MaxAmount}, ${params.token2Symbol}=${params.token2MaxAmount}`);

        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();

        // Get current wallet balances to calculate percentages
        const { fetchWalletBalances } = await import("../tokenBalances");
        const walletBalances = await fetchWalletBalances(address);
        
        const token1Balance = walletBalances.balances.find(b => b.symbol === params.token1Symbol);
        const token2Balance = walletBalances.balances.find(b => b.symbol === params.token2Symbol);
        
        if (!token1Balance || !token2Balance) {
            throw new Error(`Unable to find balances for ${params.token1Symbol}/${params.token2Symbol}`);
        }

        // Calculate what percentage of available balance our max amounts represent
        const token1Percentage = token1Balance.amount > 0 ? Math.min(0.99, params.token1MaxAmount / token1Balance.amount) : 0;
        const token2Percentage = token2Balance.amount > 0 ? Math.min(0.99, params.token2MaxAmount / token2Balance.amount) : 0;
        
        console.log(`📊 Balance percentages: ${params.token1Symbol}=${(token1Percentage * 100).toFixed(1)}%, ${params.token2Symbol}=${(token2Percentage * 100).toFixed(1)}%`);

        // Use the proven working executeAddLiquidity with custom percentages
        const result = await executeAddLiquidity({
            positionId: params.positionId,
            poolId: params.poolId,
            swapPercentage: params.maxTokenA ? 0.8 : 0.9, // Conservative swap if maxing Token A
            liquidityPercentage: Math.max(token1Percentage, token2Percentage), // Use the higher percentage as base
            performSwap: true // Enable automatic swapping
        }, env);

        if (result.success) {
            const formattedMessage = `✅ **Max ${params.maxTokenA ? params.token1Symbol : params.token2Symbol} Liquidity Complete**\n\n` +
                `📍 Position: \`${params.positionId}\`\n` +
                `📍 Pool: \`${params.poolId}\`\n` +
                `💧 Strategy: Maximum ${params.maxTokenA ? params.token1Symbol : params.token2Symbol} utilization (keeping 2 in wallet)\n\n` +
                `${result.details.swapExecuted ? '💱 Auto-swap executed\n' : ''}` +
                `${result.details.liquidityAdded ? '💧 Liquidity added successfully\n' : ''}` +
                `🔗 Transactions: ${result.details.transactionHashes.length}\n\n` +
                `✅ **Used proven working logic with max token constraints!**`;
            
            return {
                success: true,
                message: formattedMessage,
                transactionHash: result.details.transactionHashes[result.details.transactionHashes.length - 1]
            };
        } else {
            return {
                success: false,
                message: result.message
            };
        }

    } catch (error) {
        console.error(`❌ Max token constraint liquidity addition failed: ${error}`);
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            message: `❌ **Max Token Liquidity Failed**\n\n📍 Position: \`${params.positionId}\`\n📍 Pool: \`${params.poolId}\`\n🎯 Strategy: Max ${params.maxTokenA ? params.token1Symbol : params.token2Symbol}\n\n**Error:** ${errorMessage}`
        };
    }
}

/**
 * Helper function to generate a formatted success message
 */
export function formatAddLiquidityMessage(
    result: AddLiquidityResult,
    positionId: string,
    poolId: string,
    address: string
): string {
    if (!result.success) {
        return `❌ **Liquidity Addition Failed**\n\n📍 Position: \`${positionId}\`\n📍 Pool: \`${poolId}\`\n📍 Address: \`${address}\`\n\n**Error:** ${result.details.error || 'Unknown error'}`;
    }

    let message = `💧 **Smart Liquidity Addition Complete**\n\n`;
    message += `📍 Position: \`${positionId}\`\n`;
    message += `📍 Pool: \`${poolId}\`\n`;
    message += `📍 Address: \`${address}\`\n\n`;

    message += '📊 **Results:**\n';
    
    if (result.details.swapExecuted && result.details.swapDetails) {
        message += `• Swap: ${result.details.swapDetails.amount.toFixed(6)} ${result.details.swapDetails.fromSymbol} → ${result.details.swapDetails.toSymbol}\n`;
        message += `• Swap TX: \`${result.details.swapDetails.txHash.slice(0, 12)}...\`\n`;
    }
    
    if (result.details.liquidityAdded && result.details.liquidityDetails) {
        message += `• Added: ${result.details.liquidityDetails.token1Amount.toFixed(6)} ${result.details.liquidityDetails.token1Symbol} + ${result.details.liquidityDetails.token2Amount.toFixed(6)} ${result.details.liquidityDetails.token2Symbol}\n`;
        message += `• Liquidity TX: \`${result.details.liquidityDetails.txHash.slice(0, 12)}...\`\n`;
    }
    
    message += `• Total Transactions: ${result.details.transactionHashes.length}\n\n`;
    message += '✅ **All operations completed successfully!**';

    return message;
} 
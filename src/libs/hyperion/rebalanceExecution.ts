import type { Env } from '../../env';
import { getAccount } from '../../utils/getAccount';
import { executeAddLiquidity } from './addLiquidity';

import { getCreatePoolPayload } from './createPool';
import { executeTransaction } from './executeTransaction';
import { filterInactivePositions, generateRatioResponse, getAllPositions } from './read';
import { getRemoveLiquidityPayload } from './removeLiquidity';
import { getSwapPayload } from './swap';
import type { PoolConfig } from '../../config/pools';

// Import actual utility functions

interface InactivePosition {
    objectId: string;
    poolId: string;
    poolName: string;
    value: string;
}

interface RebalanceCheckResult {
    success: boolean;
    message: string;
    shouldNotify: boolean;
    inactivePositions: InactivePosition[];
}

interface RebalanceExecutionResult {
    success: boolean;
    message: string;
    details: {
        positionRemoved: boolean;
        swapExecuted: boolean;
        newPositionCreated: boolean;
        additionalLiquidityAdded: boolean;
        transactionHashes: string[];
        swapDetails: Array<{
            fromSymbol: string;
            toSymbol: string;
            amount: number;
        }>;
        newPositions: Array<{
            poolName: string;
            range: string;
        }>;
        error?: string;
    };
}

/**
 * Send progress message to Telegram (with error handling)
 */
async function sendProgressMessage(message: string, env: Env): Promise<void> {
    try {
        const { sendTelegramMessage } = await import('../../utils/telegramMessage');
        await sendTelegramMessage(message, env);
    } catch (error) {
        console.error('❌ Failed to send progress message:', error);
        // Don't throw - progress messages are informational only
    }
}

/**
 * Execute rebalancing for a single position: remove -> swap -> create
 */
export async function executeRebalancing(
    inactivePosition: InactivePosition,
    poolConfig: PoolConfig,
    env: Env,
    forceRebalance = false,
    sendProgressUpdates = true
): Promise<RebalanceExecutionResult> {

    const result: RebalanceExecutionResult = {
        success: false,
        message: '',
        details: {
            positionRemoved: false,
            swapExecuted: false,
            newPositionCreated: false,
            additionalLiquidityAdded: false,
            transactionHashes: [],
            swapDetails: [],
            newPositions: []
        }
    };

    // Check if this is a position creation request (no existing position)
    const isPositionCreation = inactivePosition.objectId === 'CREATE_NEW';

    try {
        const operationType = forceRebalance ? 'Force rebalancing' : 'Rebalancing';
        console.log(`🔄 ${operationType} position ${inactivePosition.objectId} in ${inactivePosition.poolName}...`);
        
        if (forceRebalance) {
            console.log('⚡ Force mode: Will rebalance regardless of active/inactive status');
        }

        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();

        if (isPositionCreation) {
            console.log('🏗️ Creating new position (no existing position to remove)...');
            
            // Send initial creation message
            if (sendProgressUpdates) {
                await sendProgressMessage(
                    `🏗️ **Creating New Position**\n\n📍 Pool: ${inactivePosition.poolName}\n📍 Pool ID: \`${poolConfig.poolId}\`\n\n⏳ Analyzing balances and optimal ratio...`,
                    env
                );
            }
            
            // Skip removal step and go directly to position creation workflow
        } else {
            // Send initial progress message for existing position rebalancing
            if (sendProgressUpdates) {
                await sendProgressMessage(
                    `🔄 **Step 1/3: Removing Liquidity**\n\n📍 Pool: ${inactivePosition.poolName}\n📍 Position: \`${inactivePosition.objectId}\`\n\n⏳ Removing current position...`,
                    env
                );
            }

            // Step 1: Remove liquidity (only for existing positions)
            console.log('🗑️ Removing liquidity...');
            const removePayload = await getRemoveLiquidityPayload(address, inactivePosition.objectId, 1.0, env);
            const removeResult = await executeTransaction(removePayload, account, 'remove liquidity');
            
            result.details.positionRemoved = true;
            result.details.transactionHashes.push(removeResult.transactionHash);
            console.log(`✅ Removed: ${removeResult.transactionHash}`);

            // Send removal success message
            if (sendProgressUpdates) {
                await sendProgressMessage(
                    `✅ **Step 1/3 Complete: Liquidity Removed**\n\n📍 Pool: ${inactivePosition.poolName}\n💫 TX: \`${removeResult.transactionHash.slice(0, 12)}...\`\n\n🔄 **Step 2/3: Checking Swap Requirements**\n\n⏳ Analyzing current balances...`,
                    env
                );
            }
        }

        // Step 2: Get optimal ratio and execute swap (for both creation and rebalancing)
        const stepText = isPositionCreation ? 'Optimal Balance Analysis' : 'Step 2/3: Checking Swap Requirements';
        console.log(`🔍 ${stepText}...`);
        const ratioResponse = await generateRatioResponse(env, address, poolConfig.poolId, poolConfig.rangePercent);
        const ratioResult = ratioResponse.data;

        if (!ratioResult) {
            throw new Error('Failed to get ratio data');
        }

        if (ratioResult.swapAmount && ratioResult.swapAmountRaw && ratioResult.swapFromToken && ratioResult.swapToToken) {
            console.log(`💱 Swapping strategy: ${ratioResult.swapAmount.toFixed(6)} ${ratioResult.swapFromSymbol} → ${ratioResult.swapToSymbol}`);
            
            // Send swap progress message
            if (sendProgressUpdates) {
                const swapStepText = isPositionCreation ? 'Optimizing Token Balance' : 'Step 2/3: Executing Swap';
                await sendProgressMessage(
                    `💱 **${swapStepText}**\n\n📍 Pool: ${inactivePosition.poolName}\n🔄 Swap: ${ratioResult.swapAmount.toFixed(6)} ${ratioResult.swapFromSymbol} → ${ratioResult.swapToSymbol}\n\n⏳ Executing swap to optimize balance...`,
                    env
                );
            }
            
            // Execute 90% swap to be more aggressive while still avoiding over-swapping
            const swapPercentage = 0.9;
            const swapAmountRaw = Math.floor(ratioResult.swapAmountRaw * swapPercentage);
            const swapAmount = ratioResult.swapAmount * swapPercentage;
            
            console.log(`🎯 Executing swap (90%): ${swapAmount.toFixed(6)} ${ratioResult.swapFromSymbol} → ${ratioResult.swapToSymbol}`);
            
            const swapPayload = await getSwapPayload({
                swapFromToken: ratioResult.swapFromToken,
                swapToToken: ratioResult.swapToToken,
                swapAmountRaw: swapAmountRaw,
                recipient: address
            }, env);

            const swapResult = await executeTransaction(swapPayload, account, 'swap (90%)');
            result.details.transactionHashes.push(swapResult.transactionHash);
            console.log(`✅ Swap completed: ${swapResult.transactionHash}`);
 
            // Track swap details for summary
            result.details.swapDetails.push({
                fromSymbol: ratioResult.swapFromSymbol || '',
                toSymbol: ratioResult.swapToSymbol || '',
                amount: swapAmount
            });
            
            result.details.swapExecuted = true;

            // Send swap success message
            if (sendProgressUpdates) {
                const nextStepText = isPositionCreation ? 'Creating Position' : 'Step 3/3: Creating New Position';
                await sendProgressMessage(
                    `✅ **Swap Complete**\n\n📍 Pool: ${inactivePosition.poolName}\n💱 Swapped: ${swapAmount.toFixed(6)} ${ratioResult.swapFromSymbol} → ${ratioResult.swapToSymbol}\n💫 TX: \`${swapResult.transactionHash.slice(0, 12)}...\`\n\n🔄 **${nextStepText}**\n\n⏳ Waiting for balances to update...`,
                    env
                );
            }
        } else {
            console.log('✅ No swap needed - balances already optimal');
            
            // Send no-swap message
            if (sendProgressUpdates) {
                const nextStepText = isPositionCreation ? 'Creating Position' : 'Step 3/3: Creating New Position';
                await sendProgressMessage(
                    `✅ **No Swap Needed**\n\n📍 Pool: ${inactivePosition.poolName}\n💰 Balances already optimal\n\n🔄 **${nextStepText}**\n\n⏳ Proceeding with position creation...`,
                    env
                );
            }
        }

        // Step 3: Create new position with fresh balance calculation
        const positionStepText = isPositionCreation ? 'Creating Position' : 'Step 3/3: Creating New Position';
        console.log(`🏗️ ${positionStepText} with updated balances...`);
        
        // Wait for balances to fully update after swap (critical for avoiding insufficient balance errors)
        console.log('⏳ Waiting for balances to fully update after operations...');
        await new Promise(resolve => setTimeout(resolve, 5000)); // 5 seconds
        
        const finalRatioResponse = await generateRatioResponse(env, address, poolConfig.poolId, poolConfig.rangePercent);
        const finalRatioResult = finalRatioResponse.data;

        if (!finalRatioResult) {
            throw new Error('Failed to get final ratio data');
        }

        // SAFETY CHECK: Only prevent position creation if BOTH balances are extremely low
        const isAPTstkAPTPool = (finalRatioResult.token1Symbol === 'APT' && finalRatioResult.token2Symbol === 'stkAPT') || 
                               (finalRatioResult.token1Symbol === 'stkAPT' && finalRatioResult.token2Symbol === 'APT');
        
        if (isAPTstkAPTPool) {
            const minimumBalanceForPosition = 0.01; // Very low threshold - just check for API issues
            const hasToken1 = finalRatioResult.availableToken1 >= minimumBalanceForPosition;
            const hasToken2 = finalRatioResult.token2Balance >= minimumBalanceForPosition;
            
            console.log(`🛡️ APT/stkAPT Position Safety Check:`);
            console.log(`  ${finalRatioResult.token1Symbol}: ${finalRatioResult.availableToken1} (has balance: ${hasToken1})`);
            console.log(`  ${finalRatioResult.token2Symbol}: ${finalRatioResult.token2Balance} (has balance: ${hasToken2})`);
            
            // Only block if BOTH balances are extremely low (likely API issue)
            if (!hasToken1 && !hasToken2) {
                throw new Error(`Cannot create position: Both token balances are extremely low. ${finalRatioResult.token1Symbol}: ${finalRatioResult.availableToken1}, ${finalRatioResult.token2Symbol}: ${finalRatioResult.token2Balance}. This suggests a balance fetching issue.`);
            }
            
            // Allow position creation even with imbalanced tokens - that's normal for out-of-range positions
            if (!hasToken1 || !hasToken2) {
                console.log(`✅ APT/stkAPT position creation allowed with imbalanced tokens (normal for out-of-range positions)`);
                console.log(`  This is exactly the scenario where swapping helps rebalance the portfolio`);
            }
        }

        // Send position creation progress
        if (sendProgressUpdates) {
            const rangeText = poolConfig.rangePercent ? `±${poolConfig.rangePercent}%` : 'Tightest Range';
            await sendProgressMessage(
                `🏗️ **Step 3/3: Creating Position**\n\n📍 Pool: ${inactivePosition.poolName}\n📊 Range: ${rangeText}\n💰 Final Balances:\n• ${finalRatioResult.token1Symbol}: ${finalRatioResult.availableToken1.toFixed(6)}\n• ${finalRatioResult.token2Symbol}: ${finalRatioResult.token2Balance.toFixed(6)}\n\n⏳ Creating new position...`,
                env
            );
        }

        console.log(`🔧 Preparing position creation with final balances:`);
        console.log(`  ${finalRatioResult.token1Symbol}: Available=${finalRatioResult.availableToken1.toFixed(8)}, Total=${finalRatioResult.token1Balance.toFixed(8)}`);
        console.log(`  ${finalRatioResult.token2Symbol}: Available=${finalRatioResult.token2Balance.toFixed(8)}`);
        console.log(`  Tick Range: [${finalRatioResult.tickLower}, ${finalRatioResult.tickUpper}], Current: ${finalRatioResult.currentTick}`);
        
        let createPoolPayload;
        let createResult;
        
        try {
            createPoolPayload = await getCreatePoolPayload({
                token1Address: finalRatioResult.token1Address,
                token2Address: finalRatioResult.token2Address,
                feeTierIndex: finalRatioResult.feeTierIndex,
                currentTick: finalRatioResult.currentTick,
                tickLower: finalRatioResult.tickLower,
                tickUpper: finalRatioResult.tickUpper,
                token1Balance: finalRatioResult.token1Balance,
                token2Balance: finalRatioResult.token2Balance,
                availableToken1: finalRatioResult.availableToken1,
                token1Decimals: finalRatioResult.token1Decimals,
                token2Decimals: finalRatioResult.token2Decimals,
                token1Symbol: finalRatioResult.token1Symbol,
                token2Symbol: finalRatioResult.token2Symbol
            }, env);
            
            console.log('🔧 Position creation payload generated successfully');
            createResult = await executeTransaction(createPoolPayload, account, 'create position');
            
        } catch (positionCreationError) {
            console.error('❌ Position creation failed:', positionCreationError);
            
            // Enhanced error reporting
            const errorMessage = positionCreationError instanceof Error ? positionCreationError.message : String(positionCreationError);
            
            if (errorMessage.includes('INSUFFICIENT_BALANCE')) {
                // Try to get fresh balances one more time to see what happened
                console.log('🔍 Insufficient balance error - checking current balances...');
                try {
                    const debugRatioResponse = await generateRatioResponse(env, address, poolConfig.poolId, poolConfig.rangePercent);
                    if (debugRatioResponse.data) {
                        const debugData = debugRatioResponse.data;
                        console.log(`💰 Current balances: ${debugData.availableToken1.toFixed(8)} ${debugData.token1Symbol}, ${debugData.token2Balance.toFixed(8)} ${debugData.token2Symbol}`);
                        console.log(`📊 Market price: 1 ${debugData.token1Symbol} = ${debugData.marketPrice.toFixed(6)} ${debugData.token2Symbol}`);
                        console.log(`⚖️ Optimal ratio: 1:${debugData.liquidityRatio.toFixed(6)}`);
                    }
                } catch (debugError) {
                    console.error('❌ Could not fetch debug balances:', debugError);
                }
                
                throw new Error(`Position creation failed due to insufficient balance. ${errorMessage}. This may be due to slippage from swaps or timing issues with balance updates.`);
            } else {
                throw positionCreationError;
            }
        }
        
        
        result.details.newPositionCreated = true;
        result.details.transactionHashes.push(createResult.transactionHash);
        console.log(`✅ Created: ${createResult.transactionHash}`);
        
        // Send position creation success message
        if (sendProgressUpdates) {
            const rangeText = poolConfig.rangePercent ? `±${poolConfig.rangePercent}%` : 'Tightest Range';
            await sendProgressMessage(
                `✅ **Step 3/3 Complete: New Position Created**\n\n📍 Pool: ${inactivePosition.poolName}\n💫 TX: \`${createResult.transactionHash.slice(0, 12)}...\`\n📊 Range: ${rangeText}\n\n🔄 **Checking for Additional Optimizations**\n\n⏳ Analyzing remaining balances...`,
                env
            );
        }
        
        // Track new position details for summary
        const rangeText = poolConfig.rangePercent ? `±${poolConfig.rangePercent}%` : 'Tightest Range';
        result.details.newPositions.push({
            poolName: inactivePosition.poolName,
            range: rangeText
        });

        // Step 4: OPTIONAL - Add any remaining liquidity to maximize position utilization
        // Since we used conservative 70% swapping, there might be remaining tokens that can be added
        console.log('🔧 Checking for additional liquidity addition opportunities...');
        try {
            // Use the new position ID from the create transaction (we need to extract it)
            // For now, let's use a simplified approach and check if we have meaningful remaining balances
            const postCreateRatioResponse = await generateRatioResponse(env, address, poolConfig.poolId, poolConfig.rangePercent);
            const postCreateRatioData = postCreateRatioResponse.data;

            if (postCreateRatioData) {
                const remainingToken1 = postCreateRatioData.availableToken1;
                const remainingToken2 = postCreateRatioData.token2Balance;
                
                console.log(`🔍 Remaining balances: ${remainingToken1.toFixed(6)} ${postCreateRatioData.token1Symbol}, ${remainingToken2.toFixed(6)} ${postCreateRatioData.token2Symbol}`);
                
                // Check if we have meaningful amounts to add (more than 0.01 tokens)
                const meaningfulThreshold = 0.01;
                if (remainingToken1 > meaningfulThreshold || remainingToken2 > meaningfulThreshold) {
                    console.log('💧 Meaningful remaining balances detected - attempting additional liquidity addition...');
                    
                    // We need to find the newly created position ID
                    // For simplicity, let's get all positions and find the most recent one in this pool
                    const updatedPositions = await getAllPositions(address, env);
                    const poolPositions = updatedPositions.filter(pos => 
                        pos.position.pool.poolId.toLowerCase() === poolConfig.poolId.toLowerCase()
                    );
                    
                    if (poolPositions.length > 0) {
                        // Sort by creation date and get the most recent
                        const newestPosition = poolPositions.sort((a, b) => 
                            new Date(b.position.createdAt).getTime() - new Date(a.position.createdAt).getTime()
                        )[0];
                        
                        console.log(`🎯 Attempting to add remaining liquidity to position: ${newestPosition.position.objectId}`);
                        
                        const additionalLiquidityResult = await executeAddLiquidity({
                            positionId: newestPosition.position.objectId,
                            poolId: poolConfig.poolId,
                            swapPercentage: 0.9, // More aggressive for additional liquidity
                            liquidityPercentage: 0.9, // Use 90% of remaining balance
                            performSwap: true // Allow swapping for optimal ratio
                        }, env);
                        
                        if (additionalLiquidityResult.success) {
                            result.details.additionalLiquidityAdded = true;
                            result.details.transactionHashes.push(...additionalLiquidityResult.details.transactionHashes);
                            
                            // Add swap details if any
                            if (additionalLiquidityResult.details.swapExecuted && additionalLiquidityResult.details.swapDetails) {
                                result.details.swapDetails.push({
                                    fromSymbol: additionalLiquidityResult.details.swapDetails.fromSymbol,
                                    toSymbol: additionalLiquidityResult.details.swapDetails.toSymbol,
                                    amount: additionalLiquidityResult.details.swapDetails.amount
                                });
                            }
                            
                            console.log(`✅ Additional liquidity added successfully`);
                        } else {
                            console.log(`⚠️ Additional liquidity addition failed (non-critical): ${additionalLiquidityResult.details.error}`);
                        }
                    } else {
                        console.log('⚠️ Could not find newly created position for additional liquidity');
                    }
                } else {
                    console.log('✅ No meaningful remaining balances - skipping additional liquidity');
                }
            }
        } catch (additionalLiquidityError) {
            console.log(`⚠️ Additional liquidity check failed (non-critical): ${additionalLiquidityError}`);
            // Don't fail the entire rebalancing for this optional step
        }

        result.success = true;
        const actionText = isPositionCreation ? 'position created' : 'rebalanced';
        result.message = `✅ **${inactivePosition.poolName}** ${actionText} successfully${result.details.additionalLiquidityAdded ? ' with additional liquidity optimization' : ''}`;

        // Send final completion message
        if (sendProgressUpdates) {
            const completionTitle = isPositionCreation ? 'Position Creation Complete' : 'Rebalancing Complete';
            let completionMessage = `🎉 **${completionTitle}**\n\n📍 Pool: ${inactivePosition.poolName}\n\n`;
            completionMessage += `📊 **Actions Completed:**\n`;
            if (!isPositionCreation) {
                completionMessage += `• ✅ Liquidity Removed\n`;
            }
            if (result.details.swapExecuted) {
                const totalSwaps = result.details.swapDetails.reduce((total, swap) => total + swap.amount, 0);
                completionMessage += `• ✅ Balance Optimization: ${totalSwaps.toFixed(6)} tokens swapped\n`;
            } else {
                completionMessage += `• ✅ No Balance Optimization Needed\n`;
            }
            completionMessage += `• ✅ New Position Created\n`;
            if (result.details.additionalLiquidityAdded) {
                completionMessage += `• ✅ Additional Liquidity Added\n`;
            }
            completionMessage += `\n📈 **Total Transactions:** ${result.details.transactionHashes.length}\n\n`;
            completionMessage += `🚀 **${isPositionCreation ? 'Position creation' : 'All operations'} completed successfully!**`;
            
            await sendProgressMessage(completionMessage, env);
        }

        return result;

    } catch (error) {
        console.error(`❌ ${isPositionCreation ? 'Position creation' : 'Rebalancing'} failed: ${error}`);
        result.success = false;
        result.details.error = String(error);
        const actionText = isPositionCreation ? 'position creation' : 'rebalancing';
        result.message = `❌ **${inactivePosition.poolName}** ${actionText} failed: ${String(error)}`;
        
        // Send error message with progress summary
        if (sendProgressUpdates) {
            const errorTitle = isPositionCreation ? 'Position Creation Failed' : 'Rebalancing Failed';
            let errorMessage = `❌ **${errorTitle}**\n\n📍 Pool: ${inactivePosition.poolName}\n\n`;
            errorMessage += `📊 **Progress Made:**\n`;
            if (!isPositionCreation) {
                errorMessage += `• ${result.details.positionRemoved ? '✅' : '❌'} Liquidity Removal\n`;
            }
            errorMessage += `• ${result.details.swapExecuted ? '✅' : '❌'} Balance Optimization\n`;
            errorMessage += `• ${result.details.newPositionCreated ? '✅' : '❌'} Position Creation\n`;
            if (result.details.transactionHashes.length > 0) {
                errorMessage += `\n📈 **Partial Transactions:** ${result.details.transactionHashes.length}\n`;
            }
            errorMessage += `\n**Error:** ${String(error)}`;
            
            await sendProgressMessage(errorMessage, env);
        }
        
        return result;
    }
}

/**
 * Check if rebalancing is needed and return inactive positions
 * @param poolsToMonitor - Array of pool configurations to monitor
 * @param env - Environment variables
 * @param specificPoolId - Optional: if provided, only check this specific pool
 * @param forceAllPositions - Optional: if true, return ALL positions regardless of active/inactive status
 */
export async function checkRebalancingNeeded(
    poolsToMonitor: PoolConfig[],
    env: Env,
    specificPoolId?: string,
    forceAllPositions = false
): Promise<RebalanceCheckResult> {

    const result: RebalanceCheckResult = {
        success: true,
        message: '',
        shouldNotify: false,
        inactivePositions: []
    };

    try {
        const operationType = forceAllPositions ? 'Force rebalancing check' : 'Rebalancing check';
        console.log(`🔍 ${operationType} for ${specificPoolId ? `pool ${specificPoolId}` : 'all pools'}...`);

        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();

        // Get all positions
        const allPositions = await getAllPositions(address, env);

        // Filter for managed pools or specific pool
        let managedPoolIds: string[];
        let poolsToCheck: PoolConfig[];

        if (specificPoolId) {
            // Check specific pool only
            managedPoolIds = [specificPoolId];
            poolsToCheck = poolsToMonitor.filter(p => p.poolId.toLowerCase() === specificPoolId.toLowerCase());
            if (poolsToCheck.length === 0) {
                // Create a temporary pool config for the specific pool
                poolsToCheck = [{
                    poolId: specificPoolId,
                    name: 'Target Pool',
                    enabled: true,
                    rangePercent: null
                }];
            }
        } else {
            // Use enabled pools only for scheduled checks
            managedPoolIds = poolsToMonitor.filter(p => p.enabled).map(p => p.poolId);
            poolsToCheck = poolsToMonitor.filter(p => p.enabled);
        }

        const managedPositions = allPositions.filter(pos =>
            managedPoolIds.some(managedId => managedId.toLowerCase() === pos.position.pool.poolId.toLowerCase())
        );

        // Get positions to rebalance based on mode
        let positionsToRebalance: typeof managedPositions;
        if (forceAllPositions) {
            // Force mode: get ALL positions in the pool(s)
            positionsToRebalance = managedPositions;
            console.log(`🔧 Force mode: Found ${positionsToRebalance.length} total position(s) to force rebalance`);
        } else {
            // Normal mode: get only positions that need rebalancing based on pool configuration
            const { getPoolConfigsForFilter } = await import('../../config/pools');
            const poolConfigsForFilter = getPoolConfigsForFilter();
            positionsToRebalance = await filterInactivePositions(managedPositions, env, poolConfigsForFilter);
            console.log(`🔍 Normal mode: Found ${positionsToRebalance.length} position(s) needing rebalancing`);
        }

        // Convert to our format with pool names
        result.inactivePositions = positionsToRebalance.map(pos => {
            const poolConfig = poolsToCheck.find(p => p.poolId.toLowerCase() === pos.position.pool.poolId.toLowerCase());
            return {
                objectId: pos.position.objectId,
                poolId: pos.position.pool.poolId,
                poolName: poolConfig?.name || `${pos.position.pool.token1Info.symbol}/${pos.position.pool.token2Info.symbol}`,
                value: `$${Number(pos.value || 0).toFixed(2)}`
            };
        });

        const hasPositionsToRebalance = result.inactivePositions.length > 0;
        const totalValue = positionsToRebalance.reduce((sum, pos) => sum + Number(pos.value || 0), 0);

        if (hasPositionsToRebalance) {
            result.shouldNotify = true;
            const modeText = forceAllPositions ? 'Force Rebalancing' : 'Rebalancing Needed';
            const actionText = forceAllPositions ? 'Force rebalancing will be executed...' : 'Automatic rebalancing will be executed...';
            
            result.message = `${forceAllPositions ? '🔧' : '⚠️'} **${modeText}**

${forceAllPositions ? '🔄' : '🔴'} ${forceAllPositions ? 'Total' : 'Inactive'} Positions: ${result.inactivePositions.length}
💰 ${forceAllPositions ? 'Total' : 'Locked'} Value: $${totalValue.toFixed(2)}

**Positions:**
${result.inactivePositions.map(pos => `• ${pos.poolName}: ${pos.value}`).join('\n')}

**Action Required:**
${actionText}`;
        } else {
            // Check if this is a manual command and we should create a position if none exists
            const isManualCommand = specificPoolId && !forceAllPositions; // Manual /rebalance command
            
            if (isManualCommand && managedPositions.length === 0) {
                // No positions exist in this pool - check if we can create one
                console.log(`🔍 No positions found in pool ${specificPoolId}. Checking if position creation is possible...`);
                
                // Quick check - ensure we have some balance to work with
                try {
                    const { generateRatioResponse } = await import('./read');
                    const account = await getAccount(env.PRIVATE_KEY);
                    const address = account.accountAddress.toString();
                    const ratioCheck = await generateRatioResponse(env, address, specificPoolId, null);
                    
                    if (ratioCheck.data) {
                        const { availableToken1, token2Balance, token1Symbol, token2Symbol } = ratioCheck.data;
                        console.log(`💰 Balance check: ${availableToken1.toFixed(6)} ${token1Symbol}, ${token2Balance.toFixed(6)} ${token2Symbol}`);
                        
                        // Check if we have meaningful balances (at least 0.01 of either token)
                        const hasMinimumBalance = availableToken1 >= 0.01 || token2Balance >= 0.01;
                        
                        if (hasMinimumBalance) {
                            // We can create a position
                            result.shouldNotify = true;
                            result.message = `🏗️ **No Position Found - Creating New Position**

📍 Pool: \`${specificPoolId}\`
⚡ **Action:** Creating new liquidity position...

💰 **Available Balances:**
• ${token1Symbol}: ${availableToken1.toFixed(6)}
• ${token2Symbol}: ${token2Balance.toFixed(6)}

💡 A new position will be created with optimal token balancing.`;
                            
                            // Create a special entry to indicate position creation needed
                            const poolConfig = poolsToCheck.find(p => p.poolId.toLowerCase() === specificPoolId.toLowerCase());
                            result.inactivePositions = [{
                                objectId: 'CREATE_NEW', // Special indicator for position creation
                                poolId: specificPoolId,
                                poolName: poolConfig?.name || 'Target Pool',
                                value: '$0.00' // No existing value since we're creating new
                            }];
                            
                            console.log(`✅ Manual rebalance: Will create new position in pool ${specificPoolId}`);
                        } else {
                            // Insufficient balance
                            result.shouldNotify = true;
                            result.message = `❌ **Cannot Create Position - Insufficient Balance**

📍 Pool: \`${specificPoolId}\`
💰 **Current Balances:**
• ${token1Symbol}: ${availableToken1.toFixed(6)}
• ${token2Symbol}: ${token2Balance.toFixed(6)}

**Issue:** Need at least 0.01 of either token to create a position.

**Next Steps:**
• Transfer more ${token1Symbol} or ${token2Symbol} to your wallet
• Use \`/balances ${address}\` to see all token balances`;
                            
                            console.log(`❌ Manual rebalance blocked: Insufficient balance in pool ${specificPoolId}`);
                        }
                    } else {
                        // Cannot get balance data
                        result.shouldNotify = true;
                        result.message = `❌ **Cannot Check Balances**

📍 Pool: \`${specificPoolId}\`

**Issue:** Unable to fetch current token balances. This might be a network issue or invalid pool ID.

**Next Steps:**
• Verify the pool ID is correct
• Try again in a few moments
• Check network connectivity`;
                        
                        console.log(`❌ Manual rebalance blocked: Cannot get balance data for pool ${specificPoolId}`);
                    }
                } catch (balanceCheckError) {
                    console.error('❌ Balance check failed:', balanceCheckError);
                    result.shouldNotify = true;
                    result.message = `❌ **Position Creation Check Failed**

📍 Pool: \`${specificPoolId}\`

**Error:** ${String(balanceCheckError)}

**Next Steps:**
• Try again in a few moments
• Verify pool ID is correct
• Check your wallet connection`;
                }
            } else {
                const modeText = forceAllPositions ? 'No Positions Found' : 'Portfolio Healthy';
                const detailText = forceAllPositions ? 
                    `No positions found in ${specificPoolId ? 'the specified pool' : 'target pools'}.` :
                    `All ${managedPositions.length} position(s) are active and earning fees.`;
                
                result.message = `${forceAllPositions ? '❌' : '✅'} **${modeText}**

${detailText}`;
            }
        }

        console.log(`✅ Check completed: ${hasPositionsToRebalance ? `${result.inactivePositions.length} ${forceAllPositions ? 'total' : 'inactive'} positions found` : 'No positions to rebalance'}`);
        return result;

    } catch (error) {
        console.error('❌ Rebalancing check failed:', error);
        result.success = false;
        result.shouldNotify = true;
        result.message = `❌ **Portfolio Check Failed**\n\n${String(error)}`;
        return result;
    }
} 
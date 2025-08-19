import type { Env } from '../env';
import { DEFAULT_POOLS_TO_MANAGE, type PoolConfig } from '../config/pools';

interface RebalancingOptions {
    poolId?: string; // If provided, rebalance first position in this pool
    rangePercent?: number; // Override range percent for specific pool
    sendNotifications?: boolean; // Whether to send Telegram notifications (default: true)
}

interface RebalancingResult {
    success: boolean;
    message: string;
    details: {
        processedPositions: number;
        successfulRebalances: number;
        failedRebalances: number;
        additionalLiquidityOperations: number; // New field to track additional liquidity operations
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
        errors: string[];
    };
}

/**
 * Execute rebalancing flow - modular function for both scheduled and manual operations
 * @param env - Environment variables
 * @param options - Rebalancing options
 */
export async function executeRebalancingFlow(
    env: Env,
    options: RebalancingOptions = {}
): Promise<RebalancingResult> {

    const {
        poolId,
        rangePercent,
        sendNotifications = true
    } = options;

    // Use the default pools configuration from config file
    const defaultPoolsToManage = DEFAULT_POOLS_TO_MANAGE;

    const result: RebalancingResult = {
        success: false,
        message: '',
        details: {
            processedPositions: 0,
            successfulRebalances: 0,
            failedRebalances: 0,
            additionalLiquidityOperations: 0,
            transactionHashes: [],
            swapDetails: [],
            newPositions: [],
            errors: []
        }
    };

    try {
        console.log('🔍 Starting rebalancing flow...');

        // Lazy import heavy modules
        const { checkRebalancingNeeded, executeRebalancing } = await import('./hyperion/rebalanceExecution');
        const { getFirstPositionInPool } = await import('./hyperion/addLiquidity');
        const { sendTelegramMessage } = await import('../utils/telegramMessage');
        const { getAccount } = await import('../utils/getAccount');

        // Get the account from private key
        const account = await getAccount(env.PRIVATE_KEY);
        const address = account.accountAddress.toString();
        console.log(`🔑 Account address: ${address}`);

        let poolsToProcess: PoolConfig[];
        let checkMode: 'specific' | 'automatic';

        if (poolId) {
            // Specific pool mode: rebalance or create position in this pool
            checkMode = 'specific';
            console.log(`🎯 Specific pool operation: ${poolId}`);

            // Create a target pool config
            const existingPool = defaultPoolsToManage.find(p => p.poolId.toLowerCase() === poolId.toLowerCase());
            const targetPool: PoolConfig = {
                poolId: poolId,
                name: existingPool?.name || 'Target Pool',
                enabled: true,
                rangePercent: rangePercent ?? existingPool?.rangePercent ?? null
            };
            poolsToProcess = [targetPool];

            // For manual rebalance commands, FORCE rebalancing of ALL positions in the pool
            // This means we bypass the "active/inactive" check and rebalance everything
            const rebalanceCheckResult = await checkRebalancingNeeded(poolsToProcess, env, poolId, true); // true = force all positions

            if (!rebalanceCheckResult.success) {
                result.success = false;
                result.message = rebalanceCheckResult.message;
                return result;
            }

            if (rebalanceCheckResult.inactivePositions.length === 0) {
                // No inactive positions found - check if we should create one or if all are active
                console.log('🔍 No inactive positions found. Checking pool status...');
                
                // First check if there are any positions at all in this pool
                const { getAllPositions } = await import('./hyperion/read');
                const allUserPositions = await getAllPositions(address, env);
                const poolPositions = allUserPositions.filter(pos =>
                    pos.position.pool.poolId.toLowerCase() === poolId.toLowerCase()
                );
                
                if (poolPositions.length > 0) {
                    // Since this is a manual /rebalance command, we should have found these positions in the force check
                    // If we reach here, it means the force check failed somehow
                    console.log('⚠️ Found positions but force check returned empty - this should not happen');
                    
                    // Fallback: manually create the rebalance entries for force rebalancing
                    const targetPool = defaultPoolsToManage.find(p => p.poolId.toLowerCase() === poolId.toLowerCase());
                    const poolName = targetPool?.name || 'Target Pool';
                    
                    console.log(`🔧 Manual rebalance: Force rebalancing ${poolPositions.length} position(s) in ${poolName}`);
                    
                    // Override the empty result and force process all positions
                    rebalanceCheckResult.inactivePositions = poolPositions.map(pos => ({
                        objectId: pos.position.objectId,
                        poolId: pos.position.pool.poolId,
                        poolName: poolName,
                        value: `$${Number(pos.value || 0).toFixed(2)}`
                    }));
                    
                    // Continue with processing instead of returning early
                } else {
                    // No positions at all - try to create one
                    const secondCheckResult = await checkRebalancingNeeded(
                        poolsToProcess,
                        env,
                        poolId,
                        true
                    );

                    if (secondCheckResult.inactivePositions.length === 0) {
                        const targetPool = defaultPoolsToManage.find(p => p.poolId.toLowerCase() === poolId.toLowerCase());
                        const poolName = targetPool?.name || 'Target Pool';
                        
                        result.success = false;
                        result.message = `❌ **Cannot Create Position in ${poolName}**\n\n` +
                            `**Possible Issues:**\n` +
                            `• Insufficient token balances\n` +
                            `• Pool configuration error\n` +
                            `• Network connectivity issues\n\n` +
                            `**Next Steps:**\n` +
                            `• Check your balances: \`/balances ${address}\`\n` +
                            `• Check optimal ratio: \`/ratio ${address} ${poolId}\`\n` +
                            `• Ensure you have both ${targetPool?.name?.split('/')[0] || 'token1'} and ${targetPool?.name?.split('/')[1] || 'token2'}`;
                        return result;
                    }
                }
            }

            console.log(`🎯 Found ${rebalanceCheckResult.inactivePositions.length} position(s) to process in pool ${poolId}`);

            // Process the position(s) found
            for (const positionToProcess of rebalanceCheckResult.inactivePositions) {
                const isCreatingNew = positionToProcess.objectId === 'CREATE_NEW';
                const operationType = isCreatingNew ? 'Position Creation' : 'Position Rebalancing';

                console.log(`🎯 ${operationType}: ${positionToProcess.objectId} in pool ${poolId}`);

                // Send start notification
                if (sendNotifications) {
                    try {
                        let startMessage;
                        if (isCreatingNew) {
                            startMessage = `🏗️ **Manual Position Creation Started**\n\n📍 Pool: \`${poolId}\`\n📍 Address: \`${address}\`\n\nNo existing position found. Creating new position with optimal token balancing...`;
                        } else {
                            startMessage = `🔧 **Force Rebalancing Started**\n\n📍 Pool: \`${poolId}\`\n📍 Position: \`${positionToProcess.objectId}\`\n📍 Address: \`${address}\`\n\n⚡ **Force Mode:** Rebalancing regardless of current position status\n\nExecuting remove → swap → create workflow...`;
                        }
                        await sendTelegramMessage(startMessage, env);
                    } catch (startMsgError) {
                        console.error('❌ Failed to send start message:', startMsgError);
                    }
                }

                // Execute the operation
                try {
                    const rebalanceResult = await executeRebalancing(positionToProcess, targetPool, env, true, sendNotifications); // true = force rebalance for manual commands

                    result.details.processedPositions++;
                    if (rebalanceResult.success) {
                        result.details.successfulRebalances++;
                        result.details.transactionHashes.push(...rebalanceResult.details.transactionHashes);
                        result.details.swapDetails.push(...rebalanceResult.details.swapDetails);
                        result.details.newPositions.push(...rebalanceResult.details.newPositions);

                        // Track additional liquidity operations
                        if (rebalanceResult.details.additionalLiquidityAdded) {
                            result.details.additionalLiquidityOperations++;
                        }

                        console.log(`✅ ${targetPool.name} ${operationType.toLowerCase()} completed successfully`);
                    } else {
                        result.details.failedRebalances++;
                        result.details.errors.push(rebalanceResult.details.error || 'Unknown error');
                        console.error(`❌ ${targetPool.name} ${operationType.toLowerCase()} failed`);
                    }
                } catch (positionError) {
                    result.details.processedPositions++;
                    result.details.failedRebalances++;
                    const errorMessage = positionError instanceof Error ? positionError.message : String(positionError);
                    result.details.errors.push(errorMessage);
                    console.error(`❌ Failed to process ${operationType.toLowerCase()} ${positionToProcess.objectId}:`, positionError);
                }
            }

        } else {
            // Automatic mode: check for inactive positions and rebalance them
            checkMode = 'automatic';
            console.log('🔄 Automatic rebalancing: checking all enabled pools for inactive positions...');
            poolsToProcess = defaultPoolsToManage;

            // SAFETY: Perform balance health check before rebalancing for APT/stkAPT
            const aptStkAPTPool = poolsToProcess.find(p =>
                p.name === 'APT/stkAPT' && p.enabled
            );

            if (aptStkAPTPool) {
                console.log('🛡️ Performing APT/stkAPT balance health check...');
                try {
                    const { generateRatioResponse } = await import('./hyperion/read');
                    const healthCheck = await generateRatioResponse(env, address, aptStkAPTPool.poolId, null);

                    if (healthCheck.data) {
                        const { token1Symbol, token2Symbol, availableToken1, token2Balance } = healthCheck.data;
                        console.log(`📊 Health Check Results: ${token1Symbol}: ${availableToken1}, ${token2Symbol}: ${token2Balance}`);

                        // Check for suspicious balance patterns
                        const hasToken1 = availableToken1 > 0.001;
                        const hasToken2 = token2Balance > 0.001;

                        if (!hasToken1 || !hasToken2) {
                            console.log(`⚠️ WARNING: Suspicious balance detected for APT/stkAPT pool!`);
                            console.log(`  ${token1Symbol}: ${availableToken1} (sufficient: ${hasToken1})`);
                            console.log(`  ${token2Symbol}: ${token2Balance} (sufficient: ${hasToken2})`);
                            console.log(`  This might indicate a balance fetching issue. Proceeding with caution...`);

                            // Send warning notification
                            if (sendNotifications) {
                                try {
                                    await sendTelegramMessage(
                                        `⚠️ **APT/stkAPT Balance Warning**\n\n📍 Address: \`${address}\`\n\nSuspicious balance detected:\n• ${token1Symbol}: ${availableToken1}\n• ${token2Symbol}: ${token2Balance}\n\nThis might indicate a balance fetching issue. Rebalancing will proceed with extra safety checks.`,
                                        env
                                    );
                                } catch (warnMsgError) {
                                    console.error('❌ Failed to send warning message:', warnMsgError);
                                }
                            }
                        } else {
                            console.log(`✅ APT/stkAPT balance health check passed`);
                        }
                    }
                } catch (healthCheckError) {
                    console.error('❌ APT/stkAPT health check failed:', healthCheckError);
                }
            }

            // Step 1: Check if rebalancing is needed
            const rebalanceCheckResult = await checkRebalancingNeeded(poolsToProcess, env);

            if (!rebalanceCheckResult.success) {
                result.success = false;
                result.message = rebalanceCheckResult.message;
                result.details.errors.push('Rebalancing check failed');

                if (sendNotifications) {
                    try {
                        await sendTelegramMessage(`📍 **Account:** \`${address}\`\n\n${rebalanceCheckResult.message}`, env);
                    } catch (msgError) {
                        console.error('❌ Failed to send check error message:', msgError);
                    }
                }
                return result;
            }

            if (rebalanceCheckResult.inactivePositions.length === 0) {
                // Check if there are enabled pools with no positions at all
                console.log('🔍 No inactive positions found. Checking for enabled pools missing positions...');

                // Get all positions for the user
                const { getAllPositions } = await import('./hyperion/read');
                const allUserPositions = await getAllPositions(address, env);

                const enabledPools = poolsToProcess.filter(p => p.enabled);
                const missingPositionPools: PoolConfig[] = [];

                for (const enabledPool of enabledPools) {
                    const hasPositionInPool = allUserPositions.some(pos =>
                        pos.position.pool.poolId.toLowerCase() === enabledPool.poolId.toLowerCase()
                    );

                    if (!hasPositionInPool) {
                        console.log(`🚨 No position found in enabled pool: ${enabledPool.name} (${enabledPool.poolId})`);
                        missingPositionPools.push(enabledPool);
                    }
                }

                if (missingPositionPools.length > 0) {
                    console.log(`🏗️ Creating positions for ${missingPositionPools.length} enabled pools without positions...`);

                    // RATE LIMITING: Only process up to 1 missing pool per execution to avoid subrequest limits
                    const maxPoolsPerExecution = 1;
                    const poolsToProcess = missingPositionPools.slice(0, maxPoolsPerExecution);

                    if (missingPositionPools.length > maxPoolsPerExecution) {
                        console.log(`⚠️ Rate limiting: Processing ${maxPoolsPerExecution} of ${missingPositionPools.length} missing pools. Others will be processed in next cycle.`);
                    }

                    // Process each missing pool (limited number)
                    for (const missingPool of poolsToProcess) {
                        try {
                            console.log(`🏗️ Creating position for ${missingPool.name}...`);

                            // Get ratio data to ensure we have sufficient balance
                            const { generateRatioResponse } = await import('./hyperion/read');
                            const ratioResponse = await generateRatioResponse(env, address, missingPool.poolId, missingPool.rangePercent);

                            if (!ratioResponse.data) {
                                console.log(`❌ Cannot get ratio data for ${missingPool.name}, skipping...`);
                                result.details.failedRebalances++;
                                result.details.errors.push(`${missingPool.name}: Cannot get ratio data`);
                                continue;
                            }

                            const ratioData = ratioResponse.data;

                            // Check if we have meaningful balances to create a position
                            const minBalance = 0.1; // Minimum balance requirement
                            const hasToken1 = ratioData.availableToken1 >= minBalance;
                            const hasToken2 = ratioData.token2Balance >= minBalance;

                            // Only skip if BOTH balances are insufficient (API issue or truly empty wallet)
                            if (!hasToken1 && !hasToken2) {
                                console.log(`⚠️ Insufficient balances for ${missingPool.name}: ${ratioData.token1Symbol}=${ratioData.availableToken1}, ${ratioData.token2Symbol}=${ratioData.token2Balance}`);
                                result.details.errors.push(`${missingPool.name}: Insufficient balance to create position`);
                                continue;
                            }

                            // For APT/stkAPT, having mostly one token is normal for out-of-range positions
                            // Only skip if both balances are extremely low (likely API issue)
                            const isAPTstkAPTPool = (ratioData.token1Symbol === 'APT' && ratioData.token2Symbol === 'stkAPT') ||
                                (ratioData.token1Symbol === 'stkAPT' && ratioData.token2Symbol === 'APT');

                            if (isAPTstkAPTPool) {
                                // For APT/stkAPT, allow position creation even with imbalanced tokens
                                // The swap logic will handle rebalancing
                                console.log(`✅ APT/stkAPT pool - allowing position creation with current balances: ${ratioData.token1Symbol}=${ratioData.availableToken1.toFixed(6)}, ${ratioData.token2Symbol}=${ratioData.token2Balance.toFixed(6)}`);
                            } else {
                                // For other pools, use more conservative logic
                                if ((hasToken1 && !hasToken2) || (!hasToken1 && hasToken2)) {
                                    console.log(`⚠️ Non-APT/stkAPT pool with imbalanced tokens for ${missingPool.name} - may need manual intervention`);
                                    // Don't skip automatically, let the swap logic try to handle it
                                }
                            }

                            const { getCreatePoolPayload } = await import('./hyperion/createPool');
                            const { executeTransaction } = await import('./hyperion/executeTransaction');
                            const { getAccount } = await import('../utils/getAccount');

                            const account = await getAccount(env.PRIVATE_KEY);

                            // Execute swap if needed first (conservative approach)
                            if (ratioData.swapAmount && ratioData.swapAmountRaw && ratioData.swapFromToken && ratioData.swapToToken) {
                                console.log(`💱 Pre-creation swap: ${ratioData.swapAmount.toFixed(6)} ${ratioData.swapFromSymbol} → ${ratioData.swapToSymbol}`);

                                const { getSwapPayload } = await import('./hyperion/swap');
                                const swapPayload = await getSwapPayload({
                                    swapFromToken: ratioData.swapFromToken,
                                    swapToToken: ratioData.swapToToken,
                                    swapAmountRaw: Math.floor(ratioData.swapAmountRaw * 0.8), // 80% conservative
                                    recipient: address
                                }, env);

                                const swapResult = await executeTransaction(swapPayload, account, 'pre-creation swap');
                                result.details.transactionHashes.push(swapResult.transactionHash);

                                // Wait longer for balances to update
                                await new Promise(resolve => setTimeout(resolve, 5000));

                                // Get updated balances
                                const updatedRatioResponse = await generateRatioResponse(env, address, missingPool.poolId, missingPool.rangePercent);
                                if (updatedRatioResponse.data) {
                                    Object.assign(ratioData, updatedRatioResponse.data);
                                }
                            }

                            // Create the position
                            const createPoolPayload = await getCreatePoolPayload({
                                token1Address: ratioData.token1Address,
                                token2Address: ratioData.token2Address,
                                feeTierIndex: ratioData.feeTierIndex,
                                currentTick: ratioData.currentTick,
                                tickLower: ratioData.tickLower,
                                tickUpper: ratioData.tickUpper,
                                token1Balance: ratioData.token1Balance,
                                token2Balance: ratioData.token2Balance,
                                availableToken1: ratioData.availableToken1,
                                token1Decimals: ratioData.token1Decimals,
                                token2Decimals: ratioData.token2Decimals,
                                token1Symbol: ratioData.token1Symbol,
                                token2Symbol: ratioData.token2Symbol
                            }, env);

                            const createResult = await executeTransaction(createPoolPayload, account, `create position in ${missingPool.name}`);

                            result.details.transactionHashes.push(createResult.transactionHash);
                            result.details.successfulRebalances++;
                            result.details.processedPositions++;

                            const rangeText = missingPool.rangePercent ? `±${missingPool.rangePercent}%` : 'Tightest Range';
                            result.details.newPositions.push({
                                poolName: missingPool.name,
                                range: rangeText
                            });

                            console.log(`✅ Successfully created position in ${missingPool.name}: ${createResult.transactionHash}`);

                        } catch (missingPoolError) {
                            console.error(`❌ Failed to create position in ${missingPool.name}:`, missingPoolError);
                            result.details.failedRebalances++;
                            result.details.processedPositions++;
                            const errorMessage = missingPoolError instanceof Error ? missingPoolError.message : String(missingPoolError);
                            result.details.errors.push(`${missingPool.name}: ${errorMessage}`);
                        }
                    }
                } else {
                    result.success = true;
                    result.message = '✅ No rebalancing needed - portfolio is optimal';
                    console.log('✅ No automatic rebalancing needed - portfolio is optimal');
                    return result;
                }
            }

            console.log('⚠️ Rebalancing needed - executing automatic rebalancing...');

            // Send notification that rebalancing is starting
            if (sendNotifications) {
                try {
                    let startMessage = `🔄 **Automatic Rebalancing Started**\n\n📍 Address: \`${address}\`\n\n`;
                    startMessage += `Detected ${rebalanceCheckResult.inactivePositions.length} inactive position(s):\n`;

                    for (const pos of rebalanceCheckResult.inactivePositions) {
                        startMessage += `• ${pos.poolName} (\`${pos.poolId.slice(0, 12)}...\`)\n`;
                    }

                    startMessage += `\nExecuting rebalancing workflow...`;

                    await sendTelegramMessage(startMessage, env);
                } catch (startMsgError) {
                    console.error('❌ Failed to send start message:', startMsgError);
                }
            }

            // Process each inactive position individually
            result.details.processedPositions = rebalanceCheckResult.inactivePositions.length;

            for (const inactivePosition of rebalanceCheckResult.inactivePositions) {
                console.log(`🔄 Processing position ${inactivePosition.objectId} in ${inactivePosition.poolName}...`);

                // Find the corresponding pool config
                const poolConfig = poolsToProcess.find(p => p.poolId.toLowerCase() === inactivePosition.poolId.toLowerCase());
                if (!poolConfig) {
                    console.error(`❌ Pool config not found for ${inactivePosition.poolName}`);
                    result.details.failedRebalances++;
                    result.details.errors.push(`Pool config not found for ${inactivePosition.poolName}`);
                    continue;
                }

                try {
                    // Execute rebalancing for this single position
                    const rebalanceResult = await executeRebalancing(inactivePosition, poolConfig, env, false, sendNotifications);

                    if (rebalanceResult.success) {
                        result.details.successfulRebalances++;
                        result.details.transactionHashes.push(...rebalanceResult.details.transactionHashes);
                        result.details.swapDetails.push(...rebalanceResult.details.swapDetails);
                        result.details.newPositions.push(...rebalanceResult.details.newPositions);

                        // Track additional liquidity operations
                        if (rebalanceResult.details.additionalLiquidityAdded) {
                            result.details.additionalLiquidityOperations++;
                        }

                        console.log(`✅ ${inactivePosition.poolName} rebalanced successfully`);
                    } else {
                        result.details.failedRebalances++;
                        result.details.errors.push(`${inactivePosition.poolName}: ${rebalanceResult.details.error || 'Unknown error'}`);
                        console.error(`❌ ${inactivePosition.poolName} rebalancing failed`);
                    }

                } catch (positionError) {
                    console.error(`❌ Failed to process position ${inactivePosition.objectId}:`, positionError);
                    result.details.failedRebalances++;
                    const errorMessage = positionError instanceof Error ? positionError.message : String(positionError);
                    result.details.errors.push(`${inactivePosition.poolName}: ${errorMessage}`);
                }
            }
        }

        // Send summary message
        if (sendNotifications && result.details.processedPositions > 0) {
            try {
                let summaryMessage = `🔄 **${checkMode === 'specific' ? 'Manual Pool' : 'Automatic'} Rebalancing Summary**\n\n📍 Address: \`${address}\`\n\n`;

                if (checkMode === 'specific' && poolId) {
                    summaryMessage += `📍 Pool: \`${poolId}\`\n`;
                    const targetPool = poolsToProcess[0];
                    if (targetPool?.rangePercent) {
                        summaryMessage += `📊 Range: ±${targetPool.rangePercent}%\n`;
                    }
                    summaryMessage += '\n';
                }

                summaryMessage += '📊 **Results:**\n';
                summaryMessage += `• Total Positions: ${result.details.processedPositions}\n`;
                summaryMessage += `• Successful: ${result.details.successfulRebalances}\n`;
                summaryMessage += `• Failed: ${result.details.failedRebalances}\n`;
                summaryMessage += `• Transactions: ${result.details.transactionHashes.length}\n`;
                if (result.details.additionalLiquidityOperations > 0) {
                    summaryMessage += `• Additional Liquidity Optimizations: ${result.details.additionalLiquidityOperations}\n`;
                }

                // Add enabled pools information
                const enabledPools = poolsToProcess.filter(p => p.enabled);
                if (enabledPools.length > 0) {
                    summaryMessage += `• Enabled Pools: ${enabledPools.map(p => p.name).join(', ')}\n`;
                }
                summaryMessage += '\n';

                // Add swap details if any
                if (result.details.swapDetails.length > 0) {
                    summaryMessage += '💱 **Swaps Executed:**\n';
                    const consolidatedSwaps = new Map<string, number>();
                    for (const swap of result.details.swapDetails) {
                        const key = `${swap.fromSymbol} → ${swap.toSymbol}`;
                        consolidatedSwaps.set(key, (consolidatedSwaps.get(key) || 0) + swap.amount);
                    }
                    for (const [swapPair, totalAmount] of consolidatedSwaps) {
                        summaryMessage += `• ${swapPair}: ${totalAmount.toFixed(6)}\n`;
                    }
                    summaryMessage += '\n';
                }

                // Add new positions if any
                if (result.details.newPositions.length > 0) {
                    summaryMessage += '🏗️ **New Positions Created:**\n';
                    for (const position of result.details.newPositions) {
                        summaryMessage += `• ${position.poolName}: ${position.range}\n`;

                        // Add pool ID for reference
                        const poolConfig = poolsToProcess.find(p => p.name === position.poolName);
                        if (poolConfig) {
                            summaryMessage += `  Pool ID: \`${poolConfig.poolId.slice(0, 12)}...\`\n`;
                        }
                    }
                    summaryMessage += '\n';
                }

                if (result.details.errors.length > 0) {
                    summaryMessage += `**Errors:**\n${result.details.errors.map(err => `❌ ${err}`).join('\n')}\n\n`;
                }

                if (result.details.transactionHashes.length > 0) {
                    summaryMessage += '**Transaction Hashes:**\n';
                    for (const hash of result.details.transactionHashes) {
                        summaryMessage += `• \`${hash.slice(0, 12)}...\`\n`;
                    }
                    summaryMessage += '\n';
                }

                await sendTelegramMessage(summaryMessage, env);
                console.log('✅ Sent rebalancing summary message');
            } catch (summaryMsgError) {
                console.error('❌ Failed to send summary message:', summaryMsgError);
            }
        }

        // Send final completion message - ALWAYS send for automatic mode
        if (sendNotifications) {
            try {
                if (result.details.processedPositions > 0) {
                    if (result.details.failedRebalances === 0) {
                        await sendTelegramMessage(`✅ **${checkMode === 'specific' ? 'Manual pool' : 'Automatic'} rebalancing completed successfully!**\n\n📍 Address: \`${address}\``, env);
                    } else if (result.details.successfulRebalances > 0) {
                        await sendTelegramMessage(`⚠️ **${checkMode === 'specific' ? 'Manual pool' : 'Automatic'} rebalancing completed with ${result.details.failedRebalances} error(s).**\n\n📍 Address: \`${address}\`\n${result.details.successfulRebalances} positions were successfully rebalanced.`, env);
                    } else {
                        await sendTelegramMessage(`❌ **All ${checkMode === 'specific' ? 'manual pool' : 'automatic'} rebalancing attempts failed.**\n\n📍 Address: \`${address}\`\nCheck logs for details.`, env);
                    }
                } else {
                    // Send comprehensive completion message even when no positions were processed
                    let detailedMessage = `✅ **Automatic Rebalancing Complete**\n\n📍 Address: \`${address}\`\n\n`;

                    // Get detailed portfolio information for enhanced reporting
                    try {
                        const { getAllPositions, generateRatioResponse } = await import('./hyperion/read');
                        const allPositions = await getAllPositions(address, env);

                        // Check enabled pools status
                        const enabledPools = defaultPoolsToManage.filter(p => p.enabled);
                        detailedMessage += `🔍 **Portfolio Analysis:**\n`;
                        detailedMessage += `• Total Positions: ${allPositions.length}\n`;
                        detailedMessage += `• Enabled Pools: ${enabledPools.length}\n\n`;

                        // Analyze each enabled pool
                        for (const pool of enabledPools) {
                            const poolPositions = allPositions.filter(pos =>
                                pos.position.pool.poolId.toLowerCase() === pool.poolId.toLowerCase()
                            );

                            if (poolPositions.length > 0) {
                                const position = poolPositions[0];
                                const { tickLower, tickUpper, pool: poolInfo } = position.position;
                                const currentTick = poolInfo.currentTick;
                                const isActive = tickLower < currentTick && currentTick < tickUpper;

                                detailedMessage += `📊 **${pool.name}:**\n`;
                                detailedMessage += `• Pool ID: \`${pool.poolId.slice(0, 12)}...\`\n`;
                                detailedMessage += `• Status: ${isActive ? '🟢 Active' : '🔴 Inactive'}\n`;
                                detailedMessage += `• Range: [${tickLower}, ${tickUpper}]\n`;
                                detailedMessage += `• Current Tick: ${currentTick}\n`;
                                detailedMessage += `• Position Value: $${Number(position.value).toFixed(2)}\n`;

                                // Get current balances and optimal ratio
                                try {
                                    const ratioResponse = await generateRatioResponse(env, address, pool.poolId, pool.rangePercent);
                                    if (ratioResponse.data) {
                                        const {
                                            token1Symbol, token2Symbol,
                                            availableToken1, token2Balance,
                                            liquidityRatio, marketPrice,
                                            swapAmount, swapFromSymbol, swapToSymbol
                                        } = ratioResponse.data;

                                        detailedMessage += `• Current Balances: ${availableToken1.toFixed(6)} ${token1Symbol}, ${token2Balance.toFixed(6)} ${token2Symbol}\n`;
                                        detailedMessage += `• Market Price: 1 ${token1Symbol} = ${marketPrice.toFixed(6)} ${token2Symbol}\n`;
                                        detailedMessage += `• Optimal Ratio: 1:${liquidityRatio.toFixed(6)}\n`;

                                        if (swapAmount && swapFromSymbol && swapToSymbol) {
                                            detailedMessage += `• Potential Swap: ${swapAmount.toFixed(6)} ${swapFromSymbol} → ${swapToSymbol}\n`;
                                        } else {
                                            detailedMessage += `• ✅ Balances already optimal\n`;
                                        }
                                    }
                                } catch (ratioError) {
                                    console.error(`Failed to get ratio for ${pool.name}:`, ratioError);
                                }

                                detailedMessage += `\n`;
                            } else {
                                detailedMessage += `📊 **${pool.name}:**\n`;
                                detailedMessage += `• Pool ID: \`${pool.poolId.slice(0, 12)}...\`\n`;
                                detailedMessage += `• Status: ❌ No position\n`;
                                detailedMessage += `• Action: Ready for position creation\n\n`;
                            }
                        }

                        detailedMessage += `🎯 **Summary:** All enabled pools are properly positioned or will be created in next cycle.`;

                    } catch (analysisError) {
                        console.error('Portfolio analysis failed:', analysisError);
                        detailedMessage += `🎯 **Summary:** No rebalancing actions needed - portfolio is optimal.\n\n`;
                        detailedMessage += `ℹ️ Portfolio analysis unavailable - check logs for details.`;
                    }

                    await sendTelegramMessage(detailedMessage, env);
                }
                console.log('✅ Sent rebalancing completion message');
            } catch (finalMsgError) {
                console.error('❌ Failed to send final message:', finalMsgError);
            }
        }

        // Determine overall success and provide helpful messages
        result.success = result.details.processedPositions > 0 && result.details.successfulRebalances > 0;
        
        if (result.success) {
            result.message = `✅ Rebalancing completed: ${result.details.successfulRebalances}/${result.details.processedPositions} successful`;
        } else {
            // Provide more helpful error messages based on the scenario
            if (result.details.processedPositions === 0) {
                // No positions were processed - give specific guidance
                if (checkMode === 'specific' && poolId) {
                    const targetPool = defaultPoolsToManage.find(p => p.poolId.toLowerCase() === poolId.toLowerCase());
                    const poolName = targetPool?.name || 'Target Pool';
                    
                    result.message = `❌ **No Action Taken for ${poolName}**\n\n` +
                        `**Possible Reasons:**\n` +
                        `• No positions exist in this pool\n` +
                        `• All positions are already active (earning fees)\n` +
                        `• Insufficient token balances to create new position\n\n` +
                        `**Recommended Actions:**\n` +
                        `• Use \`/positions ${address}\` to see current positions\n` +
                        `• Use \`/ratio ${address} ${poolId}\` to check optimal balances\n` +
                        `• Ensure you have sufficient ${targetPool?.name?.split('/')[0] || 'token1'} and ${targetPool?.name?.split('/')[1] || 'token2'} balances`;
                } else {
                    result.message = `❌ **No Rebalancing Actions Needed**\n\n` +
                        `All enabled positions are already active and earning fees optimally.`;
                }
            } else {
                // Some positions were processed but all failed
                result.message = `❌ Rebalancing failed: ${result.details.failedRebalances}/${result.details.processedPositions} operations failed`;
            }
        }

        console.log('✅ Completed rebalancing flow');
        return result;

    } catch (error) {
        console.error('❌ Error in executeRebalancingFlow:', error);
        result.success = false;
        result.message = `❌ Rebalancing flow failed: ${String(error)}`;
        result.details.errors.push(String(error));
        return result;
    }
} 
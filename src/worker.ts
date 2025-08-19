import type { ExecutionContext, ScheduledEvent } from '@cloudflare/workers-types';
import type { Bot, Context } from "grammy";
import { webhookCallback } from "grammy/web";
import type { Env } from "./env";

// Cache the bot instance to avoid recreating it
let botInstance: Bot<Context> | null = null;

// Track processing commands with timestamps to prevent duplicates
const processingCommands = new Map<string, number>();
const DEDUPLICATION_WINDOW = 30000; // 30 seconds

// Clean up old entries periodically
function cleanupOldCommands() {
  const now = Date.now();
  for (const [key, timestamp] of processingCommands.entries()) {
    if (now - timestamp > DEDUPLICATION_WINDOW) {
      processingCommands.delete(key);
    }
  }
}

// Lazy imports to avoid startup overhead
async function getBot(env: Env) {
  if (!botInstance) {
    const { createBot } = await import("./bot");
    botInstance = createBot(env);
  }
  return botInstance;
}

// Background processing function for long commands
async function processLongCommand(update: any, env: Env) {
  try {
    const bot = await getBot(env);
    const message = update?.message;
    const text = message?.text || '';
    const chatId = message?.chat?.id;
    
    console.log(`🚀 Processing long command: ${text}`);
    
    if (text.startsWith('/rebalance')) {
      const { executeRebalancingFlow } = await import("./libs/rebalancingFlow");
      const { getAccount } = await import("./utils/getAccount");
      const { sendTelegramMessage } = await import("./utils/telegramMessage");
      
      // Parse command parameters
      const params = text.trim().split(/\s+/).filter((p: string) => p.length > 0);
      const poolId = params[1];
      const rangePercent = params[2] ? Number.parseFloat(params[2]) : null;
      
      if (!poolId) {
        await sendTelegramMessage("❌ **Invalid Command**\n\nPool ID is required for rebalancing.", env);
        return;
      }
      
      try {
        const account = await getAccount(env.PRIVATE_KEY);
        const personalAddress = account.accountAddress.toString();
        
        console.log(`🚀 Starting manual rebalancing for pool ${poolId}...`);
        
        // Send immediate processing start message
        const rangeDisplay = rangePercent !== null ? `±${rangePercent}%` : 'Tightest Range';
        const startMessage = `🔧 **Manual Rebalancing Started**\n\n📍 Pool: \`${poolId}\`\n📊 Range: ${rangeDisplay}\n📍 Address: \`${personalAddress}\`\n\n⚡ **Processing Now...**\n\nThis operation will:\n• Analyze current positions\n• Remove liquidity if needed\n• Optimize token balances\n• Create new positions\n\nUpdates will follow as each step completes...`;
        
        await sendTelegramMessage(startMessage, env);
        
        const result = await executeRebalancingFlow(env, {
          poolId: poolId,
          rangePercent: rangePercent ?? undefined,
          sendNotifications: true // Enable progress notifications for better user experience
        });
        
        // Send detailed completion message regardless of result
        console.log(`📤 Sending manual rebalancing completion message...`);
        
        if (result.success) {
          const rangeDisplay = rangePercent !== null ? `±${rangePercent}%` : 'Tightest Range';
          let successMessage = "✅ **Manual Pool Rebalancing Complete**\n\n";
          successMessage += `📍 Pool: \`${poolId}\`\n`;
          successMessage += `📊 Range: ${rangeDisplay}\n`;
          successMessage += `📍 Address: \`${personalAddress}\`\n\n`;
          successMessage += "📊 **Results:**\n";
          successMessage += `• Positions Processed: ${result.details.processedPositions}\n`;
          successMessage += `• Successful: ${result.details.successfulRebalances}\n`;
          successMessage += `• Failed: ${result.details.failedRebalances}\n`;
          successMessage += `• Transactions: ${result.details.transactionHashes.length}\n`;
          
          if (result.details.additionalLiquidityOperations > 0) {
            successMessage += `• Additional Liquidity Optimizations: ${result.details.additionalLiquidityOperations}\n`;
          }
          successMessage += "\n";

          // Add swap details if any
          if (result.details.swapDetails.length > 0) {
            successMessage += "💱 **Swaps Executed:**\n";
            const consolidatedSwaps = new Map<string, number>();
            for (const swap of result.details.swapDetails) {
              const key = `${swap.fromSymbol} → ${swap.toSymbol}`;
              consolidatedSwaps.set(key, (consolidatedSwaps.get(key) || 0) + swap.amount);
            }
            for (const [swapPair, totalAmount] of consolidatedSwaps) {
              successMessage += `• ${swapPair}: ${totalAmount.toFixed(6)}\n`;
            }
            successMessage += "\n";
          }

          // Add new positions if any
          if (result.details.newPositions.length > 0) {
            successMessage += "🏗️ **New Positions:**\n";
            for (const position of result.details.newPositions) {
              successMessage += `• ${position.poolName}: ${position.range}\n`;
            }
            successMessage += "\n";
          }

          if (result.details.transactionHashes.length > 0) {
            successMessage += "**Transaction Hashes:**\n";
            for (const hash of result.details.transactionHashes) {
              successMessage += `• \`${hash.slice(0, 12)}...\`\n`;
            }
            successMessage += "\n";
          }

          if (result.details.failedRebalances === 0) {
            successMessage += "🎉 **All operations completed successfully!**";
          } else if (result.details.successfulRebalances > 0) {
            successMessage += `⚠️ **Completed with ${result.details.failedRebalances} error(s).**`;
          }

          await sendTelegramMessage(successMessage, env);
          console.log(`✅ Manual rebalancing success message sent`);
        } else {
          let failureMessage = `❌ **Manual Pool Rebalancing Failed**\n\n📍 Pool: \`${poolId}\`\n📍 Address: \`${personalAddress}\`\n\n`;
          
          if (result.details.errors.length > 0) {
            failureMessage += "**Errors:**\n";
            for (const error of result.details.errors) {
              failureMessage += `• ${error}\n`;
            }
            failureMessage += "\n";
          }
          
          failureMessage += `**Result:** ${result.message}`;
          
          // Include any partial success info
          if (result.details.processedPositions > 0) {
            failureMessage += `\n\n**Partial Results:**\n`;
            failureMessage += `• Positions Processed: ${result.details.processedPositions}\n`;
            failureMessage += `• Successful: ${result.details.successfulRebalances}\n`;
            failureMessage += `• Failed: ${result.details.failedRebalances}\n`;
            
            if (result.details.transactionHashes.length > 0) {
              failureMessage += `\n**Transactions Generated:**\n`;
              for (const hash of result.details.transactionHashes) {
                failureMessage += `• \`${hash.slice(0, 12)}...\`\n`;
              }
            }
          }

          await sendTelegramMessage(failureMessage, env);
          console.log(`📤 Manual rebalancing failure message sent`);
        }
      } catch (error) {
        console.error(`❌ Manual rebalancing failed with exception:`, error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        let exceptionMessage = `💥 **Manual Pool Rebalancing Exception**\n\n📍 Pool: \`${poolId}\`\n\n`;
        exceptionMessage += `**Error:** ${errorMessage}\n\n`;
        exceptionMessage += "This indicates a system-level issue. Please check the logs for more details.";
        
        await sendTelegramMessage(exceptionMessage, env);
        console.log(`📤 Manual rebalancing exception message sent`);
      }
      
    } else if (text.startsWith('/addliquidity')) {
      const { getFirstPositionInPool, addLiquidityToPosition } = await import("./libs/hyperion/addLiquidity");
      const { getAccount } = await import("./utils/getAccount");
      const { sendTelegramMessage } = await import("./utils/telegramMessage");
      
      // Parse command parameters
      const params = text.trim().split(/\s+/).filter((p: string) => p.length > 0);
      const poolId = params[1];
      
      if (!poolId) {
        await sendTelegramMessage("❌ **Invalid Command**\n\nPool ID is required for adding liquidity.", env);
        return;
      }
      
      try {
        const account = await getAccount(env.PRIVATE_KEY);
        const personalAddress = account.accountAddress.toString();
        
        // Find the first position in the specified pool
        const positionId = await getFirstPositionInPool(poolId, env);

        if (!positionId) {
          await sendTelegramMessage(`❌ **No Position Found**\n\n📍 Pool: \`${poolId}\`\n📍 Address: \`${personalAddress}\`\n\nNo positions found in this pool. Create a position first using /rebalance.`, env);
          return;
        }

        await sendTelegramMessage(`🔍 **Position Found**\n\nPosition ID: \`${positionId}\`\n📍 Pool: \`${poolId}\`\n\nAdding liquidity...`, env);

        // Add liquidity to the position
        const result = await addLiquidityToPosition(positionId, poolId, env);
        await sendTelegramMessage(result.message, env);
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await sendTelegramMessage(`❌ **Liquidity Addition Failed**\n\n📍 Pool: \`${poolId}\`\n\n**Error:** ${errorMessage}`, env);
      }
    }
    
  } catch (error) {
    console.error(`❌ Background command processing failed: ${error}`);
    const { sendTelegramMessage } = await import("./utils/telegramMessage");
    await sendTelegramMessage(`❌ **Command Processing Failed**\n\n**Error:** ${String(error)}`, env);
  }
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      // Clean up old command entries
      cleanupOldCommands();
      
      const bot = await getBot(env);
      
      // Parse the update to check for long-running commands
      const update = await request.json();
      
      // Check if this is a command that might take a long time
      const message = update?.message;
      const text = message?.text || '';
      const chatId = message?.chat?.id;
      const isLongCommand = text.startsWith('/rebalance') || text.startsWith('/addliquidity');
      
      if (isLongCommand && chatId) {
        // Create a unique command ID based on chat, command, and time window
        const commandBase = `${chatId}_${text}`;
        const now = Date.now();
        
        // Check if a similar command is already processing within the time window
        let isAlreadyProcessing = false;
        for (const [key, timestamp] of processingCommands.entries()) {
          if (key.startsWith(`${chatId}_`) && key.includes(text.split(' ')[0]) && 
              (now - timestamp) < DEDUPLICATION_WINDOW) {
            isAlreadyProcessing = true;
            console.log(`🔄 Command already processing: ${key}, age: ${now - timestamp}ms`);
            break;
          }
        }
        
        if (isAlreadyProcessing) {
          return new Response('OK', { status: 200 });
        }
        
        // Mark command as processing
        const commandId = `${commandBase}_${now}`;
        processingCommands.set(commandId, now);
        
        // Send immediate acknowledgment via webhook response
        console.log(`🚀 Starting background processing for: ${text}`);
        
        // Start background processing
        ctx.waitUntil(
          processLongCommand(update, env).finally(() => {
            processingCommands.delete(commandId);
            console.log(`✅ Command processing completed: ${commandId}`);
          })
        );
        
        // Return immediate response to prevent Telegram timeout
        return new Response('OK', { status: 200 });
      } else {
        // For regular commands, process normally
        const handleUpdate = webhookCallback(bot, "cloudflare-mod");
        const tempRequest = new Request(request.url, {
          method: request.method,
          headers: request.headers,
          body: JSON.stringify(update)
        });
        return await handleUpdate(tempRequest);
      }
      
    } catch (err) {
      console.error("Error handling update:", err);
      return new Response("Internal Server Error", { status: 500 });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    try {
      console.log('🔄 Starting scheduled monitoring...');

      // Check if scheduled automation is enabled
      const { getScheduleConfig } = await import('./utils/scheduleKV');
      const isScheduleEnabled = await getScheduleConfig(env);
      
      if (!isScheduleEnabled) {
        console.log('⏸️ Scheduled automation is disabled - skipping all scheduled tasks');
        return;
      }

      console.log('✅ Scheduled automation is enabled - proceeding with tasks');

      // CIRCUIT BREAKER: Limit operations to prevent "too many subrequests"
      const operationLimit = {
        maxRebalancingOperations: 2, // Max 2 rebalancing operations per run
        maxPositionCreations: 1,     // Max 1 position creation per run
        maxAPIRetries: 1             // Reduced API retries for scheduled operations
      };

      // Import the modular functions
      const { executeRebalancingFlow } = await import('./libs/rebalancingFlow');
      const { sendScheduledUserNotifications } = await import('./libs/userNotifications');
      const { sendTelegramMessage } = await import('./utils/telegramMessage');

      // Step 1 & 2: Automatic rebalancing (independent of KV addresses)
      // Uses private key from env for personal account management
      try {
        console.log('🏁 Starting automatic rebalancing with rate limits...');
        await executeRebalancingFlow(env, {
          // No poolId = automatic mode (check all enabled pools for inactive positions)
          sendNotifications: true,
          // poolId: "0x925660b8618394809f89f8002e2926600c775221f43bf1919782b297a79400d8"
        });
        console.log('✅ Automatic rebalancing completed');
      } catch (rebalancingError) {
        console.error('❌ Automatic rebalancing failed:', rebalancingError);
        
        // Check if it's a subrequest limit error
        const errorMessage = rebalancingError instanceof Error ? rebalancingError.message : String(rebalancingError);
        
        if (errorMessage.includes('Too many subrequests')) {
          console.log('⚠️ Hit Cloudflare subrequest limit - will retry next cycle');
          // Don't send error notification for rate limiting issues
        } else {
          // Send error notification to admin for other errors
          try {
            const escapedError = errorMessage.replace(/[_*[\]()~`>#+=|{}.!-]/g, ' ');
            await sendTelegramMessage(`❌ **Automatic Rebalancing Error**\n\n${escapedError}`, env);
          } catch (msgError) {
            console.error('❌ Failed to send automatic rebalancing error message:', msgError);
          }
        }
      }

      // Step 3: User notifications for all tracked addresses in KV
      // Only run if we haven't hit limits
      try {
        console.log('📬 Starting user notifications...');
        await sendScheduledUserNotifications(env);
        console.log('✅ User notifications completed');
      } catch (notificationError) {
        console.error('❌ User notifications failed:', notificationError);
        
        const errorMessage = notificationError instanceof Error ? notificationError.message : String(notificationError);
        
        if (!errorMessage.includes('Too many subrequests')) {
          // Send error notification to admin (using original TG_CHAT_ID for admin notifications)
          try {
            const escapedError = errorMessage.replace(/[_*[\]()~`>#+=|{}.!-]/g, ' ');
            await sendTelegramMessage(`❌ **User Notifications Error**\n\n${escapedError}`, env);
          } catch (msgError) {
            console.error('❌ Failed to send user notifications error message:', msgError);
          }
        }
      }

      console.log('✅ Completed scheduled monitoring');

    } catch (error) {
      console.error("Scheduled job failed:", error);

      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Only send error notifications for non-rate-limiting issues
      if (!errorMessage.includes('Too many subrequests')) {
        // Send error notification to admin (using original TG_CHAT_ID for admin notifications)
        try {
          const { sendTelegramMessage } = await import('./utils/telegramMessage');
          const escapedError = errorMessage.replace(/[_*[\]()~`>#+=|{}.!-]/g, ' ');
          await sendTelegramMessage(`❌ **Scheduled Job Error**\n\n${escapedError}`, env);
          console.log('❌ Sent scheduled job error message to admin');
        } catch (finalErrorMsgError) {
          console.error('❌ Failed to send final error message:', finalErrorMsgError);
        }
      } else {
        console.log('⚠️ Scheduled job hit rate limits - will retry next cycle');
      }
    }
  }
};

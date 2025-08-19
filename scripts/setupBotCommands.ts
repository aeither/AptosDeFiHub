import { loadEnv, validateEnv } from "./utils/envLoader";

interface TelegramCommand {
  command: string;
  description: string;
}

/**
 * Script to register all bot commands with Telegram's Bot API
 * This makes the commands appear in the "/" menu for users
 */
async function setupBotCommands() {
  try {
    console.log('🤖 Setting up Telegram bot commands...');
    console.log('=====================================');

    // Load environment variables
    const env = loadEnv();
    
    // Validate required environment variables
    validateEnv(env as unknown as Record<string, string>, ['BOT_TOKEN']);

    const botToken = env.BOT_TOKEN;
    console.log('✅ Bot token loaded');

    // Define all available commands (matching bot.ts exactly)
    const commands: TelegramCommand[] = [
      // Address Management
      {
        command: "add",
        description: "Add address to track"
      },
      {
        command: "remove", 
        description: "Remove address from tracking"
      },
      {
        command: "list",
        description: "Show your tracked addresses"
      },
      {
        command: "clear",
        description: "Clear all tracked addresses"
      },
      
      // Portfolio Analysis
      {
        command: "portfolio",
        description: "Complete portfolio overview with USD values"
      },
      {
        command: "positions",
        description: "View complete portfolio (positions + balances)"
      },
      {
        command: "balances",
        description: "View wallet token balances only"
      },
      {
        command: "pools",
        description: "List farm pools with APR"
      },
      {
        command: "ratio",
        description: "Calculate optimal liquidity ratio"
      },
      
      // Market Data
      {
        command: "prices",
        description: "Get token prices from Panora"
      },
      {
        command: "fee_history",
        description: "View position fee history"
      },
      {
        command: "kofi",
        description: "Compare Kofi Protocol vs Hyperion Swap rates"
      },
      
      // Admin Commands
      {
        command: "rebalance",
        description: "Force rebalance all positions in pool (admin only)"
      },
      {
        command: "addliquidity",
        description: "Add liquidity to first position in pool (admin only)"
      },
      {
        command: "schedule",
        description: "Control scheduled automation on/off (admin only)"
      },
      
      // Help
      {
        command: "start",
        description: "Show welcome message and help"
      }
    ];

    console.log(`📋 Registering ${commands.length} commands...`);

    // Call Telegram Bot API to set commands
    const apiUrl = `https://api.telegram.org/bot${botToken}/setMyCommands`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commands: commands
      })
    });

    const result = await response.json();

    if (response.ok && result.ok) {
      console.log('✅ Commands registered successfully!');
      console.log('\n📝 Registered commands:');
      commands.forEach((cmd, index) => {
        console.log(`${index + 1}. /${cmd.command} - ${cmd.description}`);
      });
      
      console.log('\n💡 Users can now see these commands by typing "/" in the chat');
      console.log('🎉 Bot setup complete!');
      
      return {
        success: true,
        commandsRegistered: commands.length
      };
      
    } else {
      console.error('❌ Failed to register commands:', result);
      return {
        success: false,
        error: result
      };
    }

  } catch (error) {
    console.error('❌ Error setting up bot commands:', error);
    return {
      success: false,
      error: error
    };
  }
}

/**
 * Alternative function to clear/delete all commands
 */
async function clearBotCommands() {
  try {
    console.log('🗑️ Clearing all bot commands...');

    const env = loadEnv();
    validateEnv(env as unknown as Record<string, string>, ['BOT_TOKEN']);

    const botToken = env.BOT_TOKEN;
    const apiUrl = `https://api.telegram.org/bot${botToken}/setMyCommands`;
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        commands: [] // Empty array clears all commands
      })
    });

    const result = await response.json();

    if (response.ok && result.ok) {
      console.log('✅ All commands cleared successfully!');
      return { success: true };
    } else {
      console.error('❌ Failed to clear commands:', result);
      return { success: false, error: result };
    }

  } catch (error) {
    console.error('❌ Error clearing bot commands:', error);
    return { success: false, error: error };
  }
}

/**
 * Function to get current registered commands
 */
async function getCurrentCommands() {
  try {
    console.log('📋 Fetching current bot commands...');

    const env = loadEnv();
    validateEnv(env as unknown as Record<string, string>, ['BOT_TOKEN']);

    const botToken = env.BOT_TOKEN;
    const apiUrl = `https://api.telegram.org/bot${botToken}/getMyCommands`;
    
    const response = await fetch(apiUrl);
    const result = await response.json();

    if (response.ok && result.ok) {
      console.log('✅ Current commands:');
      if (result.result.length === 0) {
        console.log('   No commands registered');
      } else {
        result.result.forEach((cmd: TelegramCommand, index: number) => {
          console.log(`   ${index + 1}. /${cmd.command} - ${cmd.description}`);
        });
      }
      return { success: true, commands: result.result };
    } else {
      console.error('❌ Failed to get commands:', result);
      return { success: false, error: result };
    }

  } catch (error) {
    console.error('❌ Error getting bot commands:', error);
    return { success: false, error: error };
  }
}

// Main execution
async function main() {
  console.log('🚀 Telegram Bot Commands Setup');
  console.log('===============================\n');

  // Check command line arguments
  const args = process.argv.slice(2);
  const command = args[0] || 'setup';

  switch (command) {
    case 'setup':
    case 'register':
      await setupBotCommands();
      break;
      
    case 'clear':
    case 'delete':
      await clearBotCommands();
      break;
      
    case 'list':
    case 'get':
      await getCurrentCommands();
      break;
      
    case 'help':
      console.log('📖 Available commands:');
      console.log('  bun run scripts/setupBotCommands.ts [command]');
      console.log('');
      console.log('Commands:');
      console.log('  setup, register  - Register all bot commands (default)');
      console.log('  clear, delete    - Clear all bot commands');
      console.log('  list, get        - Show current registered commands');
      console.log('  help             - Show this help message');
      break;
      
    default:
      console.log(`❌ Unknown command: ${command}`);
      console.log('Use "help" to see available commands');
      process.exit(1);
  }
}

// Run the script
main().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
}); 
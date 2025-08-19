import type { Env } from "../env";

export interface TokenBalance {
    symbol: string;
    amount: number;
    decimals: number;
    assetType: string;
}

export interface WalletBalances {
    address: string;
    balances: TokenBalance[];
}

export interface PortfolioData {
    address: string;
    walletBalances: WalletBalances;
    positions: unknown[]; // Will be typed properly when integrated
    totalPositionsUSD: number;
}

/**
 * Configuration for tokens to check balances for
 */
const TOKEN_CONFIG = [
    {
        symbol: 'APT',
        assetType: '0x000000000000000000000000000000000000000000000000000000000000000a',
        isNative: true, // Use native coin balance
        decimals: 8
    },
    {
        symbol: 'stkAPT',
        assetType: '0x42556039b88593e768c97ab1a3ab0c6a17230825769304482dff8fdebe4c002b',
        isNative: false,
        decimals: 8
    },
    {
        symbol: 'kAPT',
        assetType: '0x821c94e69bc7ca058c913b7b5e6b0a5c9fd1523d58723a966fb8c1f5ea888105',
        isNative: false,
        decimals: 8
    },
    {
        symbol: 'USDC',
        assetType: '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b',
        isNative: false,
        decimals: 6
    }
];

/**
 * Fetch APT balance specifically (native coin)
 */
async function fetchAPTBalance(address: string): Promise<TokenBalance> {
    try {
        // Lazy import heavy SDK
        const { Aptos, AptosConfig, Network } = await import("@aptos-labs/ts-sdk");

        const config = new AptosConfig({ network: Network.MAINNET });
        const aptos = new Aptos(config);

        const accountAPTAmount = await aptos.getAccountAPTAmount({
            accountAddress: address
        });

        // Convert from octas to APT (APT has 8 decimals)
        const amount = accountAPTAmount / 10 ** 8;

        return {
            symbol: 'APT',
            amount,
            decimals: 8,
            assetType: '0x000000000000000000000000000000000000000000000000000000000000000a'
        };

    } catch (error) {
        console.error("❌ Error fetching APT balance:", error);
        return {
            symbol: 'APT',
            amount: 0,
            decimals: 8,
            assetType: '0x000000000000000000000000000000000000000000000000000000000000000a'
        };
    }
}

/**
 * Fetch balance for a specific fungible asset
 */
async function fetchFABalance(address: string, assetType: string, symbol: string, decimals: number): Promise<TokenBalance> {
    try {
        // Lazy import heavy SDK
        const { Aptos, AptosConfig, Network } = await import("@aptos-labs/ts-sdk");

        const config = new AptosConfig({ network: Network.MAINNET });
        const aptos = new Aptos(config);

        // Get the fungible asset balance
        const balance = await aptos.getCurrentFungibleAssetBalances({
            options: {
                where: {
                    owner_address: { _eq: address },
                    asset_type: { _eq: assetType }
                }
            }
        });

        if (!balance || balance.length === 0) {
            return {
                symbol,
                amount: 0,
                decimals,
                assetType
            };
        }

        const rawAmount = Number(balance[0].amount);
        const amount = rawAmount / 10 ** decimals;

        return {
            symbol,
            amount,
            decimals,
            assetType
        };

    } catch (error) {
        console.error(`❌ Error fetching ${symbol} balance:`, error);
        return {
            symbol,
            amount: 0,
            decimals,
            assetType
        };
    }
}

/**
 * Fetch all configured token balances for an address
 */
export async function fetchWalletBalances(address: string): Promise<WalletBalances> {
    try {
        console.log(`💰 Fetching wallet balances for ${address}...`);

        const balances: TokenBalance[] = [];

        // Fetch balances for all configured tokens
        for (const tokenConfig of TOKEN_CONFIG) {
            try {
                let balance: TokenBalance;

                if (tokenConfig.isNative) {
                    // Use native coin balance for APT
                    balance = await fetchAPTBalance(address);
                } else {
                    // Use fungible asset balance for other tokens
                    balance = await fetchFABalance(
                        address,
                        tokenConfig.assetType,
                        tokenConfig.symbol,
                        tokenConfig.decimals
                    );
                }

                // Only include tokens with non-zero balances
                if (balance.amount > 0) {
                    balances.push(balance);
                    console.log(`✅ ${balance.symbol}: ${balance.amount.toFixed(6)}`);
                }

            } catch (tokenError) {
                console.error(`❌ Error fetching ${tokenConfig.symbol} balance:`, tokenError);
            }
        }

        console.log(`📊 Found ${balances.length} non-zero token balances`);

        return {
            address,
            balances
        };

    } catch (error) {
        console.error('❌ Error in fetchWalletBalances:', error);
        return {
            address,
            balances: []
        };
    }
}

/**
 * Fetch wallet balances with USD values (DEPRECATED - use fetchWalletBalances for faster performance)
 */
export async function fetchWalletBalancesWithUSD(address: string): Promise<WalletBalances> {
    // Just return basic balances without USD values for performance
    return await fetchWalletBalances(address);
}

/**
 * Format wallet balances for display
 */
export function formatWalletBalances(walletBalances: WalletBalances): string {
    if (walletBalances.balances.length === 0) {
        return '💳 **Wallet Balances:** No tokens found';
    }

    let formatted = '💳 **Wallet Balances:**\n';

    for (const balance of walletBalances.balances) {
        const displayAmount = balance.amount < 0.000001 && balance.amount > 0
            ? balance.amount.toExponential(2)
            : balance.amount.toFixed(6);

        formatted += `• ${balance.symbol}: ${displayAmount}\n`;
    }

    return formatted;
}

/**
 * Format wallet balances with USD values for display (DEPRECATED - use formatWalletBalances for faster performance)
 */
export async function formatWalletBalancesWithUSD(walletBalances: WalletBalances): Promise<string> {
    // Just return basic formatting without USD values for performance
    return formatWalletBalances(walletBalances);
}

/**
 * Get balances for specific tokens only (used for targeted queries)
 */
export async function fetchSpecificTokenBalances(
    address: string,
    tokenSymbols: string[]
): Promise<TokenBalance[]> {
    try {
        const filteredConfig = TOKEN_CONFIG.filter(config =>
            tokenSymbols.includes(config.symbol)
        );

        const balances: TokenBalance[] = [];

        for (const tokenConfig of filteredConfig) {
            try {
                let balance: TokenBalance;

                if (tokenConfig.isNative) {
                    balance = await fetchAPTBalance(address);
                } else {
                    balance = await fetchFABalance(
                        address,
                        tokenConfig.assetType,
                        tokenConfig.symbol,
                        tokenConfig.decimals
                    );
                }

                balances.push(balance);

            } catch (tokenError) {
                console.error(`❌ Error fetching ${tokenConfig.symbol} balance:`, tokenError);
            }
        }

        return balances;

    } catch (error) {
        console.error('❌ Error in fetchSpecificTokenBalances:', error);
        return [];
    }
}

/**
 * Generate comprehensive portfolio data (simplified without USD values for faster performance)
 */
export async function generatePortfolioData(address: string, env: Env): Promise<PortfolioData> {
  try {
    console.log(`📊 Generating comprehensive portfolio for ${address}...`);

    // Fetch wallet balances (without USD values for performance)
    const walletBalances = await fetchWalletBalances(address);
    
    // Fetch positions (lazy import to avoid circular dependencies)
    const { getAllPositions } = await import("./hyperion/read");
    const positions = await getAllPositions(address, env);
    
    // Calculate total positions USD value from position values
    let totalPositionsUSD = 0;
    for (const position of positions) {
      if (position.value) {
        totalPositionsUSD += Number.parseFloat(position.value) || 0;
      }
    }

    const portfolioData: PortfolioData = {
      address,
      walletBalances,
      positions,
      totalPositionsUSD
    };

    console.log(`💰 Portfolio Summary:`);
    console.log(`  Positions Value: $${portfolioData.totalPositionsUSD.toFixed(2)}`);

    return portfolioData;

  } catch (error) {
    console.error('❌ Error generating portfolio data:', error);
    return {
      address,
      walletBalances: { address, balances: [] },
      positions: [],
      totalPositionsUSD: 0
    };
  }
}

/**
 * Format complete portfolio for display (simplified without USD values for faster performance)
 */
export async function formatPortfolioResponse(portfolioData: PortfolioData): Promise<string> {
  let response = `📊 **Complete Portfolio for** \`${portfolioData.address}\`\n\n`;
  
  // Portfolio summary at the top (simplified)
  response += `💰 **Portfolio Summary:**\n`;
  response += `• Positions Value: $${portfolioData.totalPositionsUSD.toFixed(2)}\n\n`;
  
  // Wallet balances section (without USD values)
  const walletSection = formatWalletBalances(portfolioData.walletBalances);
  response += `${walletSection}\n\n`;
  
  // Positions section
  if (portfolioData.positions.length > 0) {
    response += `🔄 **Hyperion Positions (${portfolioData.positions.length}):**\n\n`;
    
    for (let index = 0; index < portfolioData.positions.length; index++) {
      const pos = portfolioData.positions[index] as any;
      const { pool } = pos.position;
      const positionValue = Number.parseFloat(pos.value) || 0;
      const isActive = pos.isActive;
      const statusDot = isActive ? '🟢' : '🔴';
      
      response += `*Position ${index + 1}:* ${pool.token1Info.symbol}/${pool.token2Info.symbol}\n`;
      response += `${statusDot} ${isActive ? 'Active' : 'Inactive'} • Value: $${positionValue.toFixed(2)}\n`;
      
      // Add unclaimed rewards summary (without USD formatting)
      const unclaimedFees = (pos.fees?.unclaimed ?? []).reduce((sum: number, fee: any) => sum + Number(fee.amountUSD), 0);
      const unclaimedFarm = (pos.farm?.unclaimed ?? []).reduce((sum: number, farm: any) => sum + Number(farm.amountUSD), 0);
      
      if (unclaimedFees > 0 || unclaimedFarm > 0) {
        response += `💰 Unclaimed: $${(unclaimedFees + unclaimedFarm).toFixed(2)}\n`;
      }
      
      response += '\n';
    }
  } else {
    response += `❌ No Hyperion positions found\n\n`;
  }
  
  response += `💡 *Use /positions for detailed position info*`;
  
  return response;
} 
interface PanoraTokenPrice {
  name: string;
  symbol: string;
  usdPrice: string;
  nativePrice: string;
  decimals: number;
  faAddress?: string;
  tokenAddress?: string;
}

interface TokenPriceMap {
  [symbol: string]: {
    usdPrice: number;
    nativePrice: number;
    address: string;
  };
}

/**
 * Configuration mapping token symbols to their addresses for price lookup
 */
const TOKEN_PRICE_CONFIG = {
  'APT': '0x000000000000000000000000000000000000000000000000000000000000000a',
  'stkAPT': '0x42556039b88593e768c97ab1a3ab0c6a17230825769304482dff8fdebe4c002b',
  'kAPT': '0x821c94e69bc7ca058c913b7b5e6b0a5c9fd1523d58723a966fb8c1f5ea888105',
  'USDC': '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b'
};

/**
 * Fetch price for a single token from Panora API
 */
export async function fetchTokenPrice(tokenAddress: string): Promise<PanoraTokenPrice | null> {
  const endpoint = "https://api.panora.exchange/prices";
  const headers = {
    "x-api-key": "a4^KV_EaTf4MW#ZdvgGKX#HUD^3IFEAOV_kzpIE^3BQGA8pDnrkT7JcIy#HNlLGi",
  };

  try {
    const queryString = new URLSearchParams({ tokenAddress });
    const url = `${endpoint}?${queryString}`;
    
    const response = await fetch(url, {
      method: "GET",
      headers: headers,
    });
    
    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      return data[0] as PanoraTokenPrice;
    }
    
    return null;
  } catch (error) {
    console.error(`❌ Error fetching price for ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Fetch prices for multiple tokens and return as a map
 */
export async function fetchMultipleTokenPrices(tokenSymbols: string[]): Promise<TokenPriceMap> {
  const priceMap: TokenPriceMap = {};
  
  // Fetch prices for all requested tokens
  const pricePromises = tokenSymbols.map(async (symbol) => {
    const address = TOKEN_PRICE_CONFIG[symbol as keyof typeof TOKEN_PRICE_CONFIG];
    if (!address) {
      console.warn(`⚠️ No address configured for token: ${symbol}`);
      return null;
    }

    try {
      const priceData = await fetchTokenPrice(address);
      if (priceData) {
        priceMap[symbol] = {
          usdPrice: Number.parseFloat(priceData.usdPrice),
          nativePrice: Number.parseFloat(priceData.nativePrice),
          address: priceData.faAddress || priceData.tokenAddress || address
        };
        console.log(`✅ Price for ${symbol}: $${priceMap[symbol].usdPrice}`);
      }
      return priceData;
    } catch (error) {
      console.error(`❌ Error fetching price for ${symbol}:`, error);
      return null;
    }
  });

  await Promise.all(pricePromises);
  
  console.log(`📊 Fetched prices for ${Object.keys(priceMap).length}/${tokenSymbols.length} tokens`);
  return priceMap;
}

/**
 * Calculate USD value for a token amount
 */
export function calculateUSDValue(amount: number, usdPrice: number): number {
  return amount * usdPrice;
}

/**
 * Format a USD value for display
 */
export function formatUSDValue(usdValue: number): string {
  if (usdValue === 0) return '$0.00';
  if (usdValue < 0.01) return '<$0.01';
  if (usdValue < 1) return `$${usdValue.toFixed(3)}`;
  if (usdValue < 1000) return `$${usdValue.toFixed(2)}`;
  if (usdValue < 1000000) return `$${(usdValue / 1000).toFixed(2)}K`;
  return `$${(usdValue / 1000000).toFixed(2)}M`;
}

/**
 * Get configured token addresses
 */
export function getConfiguredTokens(): string[] {
  return Object.keys(TOKEN_PRICE_CONFIG);
}

/**
 * Get address for a token symbol
 */
export function getTokenAddress(symbol: string): string | null {
  return TOKEN_PRICE_CONFIG[symbol as keyof typeof TOKEN_PRICE_CONFIG] || null;
} 
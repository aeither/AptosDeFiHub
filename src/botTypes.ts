export interface TokenInfo {
  assetType: string;
  bridge: string | null;
  coinMarketcapId: string;
  coinType: string | null;
  coingeckoId: string;
  decimals: number;
  faType: string;
  hyperfluidSymbol: string;
  logoUrl: string;
  name: string;
  symbol: string;
  isBanned: boolean;
  websiteUrl: string | null;
}

export interface PoolInfo {
  currentTick: number;
  feeRate: string;
  feeTier: number;
  poolId: string;
  senderAddress: string;
  sqrtPrice: string;
  token1: string;
  token2: string;
  token1Info: TokenInfo;
  token2Info: TokenInfo;
}

export interface ClaimedOrUnclaimed {
  amount: string;
  amountUSD: string;
  token: string;
}

export interface HyperionPosition {
  isActive: boolean;
  value: string;
  farm: { claimed: ClaimedOrUnclaimed[]; unclaimed: ClaimedOrUnclaimed[] };
  fees: { claimed: ClaimedOrUnclaimed[]; unclaimed: ClaimedOrUnclaimed[] };
  subsidy: { claimed: ClaimedOrUnclaimed[]; unclaimed: ClaimedOrUnclaimed[] };
  position: {
    objectId: string;
    poolId: string;
    tickLower: number;
    tickUpper: number;
    createdAt: string;
    pool: PoolInfo;
  };
} 
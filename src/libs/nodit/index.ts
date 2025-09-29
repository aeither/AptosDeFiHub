import type { Env } from '../../env';

interface NoditTokenAccount {
  ownerAddress: string;
  objectAddress: string;
  value: string;
  isFrozen: boolean;
  isPrimary: boolean;
  assetType: string;
  tokenStandard: string;
  linkedAssetType: string;
}

interface NoditTokenAccountsResponse {
  page?: number;
  rpp: number;
  cursor?: string;
  count?: number;
  items: NoditTokenAccount[];
}

interface NoditTokenBalanceChange {
  transactionVersion: string;
  transactionTimestamp: string;
  ownerAddress: string;
  objectAddress: string;
  storageId: string;
  assetType: string;
  tokenStandard: string;
  linkedAssetType: string;
  amount: string;
  activity: string;
}

interface NoditTokenBalanceChangesResponse {
  page?: number;
  rpp: number;
  cursor?: string;
  count?: number;
  items: NoditTokenBalanceChange[];
}

const NODIT_BASE_URL = 'https://web3.nodit.io/v1/aptos/mainnet';

export class NoditClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async makeRequest<T>(endpoint: string, body?: any): Promise<T> {
    const url = `${NODIT_BASE_URL}${endpoint}`;
    const options: RequestInit = {
      method: body ? 'POST' : 'GET',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'X-API-KEY': this.apiKey
      }
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`Nodit API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getTokenAccountsByAssetType(
    assetType: string = '0x1::aptos_coin::AptosCoin',
    page?: number,
    rpp: number = 100,
    cursor?: string,
    withCount: boolean = false
  ): Promise<NoditTokenAccountsResponse> {
    const body: any = {
      assetType,
      rpp,
      withCount
    };

    if (page !== undefined) {
      body.page = page;
    }
    
    if (cursor) {
      body.cursor = cursor;
    }

    return this.makeRequest<NoditTokenAccountsResponse>('/token/getTokenAccountsByAssetType', body);
  }

  async getTokenBalanceChangesByAccount(
    ownerAddress: string,
    page?: number,
    rpp: number = 100,
    cursor?: string,
    withCount: boolean = false
  ): Promise<NoditTokenBalanceChangesResponse> {
    const body: any = {
      ownerAddress,
      rpp,
      withCount
    };

    if (page !== undefined) {
      body.page = page;
    }
    
    if (cursor) {
      body.cursor = cursor;
    }

    return this.makeRequest<NoditTokenBalanceChangesResponse>('/token/getTokenBalanceChangesByAccount', body);
  }

  async getTokenBalanceChangesByAssetType(
    assetType: string,
    page?: number,
    rpp: number = 100,
    cursor?: string,
    withCount: boolean = false
  ): Promise<NoditTokenBalanceChangesResponse> {
    const body: any = {
      assetType,
      rpp,
      withCount
    };

    if (page !== undefined) {
      body.page = page;
    }
    
    if (cursor) {
      body.cursor = cursor;
    }

    return this.makeRequest<NoditTokenBalanceChangesResponse>('/token/getTokenBalanceChangesByAssetType', body);
  }
}

export function initNoditClient(env: Env): NoditClient {
  if (!env.NODIT_API_KEY) {
    throw new Error('NODIT_API_KEY environment variable is not set');
  }
  return new NoditClient(env.NODIT_API_KEY);
}

export async function getTokenHolders(
  env: Env,
  assetType: string = '0x1::aptos_coin::AptosCoin',
  limit: number = 20
): Promise<NoditTokenAccount[]> {
  try {
    const client = initNoditClient(env);
    const response = await client.getTokenAccountsByAssetType(assetType, 1, limit, undefined, true);
    
    return response.items;
  } catch (error) {
    console.error('Error fetching token holders:', error);
    return [];
  }
}

export async function getAccountTokenActivity(
  env: Env,
  ownerAddress: string,
  limit: number = 10
): Promise<NoditTokenBalanceChange[]> {
  try {
    const client = initNoditClient(env);
    const response = await client.getTokenBalanceChangesByAccount(ownerAddress, 1, limit);
    
    return response.items;
  } catch (error) {
    console.error('Error fetching token activity:', error);
    return [];
  }
}

export function formatTokenHoldersResponse(holders: NoditTokenAccount[], assetType: string): string {
  if (holders.length === 0) {
    return `❌ No token holders found for asset type: \`${assetType}\``;
  }

  let response = `🪙 **Token Holders for ${assetType}**\n\n`;
  
  holders.slice(0, 20).forEach((holder, index) => {
    const balance = Number(holder.value);
    const formattedBalance = balance > 1000000 
      ? `${(balance / 1000000).toFixed(2)}M`
      : balance > 1000 
        ? `${(balance / 1000).toFixed(2)}K`
        : balance.toFixed(2);
    
    const statusEmoji = holder.isFrozen ? '❄️' : '✅';
    const primaryEmoji = holder.isPrimary ? '⭐' : '';
    
    response += `${index + 1}. **${holder.ownerAddress.slice(0, 8)}...${holder.ownerAddress.slice(-6)}**\n`;
    response += `   💰 Balance: ${formattedBalance}\n`;
    response += `   ${statusEmoji} Status: ${holder.isFrozen ? 'Frozen' : 'Active'} ${primaryEmoji}\n`;
    response += `   🏷️ Standard: ${holder.tokenStandard}\n\n`;
  });

  response += `💡 *Showing top ${Math.min(holders.length, 20)} holders*`;

  return response;
}

export function formatTokenActivityResponse(activity: NoditTokenBalanceChange[], address: string): string {
  if (activity.length === 0) {
    return `❌ No token activity found for address: \`${address}\``;
  }

  let response = `📊 **Token Activity for ${address.slice(0, 8)}...${address.slice(-6)}**\n\n`;
  
  activity.slice(0, 10).forEach((change, index) => {
    const amount = Number(change.amount);
    const formattedAmount = amount > 1000000 
      ? `${(amount / 1000000).toFixed(2)}M`
      : amount > 1000 
        ? `${(amount / 1000).toFixed(2)}K`
        : amount.toFixed(6);
    
    const activityEmoji = change.activity === 'deposit' ? '📈' : '📉';
    const timestamp = new Date(change.transactionTimestamp).toLocaleString();
    
    response += `${index + 1}. ${activityEmoji} **${change.activity.toUpperCase()}**\n`;
    response += `   💰 Amount: ${formattedAmount}\n`;
    response += `   🏷️ Asset: ${change.assetType.split('::').pop() || 'Unknown'}\n`;
    response += `   🕒 Time: ${timestamp}\n`;
    response += `   🆔 Version: ${change.transactionVersion}\n\n`;
  });

  response += `💡 *Showing latest ${Math.min(activity.length, 10)} activities*`;

  return response;
}

export {
  NoditTokenAccount,
  NoditTokenAccountsResponse,
  NoditTokenBalanceChange,
  NoditTokenBalanceChangesResponse
};
#!/usr/bin/env tsx

import { SwapAggregator, Environment, NetworkId } from "@kanalabs/aggregator";
import {
  Account,
  AccountAddress,
  Aptos,
  AptosConfig,
  Ed25519PrivateKey,
  Network,
} from "@aptos-labs/ts-sdk";
import { loadEnv, validateEnv } from '../utils/envLoader';

// Setup environment using Cloudflare-compatible loader
const env = loadEnv();
validateEnv(env as unknown as Record<string, string>, [
  'PRIVATE_KEY',
  'APTOS_API_KEY'
]);

// Setup Signer
const aptosSigner = Account.fromPrivateKey({
  privateKey: new Ed25519PrivateKey(env.PRIVATE_KEY || ""),
  legacy: true,
});

// Setup Aptos provider
const aptosConfig = new AptosConfig({ network: Network.MAINNET });
const aptosProvider = new Aptos(aptosConfig);

// Setup Kana swap aggregator
const swap = new SwapAggregator(Environment.production, {
  providers: {
    //@ts-ignore
    aptos: aptosProvider,
  },
  signers: {
    //@ts-ignore
    aptos: aptosSigner,
  },
});

export const kanaswap = async () => {
  try {
    console.log('🔄 Kana Labs Swap Integration');
    console.log('═'.repeat(40));

    // Step 1: Get quotes
    console.log('📊 Fetching swap quotes...');
    const quotes = await swap.swapQuotes({
      apiKey: env.APTOS_API_KEY,
      inputToken: "0x1::aptos_coin::AptosCoin",
      outputToken:
        "0x6f986d146e4a90b828d8c12c14b6f4e003fdff11a8eecceceb63744363eaac01::mod_coin::MOD",
      amountIn: "100000",
      slippage: 0.5,
      network: NetworkId.aptos,
    });

    console.log("✅ Quotes received:", quotes);

    // Step 2: Execute swap with best quote
    console.log('🚀 Executing swap with best quote...');
    const executeSwap = await swap.executeSwapInstruction({
      apiKey: env.APTOS_API_KEY,
      quote: quotes.data[0], // Use first (best) quote
      address: aptosSigner.accountAddress.toString(),
    });

    console.log("✅ Transaction hash:", executeSwap);

  } catch (error) {
    console.error('❌ Error during Kana swap:', error);
    if (error instanceof Error && error.message.includes('Missing required environment variables')) {
      console.log('\n💡 Make sure you have the following in your .dev.vars file:');
      console.log('   PRIVATE_KEY=your_private_key_here');
      console.log('   APTOS_API_KEY=your_APTOS_API_KEY_here');
    }
  }
};

// Run the swap if this file is executed directly
kanaswap().catch(console.error);
#!/usr/bin/env tsx

import { Network } from '@aptos-labs/ts-sdk';
import { initHyperionSDK } from '@hyperionxyz/sdk';
import { loadEnv, validateEnv } from './utils/envLoader';

// Check swap rates for APT ↔ stkAPT and stkAPT → kAPT
async function swapCheck() {
    try {
        // Load environment variables using the proper loader
        const env = loadEnv();
        validateEnv(env as unknown as Record<string, string>, ['APTOS_API_KEY']);

        const apiKey = env.APTOS_API_KEY;
        console.log('✅ Environment loaded successfully');

        // Token addresses
        const APT_ADDRESS = '0x000000000000000000000000000000000000000000000000000000000000000a';
        const STKAPT_ADDRESS = '0x42556039b88593e768c97ab1a3ab0c6a17230825769304482dff8fdebe4c002b';
        const KAPT_ADDRESS = '0x821c94e69bc7ca058c913b7b5e6b0a5c9fd1523d58723a966fb8c1f5ea888105';

        const sdk = initHyperionSDK({
            network: Network.MAINNET,
            APTOS_API_KEY: apiKey,
        });

        console.log('🔍 Hyperion Swap Rate Calculator');
        console.log('═'.repeat(50));

        // Test 1: APT to stkAPT (10,000 APT)
        const aptAmount = 10000;
        const aptAmountRaw = aptAmount * 10 ** 8;

        console.log(`\n💱 ${aptAmount} APT → stkAPT:`);
        console.log('─'.repeat(30));

        const aptToStkaptResult = await sdk.Swap.estToAmount({
            amount: aptAmountRaw,
            from: APT_ADDRESS,
            to: STKAPT_ADDRESS,
            safeMode: false
        });

        const stkaptFromApt = Number(aptToStkaptResult.amountOut) / 10 ** 8;
        const aptToStkaptRate = stkaptFromApt / aptAmount;

        console.log(`💰 Input:  ${aptAmount} APT`);
        console.log(`💸 Output: ${stkaptFromApt.toFixed(6)} stkAPT`);
        console.log(`📈 Rate:   1 APT = ${aptToStkaptRate.toFixed(8)} stkAPT`);
        console.log(`🛣️  Path:   ${aptToStkaptResult.path.length} hop(s)`);

        // Test 2: stkAPT to kAPT (using the stkAPT amount we got)
        const stkaptAmountRaw = Math.floor(stkaptFromApt * 10 ** 8);

        console.log(`\n💱 ${stkaptFromApt.toFixed(6)} stkAPT → kAPT:`);
        console.log('─'.repeat(30));

        const stkaptToKaptResult = await sdk.Swap.estToAmount({
            amount: stkaptAmountRaw,
            from: STKAPT_ADDRESS,
            to: KAPT_ADDRESS,
            safeMode: false
        });

        const kaptFromStkapt = Number(stkaptToKaptResult.amountOut) / 10 ** 8;
        const stkaptToKaptRate = kaptFromStkapt / stkaptFromApt;

        console.log(`💰 Input:  ${stkaptFromApt.toFixed(6)} stkAPT`);
        console.log(`💸 Output: ${kaptFromStkapt.toFixed(6)} kAPT`);
        console.log(`📈 Rate:   1 stkAPT = ${stkaptToKaptRate.toFixed(8)} kAPT`);
        console.log(`🛣️  Path:   ${stkaptToKaptResult.path.length} hop(s)`);

        console.log('\n✅ All estimations complete!');

    } catch (error) {
        console.error('❌ Error during swap estimation:', error);
        if (error instanceof Error && error.message.includes('Missing required environment variables')) {
            console.log('\n💡 Make sure you have a .dev.vars file with APTOS_API_KEY set');
            console.log('   Example .dev.vars content:');
            console.log('   APTOS_API_KEY=your_api_key_here');
        }
    }
}

// Run the swap check
swapCheck().catch(console.error); 
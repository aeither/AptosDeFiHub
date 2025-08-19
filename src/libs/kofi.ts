import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { initHyperionSDK } from '@hyperionxyz/sdk';
import type { Env } from "../env";

// Setup Aptos client
const config = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(config);

const CONTRACT_ADDRESS = "0x2cc52445acc4c5e5817a0ac475976fbef966fedb6e30e7db792e10619c76181f";

// Token addresses
const TOKEN_ADDRESSES = {
    APT: '0x000000000000000000000000000000000000000000000000000000000000000a',
    STKAPT: '0x42556039b88593e768c97ab1a3ab0c6a17230825769304482dff8fdebe4c002b',
    KAPT: '0x821c94e69bc7ca058c913b7b5e6b0a5c9fd1523d58723a966fb8c1f5ea888105'
};

export interface ConversionRate {
    inputAmount: number;
    outputAmount: number;
    rate: number;
    method: 'kofi' | 'hyperion';
    fromToken: string;
    toToken: string;
    path?: string[];
}

export interface ComparisonResult {
    aptToStkaptKofi: ConversionRate;
    aptToStkaptHyperion: ConversionRate;
    stkaptToKaptKofi: ConversionRate;
    stkaptToKaptHyperion: ConversionRate;
    betterAptToStkapt: 'kofi' | 'hyperion';
    betterStkaptToKapt: 'kofi' | 'hyperion';
    testAmount: number;
}

/**
 * Get quote for depositing APT using Kofi protocol
 */
async function quoteDepositEntry(aptAmount: string): Promise<{aptOut: string, kaptOut: string}> {
    const result = await aptos.view({
        payload: {
            function: `${CONTRACT_ADDRESS}::gateway::quote_deposit_entry`,
            typeArguments: [],
            functionArguments: [aptAmount],
        }
    });
    
    return {
        aptOut: result[0] as string,
        kaptOut: result[1] as string
    };
}

/**
 * Convert KAPT to STKAPT using Kofi protocol
 */
async function kaptToStkapt(kaptAmount: string): Promise<string> {
    const result = await aptos.view({
        payload: {
            function: `${CONTRACT_ADDRESS}::rewards_manager::kapt_to_stkapt`,
            typeArguments: [],
            functionArguments: [kaptAmount],
        }
    });
    
    return result[0] as string;
}

/**
 * Convert STKAPT to KAPT using Kofi protocol
 */
async function stkaptToKapt(stkaptAmount: string): Promise<string> {
    const result = await aptos.view({
        payload: {
            function: `${CONTRACT_ADDRESS}::rewards_manager::stkapt_to_kapt`,
            typeArguments: [],
            functionArguments: [stkaptAmount],
        }
    });
    
    return result[0] as string;
}

/**
 * APT to stkAPT conversion using Kofi protocol
 */
export async function getKofiAptToStkaptRate(aptAmount: number): Promise<ConversionRate> {
    const aptAmountRaw = Math.floor(aptAmount * 10 ** 8).toString();
    
    // Step 1: APT to KAPT
    const quote = await quoteDepositEntry(aptAmountRaw);
    
    // Step 2: KAPT to stkAPT
    const stkaptAmountRaw = await kaptToStkapt(quote.kaptOut);
    
    const outputAmount = Number(stkaptAmountRaw) / 10 ** 8;
    const rate = outputAmount / aptAmount;
    
    return {
        inputAmount: aptAmount,
        outputAmount,
        rate,
        method: 'kofi',
        fromToken: 'APT',
        toToken: 'stkAPT'
    };
}

/**
 * stkAPT to kAPT conversion using Kofi protocol
 */
export async function getKofiStkaptToKaptRate(stkaptAmount: number): Promise<ConversionRate> {
    const stkaptAmountRaw = Math.floor(stkaptAmount * 10 ** 8).toString();
    
    // Convert stkAPT to kAPT
    const kaptAmountRaw = await stkaptToKapt(stkaptAmountRaw);
    
    const outputAmount = Number(kaptAmountRaw) / 10 ** 8;
    const rate = outputAmount / stkaptAmount;
    
    return {
        inputAmount: stkaptAmount,
        outputAmount,
        rate,
        method: 'kofi',
        fromToken: 'stkAPT',
        toToken: 'kAPT'
    };
}

/**
 * APT to stkAPT conversion using Hyperion swap
 */
export async function getHyperionAptToStkaptRate(aptAmount: number, env: Env): Promise<ConversionRate> {
    const sdk = initHyperionSDK({
        network: Network.MAINNET,
        APTOS_API_KEY: env.APTOS_API_KEY,
    });
    
    const aptAmountRaw = Math.floor(aptAmount * 10 ** 8);
    
    const result = await sdk.Swap.estToAmount({
        amount: aptAmountRaw,
        from: TOKEN_ADDRESSES.APT,
        to: TOKEN_ADDRESSES.STKAPT,
        safeMode: false
    });
    
    const outputAmount = Number(result.amountOut) / 10 ** 8;
    const rate = outputAmount / aptAmount;
    
    return {
        inputAmount: aptAmount,
        outputAmount,
        rate,
        method: 'hyperion',
        fromToken: 'APT',
        toToken: 'stkAPT',
        path: result.path
    };
}

/**
 * stkAPT to kAPT conversion using Hyperion swap
 */
export async function getHyperionStkaptToKaptRate(stkaptAmount: number, env: Env): Promise<ConversionRate> {
    const sdk = initHyperionSDK({
        network: Network.MAINNET,
        APTOS_API_KEY: env.APTOS_API_KEY,
    });
    
    const stkaptAmountRaw = Math.floor(stkaptAmount * 10 ** 8);
    
    const result = await sdk.Swap.estToAmount({
        amount: stkaptAmountRaw,
        from: TOKEN_ADDRESSES.STKAPT,
        to: TOKEN_ADDRESSES.KAPT,
        safeMode: false
    });
    
    const outputAmount = Number(result.amountOut) / 10 ** 8;
    const rate = outputAmount / stkaptAmount;
    
    return {
        inputAmount: stkaptAmount,
        outputAmount,
        rate,
        method: 'hyperion',
        fromToken: 'stkAPT',
        toToken: 'kAPT',
        path: result.path
    };
}

/**
 * Compare Kofi vs Hyperion rates for both conversions
 */
export async function compareConversionRates(env: Env, amount: number = 3000): Promise<ComparisonResult> {
    const testAptAmount = amount; // Use provided amount or default to 3000 APT
    
    try {
        // Get APT to stkAPT rates
        const [aptToStkaptKofi, aptToStkaptHyperion] = await Promise.all([
            getKofiAptToStkaptRate(testAptAmount),
            getHyperionAptToStkaptRate(testAptAmount, env)
        ]);
        
        // Use the average stkAPT amount for the second test
        const avgStkaptAmount = (aptToStkaptKofi.outputAmount + aptToStkaptHyperion.outputAmount) / 2;
        
        // Get stkAPT to kAPT rates
        const [stkaptToKaptKofi, stkaptToKaptHyperion] = await Promise.all([
            getKofiStkaptToKaptRate(avgStkaptAmount),
            getHyperionStkaptToKaptRate(avgStkaptAmount, env)
        ]);
        
        // Determine which method gives better rates
        const betterAptToStkapt = aptToStkaptKofi.outputAmount > aptToStkaptHyperion.outputAmount ? 'kofi' : 'hyperion';
        const betterStkaptToKapt = stkaptToKaptKofi.outputAmount > stkaptToKaptHyperion.outputAmount ? 'kofi' : 'hyperion';
        
        return {
            aptToStkaptKofi,
            aptToStkaptHyperion,
            stkaptToKaptKofi,
            stkaptToKaptHyperion,
            betterAptToStkapt,
            betterStkaptToKapt,
            testAmount: testAptAmount
        };
        
    } catch (error) {
        console.error('Error comparing conversion rates:', error);
        throw error;
    }
}

/**
 * Format comparison results for display
 */
export function formatComparisonResults(comparison: ComparisonResult): string {
    const star = '⭐';
    
    let message = `🔄 **Conversion Rate Comparison**\n`;
    message += `_Testing with ${comparison.testAmount.toLocaleString()} APT_\n\n`;
    
    // APT to stkAPT comparison
    message += `**💱 APT → stkAPT:**\n`;
    
    const kofiAptStar = comparison.betterAptToStkapt === 'kofi' ? ` ${star}` : '';
    const hyperionAptStar = comparison.betterAptToStkapt === 'hyperion' ? ` ${star}` : '';
    
    message += `• **Kofi Protocol${kofiAptStar}:**\n`;
    message += `  Rate: \`1 APT = ${comparison.aptToStkaptKofi.rate.toFixed(8)} stkAPT\`\n`;
    message += `  Output: \`${comparison.aptToStkaptKofi.outputAmount.toFixed(6)} stkAPT\`\n\n`;
    
    message += `• **Hyperion Swap${hyperionAptStar}:**\n`;
    message += `  Rate: \`1 APT = ${comparison.aptToStkaptHyperion.rate.toFixed(8)} stkAPT\`\n`;
    message += `  Output: \`${comparison.aptToStkaptHyperion.outputAmount.toFixed(6)} stkAPT\`\n`;
    message += `  Path: \`${comparison.aptToStkaptHyperion.path?.length || 0} hop(s)\`\n\n`;
    
    message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    // stkAPT to kAPT comparison
    const avgStkaptAmount = (comparison.stkaptToKaptKofi.inputAmount + comparison.stkaptToKaptHyperion.inputAmount) / 2;
    message += `**💱 stkAPT → kAPT:**\n`;
    message += `_Testing with ${avgStkaptAmount.toFixed(2)} stkAPT_\n\n`;
    
    const kofiStkaptStar = comparison.betterStkaptToKapt === 'kofi' ? ` ${star}` : '';
    const hyperionStkaptStar = comparison.betterStkaptToKapt === 'hyperion' ? ` ${star}` : '';
    
    message += `• **Kofi Protocol${kofiStkaptStar}:**\n`;
    message += `  Rate: \`1 stkAPT = ${comparison.stkaptToKaptKofi.rate.toFixed(8)} kAPT\`\n`;
    message += `  Output: \`${comparison.stkaptToKaptKofi.outputAmount.toFixed(6)} kAPT\`\n\n`;
    
    message += `• **Hyperion Swap${hyperionStkaptStar}:**\n`;
    message += `  Rate: \`1 stkAPT = ${comparison.stkaptToKaptHyperion.rate.toFixed(8)} kAPT\`\n`;
    message += `  Output: \`${comparison.stkaptToKaptHyperion.outputAmount.toFixed(6)} kAPT\`\n`;
    message += `  Path: \`${comparison.stkaptToKaptHyperion.path?.length || 0} hop(s)\`\n\n`;
    
    message += `${star} = Better rate`;
    
    return message;
}
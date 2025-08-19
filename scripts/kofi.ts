#!/usr/bin/env tsx

import { type Account, Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";

// Setup Aptos client
const config = new AptosConfig({ network: Network.MAINNET });
const aptos = new Aptos(config);

const CONTRACT_ADDRESS = "0x2cc52445acc4c5e5817a0ac475976fbef966fedb6e30e7db792e10619c76181f";

/**
 * Get quote for depositing APT (returns APT amount and KAPT amount)
 */
async function quoteDepositEntry(aptAmount: string): Promise<{aptOut: string, kaptOut: string}> {
    try {
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
    } catch (error) {
        console.error("Error calling quote_deposit_entry:", error);
        throw error;
    }
}

/**
 * Convert KAPT to STKAPT
 */
async function kaptToStkapt(kaptAmount: string): Promise<string> {
    try {
        const result = await aptos.view({
            payload: {
                function: `${CONTRACT_ADDRESS}::rewards_manager::kapt_to_stkapt`,
                typeArguments: [],
                functionArguments: [kaptAmount],
            }
        });
        
        return result[0] as string;
    } catch (error) {
        console.error("Error calling kapt_to_stkapt:", error);
        throw error;
    }
}

/**
 * Convert STKAPT to KAPT
 */
async function stkaptToKapt(stkaptAmount: string): Promise<string> {
    try {
        const result = await aptos.view({
            payload: {
                function: `${CONTRACT_ADDRESS}::rewards_manager::stkapt_to_kapt`,
                typeArguments: [],
                functionArguments: [stkaptAmount],
            }
        });
        
        return result[0] as string;
    } catch (error) {
        console.error("Error calling stkapt_to_kapt:", error);
        throw error;
    }
}

/**
 * APT to STKAPT (combines quote_deposit_entry + kapt_to_stkapt)
 */
async function aptToStkapt(aptAmount: string): Promise<string> {
    try {
        // First get KAPT amount from APT
        const quote = await quoteDepositEntry(aptAmount);
        
        // Then convert KAPT to STKAPT
        const stkaptAmount = await kaptToStkapt(quote.kaptOut);
        
        return stkaptAmount;
    } catch (error) {
        console.error("Error converting APT to STKAPT:", error);
        throw error;
    }
}

/**
 * Get exchange rate information
 */
async function getExchangeRate(): Promise<string> {
    try {
        const result = await aptos.view({
            payload: {
                function: `${CONTRACT_ADDRESS}::rewards_manager::get_exchange_rate`,
                typeArguments: [],
                functionArguments: [],
            }
        });
        
        return result[0] as string;
    } catch (error) {
        console.error("Error getting exchange rate:", error);
        throw error;
    }
}

/**
 * Generic function to execute any Aptos function call
 */
async function executeFunction(
    signer: Account,
    functionName: string,
    functionArguments: any[] = [],
    typeArguments: string[] = []
) {
    try {
        // 1. Build the transaction
        const transaction = await aptos.transaction.build.simple({
            sender: signer.accountAddress,
            data: {
                function: functionName as `${string}::${string}::${string}`,
                functionArguments: functionArguments,
                typeArguments: typeArguments,
            },
        });

        // 2. Sign the transaction
        const senderAuthenticator = aptos.transaction.sign({
            signer: signer,
            transaction,
        });

        // 3. Submit the transaction
        const submittedTransaction = await aptos.transaction.submit.simple({
            transaction,
            senderAuthenticator,
        });

        console.log(`Transaction submitted: ${submittedTransaction.hash}`);

        // 4. Wait for transaction completion
        const executedTransaction = await aptos.waitForTransaction({
            transactionHash: submittedTransaction.hash,
        });

        console.log("Transaction executed successfully!");
        return {
            success: true,
            hash: submittedTransaction.hash,
            result: executedTransaction,
        };

    } catch (error) {
        console.error("Transaction failed:", error);
        return {
            success: false,
            error: error,
        };
    }
}

/**
 * Stake function
 */
async function stakeEntry(signer: Account, amount: string) {
    return await executeFunction(
        signer,
        "0x2cc52445acc4c5e5817a0ac475976fbef966fedb6e30e7db792e10619c76181f::gateway::stake_entry",
        [amount]
    );
}

/**
 * Unstake function
 */
async function unstakeEntry(signer: Account, amount: string) {
    return await executeFunction(
        signer,
        "0x2cc52445acc4c5e5817a0ac475976fbef966fedb6e30e7db792e10619c76181f::gateway::unstake_entry",
        [amount]
    );
}

async function main() {
    console.log("🔍 Kofi Protocol Conversion Calculator");
    console.log("=".repeat(50));
    
    try {
        console.log("📊 Exchange Rate Information:");
        const exchangeRate = await getExchangeRate();
        console.log(`Current Exchange Rate: ${exchangeRate}`);
        console.log();
        
        // Example 1: 10,000 APT to stkAPT
        const aptAmount = "1000000000000"; // 10,000 APT (in octas, 8 decimals)
        
        console.log("💱 10,000 APT to stkAPT Conversion:");
        console.log("-".repeat(40));
        
        // Step 1: APT to KAPT (via quote)
        console.log(`\n🔄 Step 1: APT to KAPT`);
        const quote = await quoteDepositEntry(aptAmount);
        const kaptAmount = quote.kaptOut;
        console.log(`Input: ${aptAmount} APT (${Number(aptAmount) / 10**8} APT)`);
        console.log(`Output: ${kaptAmount} KAPT (${Number(kaptAmount) / 10**8} KAPT)`);
        
        // Step 2: KAPT to stkAPT
        console.log(`\n🔄 Step 2: KAPT to stkAPT`);
        const stkaptAmount = await kaptToStkapt(kaptAmount);
        console.log(`Input: ${kaptAmount} KAPT (${Number(kaptAmount) / 10**8} KAPT)`);
        console.log(`Output: ${stkaptAmount} stkAPT (${Number(stkaptAmount) / 10**8} stkAPT)`);
        
        // Final result for APT → stkAPT
        console.log(`\n✅ APT → stkAPT Result:`);
        console.log(`10,000 APT = ${Number(stkaptAmount) / 10**8} stkAPT`);
        console.log(`Conversion Rate: 1 APT = ${(Number(stkaptAmount) / Number(aptAmount)).toFixed(8)} stkAPT`);
        
        console.log("\n" + "=".repeat(50));
        
        // Example 2: stkAPT to kAPT conversion (using the stkAPT amount we got)
        console.log("💱 stkAPT to kAPT Conversion:");
        console.log("-".repeat(40));
        
        console.log(`\n🔄 stkAPT to kAPT`);
        const kaptFromStkapt = await stkaptToKapt(stkaptAmount);
        console.log(`Input: ${stkaptAmount} stkAPT (${Number(stkaptAmount) / 10**8} stkAPT)`);
        console.log(`Output: ${kaptFromStkapt} kAPT (${Number(kaptFromStkapt) / 10**8} kAPT)`);
        
        // Final result for stkAPT → kAPT
        console.log(`\n✅ stkAPT → kAPT Result:`);
        console.log(`${Number(stkaptAmount) / 10**8} stkAPT = ${Number(kaptFromStkapt) / 10**8} kAPT`);
        console.log(`Conversion Rate: 1 stkAPT = ${(Number(kaptFromStkapt) / Number(stkaptAmount)).toFixed(8)} kAPT`);
        
    } catch (error) {
        console.error("❌ Error in main:", error);
    }
}

// Export functions for use in other scripts
export {
    aptToStkapt,
    getExchangeRate, kaptToStkapt, quoteDepositEntry, stakeEntry, stkaptToKapt, unstakeEntry
};

// Run the example if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
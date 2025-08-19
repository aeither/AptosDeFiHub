import { Account, Ed25519PrivateKey, PrivateKey, PrivateKeyVariants } from "@aptos-labs/ts-sdk";
import { loadEnv, validateEnv } from "./utils/envLoader";

/**
 * Script to demonstrate AIP-80 compliant private key formatting
 * This script reads a private key from environment variables and formats it
 * to be AIP-80 compliant using Ed25519 signature scheme
 */
async function formatPrivateKeyToAIP80() {
    try {
        // Load environment variables
        const env = loadEnv();
        
        // Validate required environment variables
        validateEnv(env as unknown as Record<string, string>, ['PRIVATE_KEY']);
        
        console.log("🔑 Starting AIP-80 Private Key Formatting...");
        console.log("==========================================");
        
        // Get the original private key from environment
        const originalPrivateKey = env.PRIVATE_KEY;
        console.log("Original private key:", originalPrivateKey.substring(0, 10) + "..." + originalPrivateKey.substring(originalPrivateKey.length - 10));
        
        // Format to AIP-80 compliance using Ed25519
        const aip80FormattedKey = PrivateKey.formatPrivateKey(originalPrivateKey, PrivateKeyVariants.Ed25519);
        console.log("AIP-80 compliant private key:", aip80FormattedKey.substring(0, 10) + "..." + aip80FormattedKey.substring(aip80FormattedKey.length - 10));
        
        // Create Ed25519 private key instance
        const privateKey = new Ed25519PrivateKey(aip80FormattedKey);
        console.log("✅ Ed25519 private key created successfully");
        
        // Create account using the formatted private key
        const account = Account.fromPrivateKey({ privateKey });
        console.log("✅ Account created successfully");
        console.log("Account address:", account.accountAddress.toString());
        
        // Display the results
        console.log("\n📋 Summary:");
        console.log("===========");
        console.log("Signature Scheme: Ed25519");
        console.log("AIP-80 Compliant: ✅ Yes");
        console.log("Account Address:", account.accountAddress.toString());
        console.log("Formatted Private Key:", aip80FormattedKey);
        
        return {
            success: true,
            accountAddress: account.accountAddress.toString(),
            formattedPrivateKey: aip80FormattedKey,
            account: account
        };
        
    } catch (error) {
        console.error("❌ Error formatting private key:", error);
        return {
            success: false,
            error: error
        };
    }
}

/**
 * Alternative function that shows the difference between different signature schemes
 */
async function demonstrateSignatureSchemes() {
    try {
        const env = loadEnv();
        validateEnv(env as unknown as Record<string, string>, ['PRIVATE_KEY']);
        
        const originalPrivateKey = env.PRIVATE_KEY;
        
        console.log("\n🔍 Demonstrating Different Signature Schemes:");
        console.log("==============================================");
        
        // Ed25519 formatting
        const ed25519Formatted = PrivateKey.formatPrivateKey(originalPrivateKey, PrivateKeyVariants.Ed25519);
        console.log("Ed25519 formatted:", ed25519Formatted);
        
        // Secp256k1 formatting (if needed)
        try {
            const secp256k1Formatted = PrivateKey.formatPrivateKey(originalPrivateKey, PrivateKeyVariants.Secp256k1);
            console.log("Secp256k1 formatted:", secp256k1Formatted);
        } catch (error) {
            console.log("Secp256k1 formatting not applicable for this key");
        }
        
    } catch (error) {
        console.error("Error demonstrating signature schemes:", error);
    }
}

// Main execution
async function main() {
    console.log("🚀 AIP-80 Private Key Formatter");
    console.log("================================\n");
    
    // Format the private key and create account
    const result = await formatPrivateKeyToAIP80();
    
    if (result.success) {
        console.log("\n✅ Private key formatting completed successfully!");
        
        // Optionally demonstrate other signature schemes
        await demonstrateSignatureSchemes();
    } else {
        console.log("\n❌ Private key formatting failed!");
        process.exit(1);
    }
}

// Run the script
main().catch(console.error); 
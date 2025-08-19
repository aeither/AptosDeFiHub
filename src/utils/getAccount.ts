import { Account, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';

/**
 * Creates an Aptos account from private key
 * @param privateKey - The private key string
 * @returns Account object
 */
export async function getAccount(privateKey: string): Promise<Account> {
    try {
        if (!privateKey) {
            throw new Error('Private key is required');
        }

        // Create account from private key
        const privateKeyObj = new Ed25519PrivateKey(privateKey);
        const account = Account.fromPrivateKey({ privateKey: privateKeyObj });

        return account;

    } catch (error) {
        console.error('❌ Error creating account:', error);
        throw error;
    }
} 
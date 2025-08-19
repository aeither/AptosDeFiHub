import { type Account, Aptos, AptosConfig, Network } from '@aptos-labs/ts-sdk';

export interface TransactionPayload {
  function: `${string}::${string}::${string}`;
  typeArguments?: string[];
  functionArguments: (string | number | boolean)[];
}

export interface TransactionResult {
  transactionHash: string;
  payload: TransactionPayload;
}

// Track recent transactions to avoid duplicates
const recentTransactions = new Map<string, number>();
const TRANSACTION_COOLDOWN = 30000; // 30 seconds

// Clean up old transaction records
function cleanupOldTransactions() {
  const now = Date.now();
  for (const [key, timestamp] of recentTransactions.entries()) {
    if (now - timestamp > TRANSACTION_COOLDOWN) {
      recentTransactions.delete(key);
    }
  }
}

export async function executeTransaction(
  payload: TransactionPayload,
  account: Account,
  operationName = "transaction"
): Promise<TransactionResult> {
  try {
    console.log(`🚀 Executing ${operationName}...`);
    
    // Clean up old transactions
    cleanupOldTransactions();
    
    // Create a transaction signature for deduplication
    const txSignature = `${account.accountAddress.toString()}_${payload.function}_${JSON.stringify(payload.functionArguments)}`;
    const now = Date.now();
    
    // Check if we recently submitted a similar transaction
    const lastSubmission = recentTransactions.get(txSignature);
    if (lastSubmission && (now - lastSubmission) < TRANSACTION_COOLDOWN) {
      const waitTime = TRANSACTION_COOLDOWN - (now - lastSubmission);
      console.log(`⏳ Similar transaction submitted recently, waiting ${waitTime}ms to avoid mempool conflicts...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Initialize Aptos client
    const config = new AptosConfig({ network: Network.MAINNET });
    const aptos = new Aptos(config);

    console.log('👤 Signer Address:', account.accountAddress.toString());
    console.log('📝 Building transaction...');

    // Build transaction from the payload
    const transaction = await aptos.transaction.build.simple({
      sender: account.accountAddress,
      data: {
        function: payload.function,
        typeArguments: payload.typeArguments || [],
        functionArguments: payload.functionArguments,
      },
    });

    // Simulate the transaction first
    console.log('🔍 Simulating transaction...');
    try {
      const [simulationResult] = await aptos.transaction.simulate.simple({
        signerPublicKey: account.publicKey,
        transaction,
      });

      // Check simulation result
      if (simulationResult.success) {
        console.log('✅ Simulation successful!');
        console.log(`💰 Estimated gas: ${simulationResult.gas_used}`);
      } else {
        // Check for VM error in simulation result
        const vmError = simulationResult.vm_status?.includes('Error') ? simulationResult.vm_status : 'Unknown simulation error';
        console.error('❌ Simulation failed:', vmError);
        throw new Error(`Transaction simulation failed: ${vmError}`);
      }
    } catch (simError) {
      console.error('❌ Simulation error:', simError);
      throw new Error(`Transaction simulation failed: ${simError instanceof Error ? simError.message : String(simError)}`);
    }

    console.log('✍️  Signing and submitting transaction...');
    
    // Mark this transaction as being submitted
    recentTransactions.set(txSignature, now);
    
    // Sign and submit the transaction
    const committedTxn = await aptos.signAndSubmitTransaction({ 
      signer: account, 
      transaction 
    });

    console.log('⏳ Waiting for transaction confirmation...');
    
    // Wait for transaction to be confirmed
    await aptos.waitForTransaction({ transactionHash: committedTxn.hash });

    console.log('✅ Transaction confirmed!');
    console.log(`🔗 Transaction hash: ${committedTxn.hash}`);

    return {
      transactionHash: committedTxn.hash,
      payload
    };

  } catch (error) {
    console.error(`❌ Error executing ${operationName}:`, error);
    
    // Handle specific mempool errors
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('already in mempool')) {
      console.log(`🔄 Transaction already in mempool, waiting for completion...`);
      // Add a longer delay to avoid immediate retries
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
    
    throw error;
  }
} 
import SafeApiKit from '@safe-global/api-kit'
import Safe from '@safe-global/protocol-kit'
import {
  MetaTransactionData,
  OperationType
} from '@safe-global/types-kit'
import { Wallet } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export class SafeManager {
  private safeService?: SafeApiKit;
  private safeSdk?: Safe;
  private initialized: boolean = false;

  constructor(private hre: HardhatRuntimeEnvironment) {}

  /**
   * Initialize Safe SDK
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const network = this.hre.network;
    const safeAddress = process.env.SAFE_ADDRESS;
    const safeApiKey = process.env.SAFE_API_KEY;

    if (!safeAddress || !safeApiKey) {
      throw new Error(
        `SAFE_ADDRESS or SAFE_API_KEY not set in .env file. SafeManager initialization failed.`
      );
    }

    console.log(`Initializing Safe SDK for ${network.name}...`);
    console.log(`Safe Address: ${safeAddress}`);

    try {
      // Get the private key
      const privateKey = process.env.PRIVATE_KEY_PROPOSER
      if (!privateKey) {
        throw new Error('Private key not found. Make sure PRIVATE_KEY_PROPOSER env var is set');
      }
      
      // Safe SDK v4
      this.safeSdk = await Safe.init({
        provider: (network.config as any).url,
        signer: privateKey,
        safeAddress,
      });

      // Safe API Kit v2
      const chainId = await this.hre.getChainId();
      this.safeService = new SafeApiKit({
        chainId: BigInt(chainId),
        apiKey: safeApiKey,
      });

      this.initialized = true;
      console.log(`Safe SDK initialized successfully`);
      console.log(`Chain ID: ${chainId}`);
    } catch (error) {
      console.error('Failed to initialize Safe SDK:', error);
      throw new Error(`Safe SDK initialization failed. Make sure @safe-global packages are installed: ${error}`);
    }
  }

  /**
   * Propose a single transaction to Safe multisig
   */
  async proposeSafeTransaction(
    to: string,
    data: string,
    description: string
  ): Promise<void> {
    if (!this.safeSdk || !this.safeService || !this.initialized) {
      throw new Error("Safe SDK not initialized. Call initialize() first.");
    }

    console.log(`Proposing Safe transaction: ${description}`);

    const safeTransactionData: MetaTransactionData = {
      to,
      value: "0",
      data,
      operation: OperationType.Call,
    };

    // Create the transaction
    const safeTransaction = await this.safeSdk.createTransaction({
      transactions: [safeTransactionData],
    });
   
    // Get the safe transaction hash
    const safeTxHash = await this.safeSdk.getTransactionHash(safeTransaction);
    const signature = await this.safeSdk.signHash(safeTxHash)

    // Get the private key
    const privateKey = process.env.PRIVATE_KEY_PROPOSER
    if (!privateKey) {
      throw new Error('Private key not found. Make sure PRIVATE_KEY_PROPOSER env var is set');
    }

    const senderAddress = new Wallet(privateKey).address;
      
    // Get the Safe address
    const safeAddress = await this.safeSdk.getAddress();

    // Propose the transaction to the Safe Transaction Service
    await this.safeService.proposeTransaction({
      safeAddress,
      safeTransactionData: safeTransaction.data,
      safeTxHash,
      senderAddress,
      senderSignature: signature.data,
    });

    console.log(`Safe transaction proposed successfully`);
    console.log(`Transaction hash: ${safeTxHash}`);
    console.log(`View in Safe UI: https://app.safe.global/transactions/queue?safe=${safeAddress}`);
  }

  /**
   * Propose a batch transaction to Safe multisig
   */
  async proposeSafeBatchTransaction(
    transactions: MetaTransactionData[],
    description: string
  ): Promise<void> {
    if (!this.safeSdk || !this.safeService || !this.initialized) {
      throw new Error("Safe SDK not initialized. Call initialize() first.");
    }

    console.log(`Proposing Safe batch transaction: ${description}`);

    // Create the batch transaction
    const safeTransaction = await this.safeSdk.createTransaction({
      transactions,
    });
   
    // Get the safe transaction hash
    const safeTxHash = await this.safeSdk.getTransactionHash(safeTransaction);
    const signature = await this.safeSdk.signHash(safeTxHash)

    // Get the private key
    const privateKey = process.env.PRIVATE_KEY_PROPOSER
    if (!privateKey) {
      throw new Error('Private key not found. Make sure PRIVATE_KEY_PROPOSER env var is set');
    }

    const senderAddress = new Wallet(privateKey).address;
      
    // Get the Safe address
    const safeAddress = await this.safeSdk.getAddress();

    // Propose the transaction to the Safe Transaction Service
    await this.safeService.proposeTransaction({
      safeAddress,
      safeTransactionData: safeTransaction.data,
      safeTxHash,
      senderAddress,
      senderSignature: signature.data,
    });

    console.log(`Safe batch transaction proposed successfully (${transactions.length} transactions)`);
    console.log(`Transaction hash: ${safeTxHash}`);
    console.log(`View in Safe UI: https://app.safe.global/transactions/queue?safe=${safeAddress}`);
  }

  /**
   * Check if Safe is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }
}

import SafeApiKit from '@safe-global/api-kit'
import Safe from '@safe-global/protocol-kit'
import {
  MetaTransactionData,
  OperationType
} from '@safe-global/types-kit'
import { Wallet } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

/**
 * Enum for Safe address types
 */
export enum SafeAddressType {
  /** Safe that owns the FT contracts - used for peer and enforced options operations */
  OWNER = 'OWNER',
  /** Safe for endpoint configuration - used for wire operations */
  DELEGATE = 'DELEGATE'
}

export class SafeManager {
  private safeService?: SafeApiKit;
  private safeSdk?: Safe;
  private initialized: boolean = false;
  private addressType: SafeAddressType;

  /**
   * @param hre - Hardhat Runtime Environment
   * @param addressType - Type of Safe address to use:
   *                      - SafeAddressType.OWNER: Uses SAFE_OWNER_ADDRESS (for peer/options operations)
   *                      - SafeAddressType.DELEGATE: Uses SAFE_DELEGATE_ADDRESS (for wire operations)
   */
  constructor(
    private hre: HardhatRuntimeEnvironment,
    addressType: SafeAddressType = SafeAddressType.OWNER
  ) {
    this.addressType = addressType;
  }

  /**
   * Get the environment variable name for the current address type
   */
  private getAddressEnvVar(): string {
    return this.addressType === SafeAddressType.DELEGATE 
      ? 'SAFE_DELEGATE_ADDRESS' 
      : 'SAFE_OWNER_ADDRESS';
  }

  /**
   * Get the operation type description for the current address type
   */
  private getOperationType(): string {
    return this.addressType === SafeAddressType.DELEGATE 
      ? 'wire/endpoint' 
      : 'peer/options';
  }

  /**
   * Initialize Safe SDK
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const network = this.hre.network;
    
    // Select the appropriate Safe address based on the address type
    const safeAddressEnvVar = this.getAddressEnvVar();
    const safeAddress = process.env[safeAddressEnvVar];
    const safeApiKey = process.env.SAFE_API_KEY;

    if (!safeAddress) {
      throw new Error(
        `${safeAddressEnvVar} not set in .env file. SafeManager initialization failed.\n` +
        `Use SAFE_OWNER_ADDRESS for peer/options operations, or SAFE_DELEGATE_ADDRESS for wire operations.`
      );
    }

    if (!safeApiKey) {
      throw new Error(
        `SAFE_API_KEY not set in .env file. SafeManager initialization failed.`
      );
    }

    const operationType = this.getOperationType();
    console.log(`Initializing Safe SDK for ${network.name} (${operationType} operations)...`);
    console.log(`Safe Address (${safeAddressEnvVar}): ${safeAddress}`);

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
      console.log(`Address Type: ${this.addressType}`);
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
    console.log(`Number of transactions: ${transactions.length}`);
    console.log(`Address Type: ${this.addressType}`);

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

  /**
   * Get the Safe address being used
   */
  async getSafeAddress(): Promise<string> {
    if (!this.safeSdk || !this.initialized) {
      throw new Error("Safe SDK not initialized. Call initialize() first.");
    }
    return await this.safeSdk.getAddress();
  }

  /**
   * Get the current address type being used
   */
  getAddressType(): SafeAddressType {
    return this.addressType;
  }

  /**
   * Check if using delegate address
   */
  isUsingDelegateAddress(): boolean {
    return this.addressType === SafeAddressType.DELEGATE;
  }

  /**
   * Check if using owner address
   */
  isUsingOwnerAddress(): boolean {
    return this.addressType === SafeAddressType.OWNER;
  }
}

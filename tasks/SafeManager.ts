import SafeApiKit from '@safe-global/api-kit'
import Safe, { ContractNetworksConfig } from '@safe-global/protocol-kit'
import {
  MetaTransactionData,
  OperationType
} from '@safe-global/types-kit'
import { Wallet } from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Chains newer than the installed @safe-global/api-kit network list (it throws "Network with chainId ... not found")
const SAFE_TX_SERVICE_URLS: Record<string, string> = {
  '143': 'https://api.safe.global/tx-service/monad/api',
  '4663': 'https://api.safe.global/tx-service/robinhood/api',
};

// Chains missing from the installed @safe-global/safe-deployments: Safe v1.3.0 contracts as listed
// for the chain in safe-deployments 1.37.63 (eip155 set, matching the FT Safes' singleton)
const SAFE_CONTRACT_NETWORKS: Record<string, ContractNetworksConfig[string]> = {
  '4663': {
    safeSingletonAddress: '0xfb1bffC9d739B8D520DaF37dF666da4C687191EA',
    safeProxyFactoryAddress: '0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC',
    multiSendAddress: '0x998739BFdAAdde7C933B942a68053933098f9EDa',
    multiSendCallOnlyAddress: '0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B',
    fallbackHandlerAddress: '0x017062a1dE2FE6b99BE3d9d37841FeD19F573804',
    signMessageLibAddress: '0x98FFBBF51bb33A056B08ddf711f289936AafF717',
    createCallAddress: '0xB19D6FFc2182150F8Eb585b79D4ABcd7C5640A9d',
    simulateTxAccessorAddress: '0x727a77a074D1E6c4530e814F89E618a3298FC044',
  },
};

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
      
      const chainId = await this.hre.getChainId();
      const contractNetworks = SAFE_CONTRACT_NETWORKS[chainId];

      // Safe SDK v4
      this.safeSdk = await Safe.init({
        provider: (network.config as any).url,
        signer: privateKey,
        safeAddress,
        ...(contractNetworks && { contractNetworks: { [chainId]: contractNetworks } }),
      });

      // Safe API Kit v2
      this.safeService = new SafeApiKit({
        chainId: BigInt(chainId),
        apiKey: safeApiKey,
        txServiceUrl: SAFE_TX_SERVICE_URLS[chainId],
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

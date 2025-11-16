import { Options } from "@layerzerolabs/lz-v2-utilities";
import { NIL_DVN_COUNT } from "@layerzerolabs/metadata-tools"
import { FT, ILayerZeroEndpointV2 } from "../typechain-types";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getChainConfig } from "../utils/constants";
import SafeApiKit from '@safe-global/api-kit'
import Safe from '@safe-global/protocol-kit'
import {
  MetaTransactionData,
  OperationType
} from '@safe-global/types-kit'
import { Wallet } from "ethers";

const requiredDVN = "LayerZero Labs"; // Required for both mainnet and testnet
const requiredDVNMainnet = "Horizen" // Only required on mainnet

// Number of blocks to wait for tx finality due to load balanced RPCs not always being up to date, could be adjusted per chain to be more efficient.
const NUM_BLOCKS_TO_WAIT = 2;

// Types for chain metadata structure based on your JSON (V2 only)
interface ChainMetadata {
  chainDetails: {
    chainKey: string;
    nativeChainId: number;
    chainStatus: string;
  };
  deployments: Array<{
    eid: string;
    version: number;
    stage: string;
    endpointV2: {
      address: string;
    };
    executor: {
      address: string;
    };
    sendUln302: {
      address: string;
    };
    receiveUln302: {
      address: string;
    };
  }>;
  dvns: Record<
    string,
    {
      version: number;
      canonicalName: string;
      id: string;
      deprecated?: boolean;
      lzReadCompatible?: boolean;
    }
  >;
}

interface ChainConfig {
  chainKey: string;
  eid: number;
  nativeChainId: number;
  endpointV2Address: string;
  executorAddress: string;
  sendLibAddress: string;
  receiveLibAddress: string;
  dvnAddresses: string[];
  ftTokenAddress?: string;
  confirmations?: number;
}

interface SafeConfig {
  safeAddress: string;
}

class LayerZeroMultiChainWire {
  private chainConfigMap: Map<string, ChainConfig> = new Map();
  private useSafe: boolean = false;
  private safeService?: SafeApiKit;
  private safeSdk?: Safe;

  constructor(private hre: HardhatRuntimeEnvironment, useSafe: boolean = false) {
    this.useSafe = useSafe;
  }

  /**
   * Initialize Safe SDK if --safe flag is used
   */
  private async initializeSafe(): Promise<void> {
    if (!this.useSafe) return;

    const network = this.hre.network;
    const safeConfig = (network.config as any).safeConfig as SafeConfig | undefined;

    if (!safeConfig) {
      throw new Error(
        `Safe config not found for network ${network.name}. Please add safeConfig to your hardhat.config.ts:\n` +
        `safeConfig: {\n` +
        `  safeAddress: '0x...'\n` +
        `}`
      );
    }

    console.log(`Initializing Safe SDK for ${network.name}...`);
    console.log(`Safe Address: ${safeConfig.safeAddress}`);

    try {
      // Get the private key
      const privateKey = process.env.PRIVATE_KEY_PROPOSER
      if (!privateKey) {
        throw new Error('Private key not found. Make sure PRIVATE_KEY_PROPOSER env var is set');
      }
      
      // Safe SDK v4 - Simpler initialization
      this.safeSdk = await Safe.init({
        provider: (network.config as any).url,
        signer: privateKey,
        safeAddress: safeConfig.safeAddress,
      });

      // Safe API Kit v2 - Updated to use chainId instead of txServiceUrl
      const chainId = await this.hre.getChainId();
      this.safeService = new SafeApiKit({
        chainId: BigInt(chainId),
        apiKey: process.env.SAFE_API_KEY,
      });

      console.log(`Safe SDK initialized successfully`);
      console.log(`Chain ID: ${chainId}`);
    } catch (error) {
      console.error('Failed to initialize Safe SDK:', error);
      throw new Error(`Safe SDK initialization failed. Make sure @safe-global packages are installed: ${error}`);
    }
  }

  /**
   * Propose a transaction to Safe multisig
   */
  private async proposeSafeTransaction(
    to: string,
    data: string,
    description: string
  ): Promise<void> {
    if (!this.safeSdk || !this.safeService) {
      throw new Error("Safe SDK not initialized");
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
  private async proposeSafeBatchTransaction(
    transactions: MetaTransactionData[],
    description: string
  ): Promise<void> {
    if (!this.safeSdk || !this.safeService) {
      throw new Error("Safe SDK not initialized");
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
   * Execute transaction directly or propose to Safe
   */
  private async executeOrPropose(
    contract: any,
    method: string,
    args: any[],
    description: string
  ): Promise<void> {
    if (this.useSafe) {
      // Encode the transaction data
      const data = contract.interface.encodeFunctionData(method, args);
      await this.proposeSafeTransaction(await contract.getAddress(), data, description);
    } else {
      // Execute directly
      const tx = await contract[method](...args);
      await tx.wait(NUM_BLOCKS_TO_WAIT);
      console.log(`✅ ${description}`);
    }
  }

  /**
   * Load chain metadata and auto-populate FT token addresses and receive confirmations
   */
  buildChainConfigs(metadata: Record<string, ChainMetadata>): void {
    for (const [chainKey, chainData] of Object.entries(metadata)) {
      this.buildChainConfig(chainKey, chainData);
    }
  }

  /**
   * Build chain configuration from metadata
   */
  private buildChainConfig(chainKey: string, metadata: ChainMetadata): void {
    // Find the mainnet v2 deployment
    const v2Deployment = metadata.deployments.find(
      (deployment) => deployment.version === 2
    );

    if (!v2Deployment) {
      return;
    }

    if (!v2Deployment.endpointV2?.address || !v2Deployment.executor?.address) {
      return;
    }

    // Get send and receive library addresses (V2 only)
    const sendLibAddress = v2Deployment.sendUln302?.address;
    const receiveLibAddress = v2Deployment.receiveUln302?.address;

    if (!sendLibAddress || !receiveLibAddress) {
      throw new Error(`Missing ULN addresses for chain ${chainKey}`);
    }

    const isMainnet = v2Deployment.stage == "mainnet";

    // Filter active DVNs (non-deprecated, version 2)
    const dvnAddresses = Object.entries(metadata.dvns)
      .filter(
        ([_, dvn]) =>
          dvn.version === 2 &&
          !dvn.deprecated &&
          !dvn.lzReadCompatible &&
          (dvn.canonicalName == requiredDVN || (isMainnet && dvn.canonicalName == requiredDVNMainnet))
      )
      .map(([address, _]) => address)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    if (dvnAddresses.length === 0) {
      throw new Error(`No active DVNs found for chain ${chainKey}`);
    }

    // 2 for mainnet and 1 for the testnet
    if (dvnAddresses.length != (isMainnet ? 2 : 1)) {
      console.log(metadata.dvns, isMainnet, dvnAddresses)
      throw new Error(`Did not find the corresponding dvns`);
    }

    const chainConfig: ChainConfig = {
      chainKey,
      eid: parseInt(v2Deployment.eid),
      nativeChainId: metadata.chainDetails.nativeChainId,
      endpointV2Address: v2Deployment.endpointV2.address,
      executorAddress: v2Deployment.executor.address,
      sendLibAddress,
      receiveLibAddress,
      dvnAddresses,
      ftTokenAddress: getChainConfig(metadata.chainDetails.nativeChainId)?.ftTokenAddress,
      confirmations: getChainConfig(metadata.chainDetails.nativeChainId)?.confirmations
    };

    this.chainConfigMap.set(chainKey, chainConfig);
  }

  /**
   * Get chain configuration by chain key
   */
  getChainConfig(chainKey: string): ChainConfig {
    const config = this.chainConfigMap.get(chainKey);
    if (!config) {
      throw new Error(`Chain configuration not found for ${chainKey}`);
    }
    return config;
  }

  /**
   * Wire source chain with the destination chain
   * Returns the transactions to be executed (for batching when using Safe)
   */
  async wireChains(
    sourceChainKey: string,
    destinationChainKey: string,
    ft: FT
  ): Promise<MetaTransactionData[]> {
    const sourceConfig = this.getChainConfig(sourceChainKey);
    const destConfig = this.getChainConfig(destinationChainKey);

    console.log(
      `Wiring ${sourceChainKey} (EID: ${sourceConfig.eid}) <=> ${destinationChainKey} (EID: ${destConfig.eid})`
    );

    // Check if we're on the source chain
    const sourceChainId = await this.hre.getChainId();
    if (parseInt(sourceChainId) !== sourceConfig.nativeChainId) {
      throw new Error(`Current chain (${sourceChainId}) doesn't match source chain (${sourceConfig.nativeChainId})`);
    }

    const endpointContract = (await this.hre.ethers.getContractAt(
      "ILayerZeroEndpointV2",
      sourceConfig.endpointV2Address
    )) as unknown as ILayerZeroEndpointV2;

    const destTokenAddress = destConfig.ftTokenAddress;
    if (!destTokenAddress) {
      throw new Error(`No FT token address configured for destination chain ${destinationChainKey}`);
    }

    await this.configureSendSettings(endpointContract, ft, sourceConfig, destConfig);

    await this.configureReceiveSettings(endpointContract, ft, sourceConfig, destConfig);

    return this.preparePeerAndEnforcedOptions(ft, destConfig, destTokenAddress);
  }

  /**
   * Configure send settings for cross-chain communication
   */
  private async configureSendSettings(
    endpointContract: ILayerZeroEndpointV2,
    ft: FT,
    sourceConfig: ChainConfig,
    destConfig: ChainConfig
  ): Promise<void> {
    const sendConfig = [
      {
        eid: destConfig.eid,
        configType: 1, // send
        config: this.hre.ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(uint32 maxMessageSize, address executor)"],
          [
            {
              maxMessageSize: 10000, // Fixed value for all chains
              executor: sourceConfig.executorAddress
            }
          ]
        )
      },
      {
        eid: destConfig.eid,
        configType: 2,
        config: this.hre.ethers.AbiCoder.defaultAbiCoder().encode(
          [
            "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)"
          ],
          [
            {
              confirmations: destConfig.confirmations,
              requiredDVNCount: sourceConfig.dvnAddresses.length,
              optionalDVNCount: NIL_DVN_COUNT,
              optionalDVNThreshold: 0,
              requiredDVNs: sourceConfig.dvnAddresses,
              optionalDVNs: []
            }
          ]
        )
      }
    ];

    if ((await endpointContract.defaultSendLibrary(sourceConfig.eid)) !== sourceConfig.sendLibAddress) {
      throw new Error(`Send library mismatch`);
    }

    let tx = await endpointContract.setSendLibrary(ft, destConfig.eid, sourceConfig.sendLibAddress);
    await tx.wait(NUM_BLOCKS_TO_WAIT);
    console.log(`Send library set`);

    tx = await endpointContract.setConfig(ft, sourceConfig.sendLibAddress, sendConfig);
    await tx.wait(NUM_BLOCKS_TO_WAIT);
    console.log(`Send config set`);
  }

  /**
   * Configure receive settings for cross-chain communication
   */
  private async configureReceiveSettings(
    endpointContract: ILayerZeroEndpointV2,
    ft: any,
    sourceConfig: ChainConfig,
    destConfig: ChainConfig
  ): Promise<void> {
    const receiveConfig = [
      {
        eid: destConfig.eid,
        configType: 2, // receive
        config: this.hre.ethers.AbiCoder.defaultAbiCoder().encode(
          [
            "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)"
          ],
          [
            {
              confirmations: sourceConfig.confirmations,
              requiredDVNCount: sourceConfig.dvnAddresses.length,
              optionalDVNCount: NIL_DVN_COUNT,
              optionalDVNThreshold: 0,
              requiredDVNs: sourceConfig.dvnAddresses,
              optionalDVNs: []
            }
          ]
        )
      }
    ];

    if ((await endpointContract.defaultReceiveLibrary(sourceConfig.eid)) !== sourceConfig.receiveLibAddress) {
      throw new Error(`Receive library mismatch`);
    }

    let tx = await endpointContract.setReceiveLibrary(ft, destConfig.eid, sourceConfig.receiveLibAddress, 0);
    await tx.wait(NUM_BLOCKS_TO_WAIT);
    console.log(`Receive library set`);

    tx = await endpointContract.setConfig(ft, sourceConfig.receiveLibAddress, receiveConfig);
    await tx.wait(NUM_BLOCKS_TO_WAIT);
    console.log(`Receive config set`);
  }

  /**
   * Prepare peer relationship and enforced options transactions
   * Returns the transactions to be batched together
   */
  private async preparePeerAndEnforcedOptions(
    ft: any,
    destConfig: ChainConfig,
    destTokenAddress: string
  ): Promise<MetaTransactionData[]> {
    const options = Options.newOptions()
      .addExecutorLzReceiveOption(300000, 0) // Fixed gas limit for all chains
      .toHex()
      .toString();

    const enforcedOptions = [
      {
        eid: destConfig.eid,
        msgType: 2, // RECEIVE
        options
      }
    ];

    const ftAddress = await ft.getAddress();
    
    const setPeerData = ft.interface.encodeFunctionData("setPeer", [
      destConfig.eid,
      this.hre.ethers.zeroPadValue(destTokenAddress, 32)
    ]);

    const setEnforcedOptionsData = ft.interface.encodeFunctionData("setEnforcedOptions", [
      enforcedOptions
    ]);

    return [
      {
        to: ftAddress,
        value: "0",
        data: setPeerData,
        operation: OperationType.Call,
      },
      {
        to: ftAddress,
        value: "0",
        data: setEnforcedOptionsData,
        operation: OperationType.Call,
      }
    ];
  }

  /**
   * Wire multiple chains together in a full mesh network
   */
  async wireMultipleChains(chainKeys: string[]): Promise<void> {
    console.log("🔗 Starting multi-chain wiring process...");
    console.log(`Chains to wire: ${chainKeys.join(", ")}`);

    // Validate all chains have required configuration
    for (const chainKey of chainKeys) {
      const tokenAddress = this.getChainConfig(chainKey).ftTokenAddress;
      if (!tokenAddress) {
        throw new Error(`No FT token address found for chain ${chainKey}`);
      }
    }

    const sourceChain = this.hre.network.name;
    const sourceConfig = this.getChainConfig(sourceChain);
    console.log(`Source chain: ${sourceChain}`);

    // Check if we're on the source chain
    const sourceChainId = await this.hre.getChainId();
    if (parseInt(sourceChainId) !== sourceConfig.nativeChainId) {
      throw new Error(`Current chain (${sourceChainId}) doesn't match source chain (${sourceConfig.nativeChainId})`);
    }

    // Initialize Safe if needed
    if (this.useSafe) {
      await this.initializeSafe();
    }

    const ft = await this.hre.ethers.getContractAt("FT", (await this.hre.deployments.get("FT")).address) as unknown as FT;

    // Wire current chain to all other chains
    const targetChains = chainKeys.filter((chain) => chain !== sourceChain);
    console.log(`Target chains: ${targetChains.join(", ")}`);

    if (this.useSafe) {
      // Collect all transactions first
      const allTransactions: MetaTransactionData[] = [];
      
      for (const targetChain of targetChains) {
        try {
          const transactions = await this.wireChains(sourceChain, targetChain, ft);
          allTransactions.push(...transactions);
        } catch (error) {
          console.error(`❌ Failed to prepare wiring for ${sourceChain} => ${targetChain}:`, error);
          throw error;
        }
      }

      // Propose all transactions as a single batch
      await this.proposeSafeBatchTransaction(
        allTransactions,
        `Wire ${sourceChain} to ${targetChains.length} chains (${targetChains.join(", ")})`
      );

      console.log(`\nSuccessfully proposed 1 batch transaction for setting peers & enforced options containing ${allTransactions.length} operations to Safe multisig!`);
      console.log(`Please review and sign the transaction in the Safe UI.`);
    } else {
      // Execute directly (sequential)
      for (const targetChain of targetChains) {
        try {
          const transactions = await this.wireChains(sourceChain, targetChain, ft);
          
          // Execute each transaction
          for (const txData of transactions) {
            const tx = await (await this.hre.ethers.provider.getSigner()).sendTransaction({
              to: txData.to,
              data: txData.data,
              value: txData.value,
            });
            await tx.wait(NUM_BLOCKS_TO_WAIT);
          }
          
          console.log(`✅ Wired ${sourceChain} => ${targetChain}`);
        } catch (error) {
          console.error(`❌ Failed to wire ${sourceChain} => ${targetChain}:`, error);
          throw error;
        }
      }

      console.log(`\n✅ Successfully wired ${sourceChain} to ${targetChains.length} other chain(s)!`);
    }
  }

  /**
   * Get summary of chain configurations
   */
  outputChainSummary(): void {
    console.log("\n📊 Chain Configuration Summary:");
    console.log("=".repeat(60));
    for (const [chainKey, config] of this.chainConfigMap.entries()) {
      const tokenAddress = config.ftTokenAddress;
      console.log(`\n🔗 ${chainKey.toUpperCase()}`);
      console.log(`   EID: ${config.eid}`);
      console.log(`   Native Chain ID: ${config.nativeChainId}`);
      console.log(`   Endpoint V2: ${config.endpointV2Address}`);
      console.log(`   Executor: ${config.executorAddress}`);
      console.log(`   DVNs: ${config.dvnAddresses.length} active`);
      console.log(`   FT Token: ${tokenAddress || "Not found"}`);
    }
    console.log("=".repeat(60));
  }
}

task("lz:ft:wire", "Wire multiple chains together using LayerZero")
  .addParam(
    "chains",
    "Comma-separated list of chain keys to wire (e.g., 'sonic,avalanche') can include active chain, it will just be skipped",
    undefined,
    types.string
  )
  .addFlag("safe", "Use Safe multisig for setPeer and setEnforcedOptions transactions")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    try {
      const chains = args.chains.split(",").map((c: string) => c.trim());
      const useSafe = args.safe || false;

      const [signer] = await hre.ethers.getSigners();
      console.log(`Using signer: ${signer.address}`);

      console.log("Starting LayerZero Multi-Chain Wiring...");
      console.log("Configuration:");
      console.log(`   Chains: ${chains.join(", ")}`);
      console.log(`   Max Message Size: 10000 (fixed)`);
      console.log(`   Gas Limit: 300000 (fixed)`);
      console.log(`   Required DVNs: ${requiredDVN}, ${requiredDVNMainnet}`);
      console.log(`   Optional DVNs: None`);
      console.log(`   Deployer: ${(await hre.ethers.getSigners())[0].address}`);
      console.log(`   Use Safe Multisig: ${useSafe ? "Yes" : "No"}`);
      console.log("");

      const wireManager = new LayerZeroMultiChainWire(hre, useSafe);

      const lzMetadataPath = "../utils/lzMetadata.json";

      // Load chain configurations
      const metadata = (require(lzMetadataPath) as Record<string, ChainMetadata>);
      wireManager.buildChainConfigs(metadata);

      // Show configuration summary
      wireManager.outputChainSummary();

      // Wire the chains using embedded configuration
      await wireManager.wireMultipleChains(chains);
    } catch (error) {
      console.error("❌ Multi-chain wiring failed:", error);
      process.exit(1);
    }
  });

export { LayerZeroMultiChainWire, ChainConfig };

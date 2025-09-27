import { Options } from "@layerzerolabs/lz-v2-utilities";
import { ILayerZeroEndpointV2 } from "../typechain-types";
import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { FT_TOKEN_ADDRESSES, RECEIVE_CONFIRMATIONS } from "../utils/constants";

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
  dvns: Record<string, {
    version: number;
    canonicalName: string;
    id: string;
    deprecated?: boolean;
    lzReadCompatible?: boolean
  }>;
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
  receiveConfirmations: number;
}

// =============================================================================
// CONFIGURATION SECTION
// =============================================================================

const MULTI_CHAIN_CONFIG = {
  // Chains to wire together
  chainKeys: ["sonic", "avalanche"], // , "ethereum"],

  // Chain metadata - load from our JSON file
  metadata: require('../utils/lzMetadata.json') as Record<string, ChainMetadata>
};

// =============================================================================
// END CONFIGURATION SECTION
// =============================================================================

class LayerZeroMultiChainWire {
  private chainConfigMap: Map<string, ChainConfig> = new Map();

  constructor(private hre: HardhatRuntimeEnvironment) {}

  /**
   * Load chain metadata and auto-populate FT token addresses and receive confirmations
   */
  loadChainMetadata(metadata: Record<string, ChainMetadata>): void {
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
      deployment => deployment.version === 2 && deployment.stage === "mainnet"
    );

    if (!v2Deployment) {
      throw new Error(`No mainnet v2 deployment found for chain ${chainKey}`);
    }

    if (!v2Deployment.endpointV2?.address) {
      throw new Error(`No endpointV2 address found for chain ${chainKey}`);
    }

    if (!v2Deployment.executor?.address) {
      throw new Error(`No executor address found for chain ${chainKey}`);
    }

    // Get send and receive library addresses (V2 only)
    const sendLibAddress = v2Deployment.sendUln302?.address;
    const receiveLibAddress = v2Deployment.receiveUln302?.address;

    if (!sendLibAddress || !receiveLibAddress) {
      throw new Error(`Missing ULN addresses for chain ${chainKey}`);
    }

    // Filter active DVNs (non-deprecated, version 2)
    const dvnAddresses = Object.entries(metadata.dvns)
      .filter(([_, dvn]) => dvn.version === 2 && !dvn.deprecated && !dvn.lzReadCompatible && (dvn.canonicalName == "LayerZero Labs" || dvn.canonicalName == "Stargate"))
      .map(([address, _]) => address);

    if (dvnAddresses.length === 0) {
      throw new Error(`No active DVNs found for chain ${chainKey}`);
    }

    if (dvnAddresses.length !== 2) {
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
      ftTokenAddress: FT_TOKEN_ADDRESSES[metadata.chainDetails.nativeChainId],
      receiveConfirmations: RECEIVE_CONFIRMATIONS[metadata.chainDetails.nativeChainId]
    };

    this.chainConfigMap.set(chainKey, chainConfig);
  }

  /**
   * Get chain configuration by chain key
   */
  getChainConfig(chainKey: string): ChainConfig {
      console.log(this.chainConfigMap);
    const config = this.chainConfigMap.get(chainKey);
    if (!config) {
      throw new Error(`Chain configuration not found for ${chainKey}`);
    }
    return config;
  }

  /**
   * Wire two chains together bidirectionally
   */
  async wireChains(
    sourceChainKey: string,
    destinationChainKey: string
  ): Promise<void> {
    const sourceConfig = this.getChainConfig(sourceChainKey);
    const destConfig = this.getChainConfig(destinationChainKey);

    console.log(`Wiring ${sourceChainKey} (EID: ${sourceConfig.eid}) <=> ${destinationChainKey} (EID: ${destConfig.eid})`);

    // Check if we're on the source chain
    const currentChainId = await this.hre.getChainId();
    if (parseInt(currentChainId) !== sourceConfig.nativeChainId) {
      throw new Error(`Current chain (${currentChainId}) doesn't match source chain (${sourceConfig.nativeChainId})`);
    }

    const [signer] = await this.hre.ethers.getSigners();
    console.log(`Using signer: ${signer.address}`);

    // Get contracts
    const endpointContract = (await this.hre.ethers.getContractAt(
      "ILayerZeroEndpointV2",
      sourceConfig.endpointV2Address
    )) as unknown as ILayerZeroEndpointV2;

    const ft = await this.hre.ethers.getContractAt(
      "FT",
      (await this.hre.deployments.get("FT")).address
    );

    const destTokenAddress = destConfig.ftTokenAddress;
    if (!destTokenAddress) {
      throw new Error(`No FT token address configured for destination chain ${destinationChainKey}`);
    }

    await this.configureSendSettings(
      endpointContract,
      ft,
      sourceConfig,
      destConfig
    );

    await this.configureReceiveSettings(
      endpointContract,
      ft,
      sourceConfig,
      destConfig
    );

    await this.setPeer(ft, destConfig, destTokenAddress);

    await this.setEnforcedOptions(ft, destConfig);

    console.log(`Wired ${sourceChainKey} => ${destinationChainKey}`);
  }

  /**
   * Configure send settings for cross-chain communication
   */
  private async configureSendSettings(
    endpointContract: ILayerZeroEndpointV2,
    ft: any,
    sourceConfig: ChainConfig,
    destConfig: ChainConfig
  ): Promise<void> {
    const sendConfig = [
      {
        eid: destConfig.eid,
        configType: 1, // send
        config: this.hre.ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(uint32 maxMessageSize, address executor)"],
          [{
            maxMessageSize: 10000, // Fixed value for all chains
            executor: sourceConfig.executorAddress
          }]
        )
      },
      {
        eid: destConfig.eid,
        configType: 2,
        config: this.hre.ethers.AbiCoder.defaultAbiCoder().encode(
          [
            "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)"
          ],
          [{
            confirmations: destConfig.receiveConfirmations,
            requiredDVNCount: sourceConfig.dvnAddresses.length,
            optionalDVNCount: 0,
            optionalDVNThreshold: 0,
            requiredDVNs: sourceConfig.dvnAddresses,
            optionalDVNs: []
          }]
        )
      }
    ];

    console.log(ft, sourceConfig.sendLibAddress, sendConfig);

    const tx = await endpointContract.setConfig(ft, sourceConfig.sendLibAddress, sendConfig);
    await tx.wait();
    console.log(`Send config set for ${destConfig.chainKey}`);
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
          [{
            confirmations: sourceConfig.receiveConfirmations,
            requiredDVNCount: sourceConfig.dvnAddresses.length,
            optionalDVNCount: 0,
            optionalDVNThreshold: 0,
            requiredDVNs: sourceConfig.dvnAddresses,
            optionalDVNs: []
          }]
        )
      }
    ];

    const tx = await endpointContract.setConfig(ft, sourceConfig.receiveLibAddress, receiveConfig);
    await tx.wait();
    console.log(`Receive config set for ${destConfig.chainKey}`);
  }

  /**
   * Set peer relationship
   */
  private async setPeer(ft: any, destConfig: ChainConfig, destTokenAddress: string): Promise<void> {
    const tx = await ft.setPeer(
      destConfig.eid,
      this.hre.ethers.zeroPadValue(destTokenAddress, 32)
    );
    await tx.wait();
    console.log(`  ✓ Peer set for ${destConfig.chainKey}`);
  }

  /**
   * Set enforced options for gas and execution
   */
  private async setEnforcedOptions(ft: any, destConfig: ChainConfig): Promise<void> {
    const options = Options.newOptions()
      .addExecutorLzReceiveOption(300000, 0) // Fixed gas limit for all chains
      .toHex()
      .toString();

    const enforcedOptions = [{
      eid: destConfig.eid,
      msgType: 2, // RECEIVE
      options
    }];

    const tx = await ft.setEnforcedOptions(enforcedOptions);
    await tx.wait();
    console.log(`  ✓ Enforced options set for ${destConfig.chainKey}`);
  }

  /**
   * Wire multiple chains together in a full mesh network
   */
  async wireMultipleChains(
    chainKeys: string[]
  ): Promise<void> {
    console.log("🔗 Starting multi-chain wiring process...");
    console.log(`Chains to wire: ${chainKeys.join(", ")}`);

    // Validate all chains have required configuration
    for (const chainKey of chainKeys) {
      const tokenAddress = this.getChainConfig(chainKey).ftTokenAddress;
      if (!tokenAddress) {
        throw new Error(`No FT token address found for chain ${chainKey}`);
      }
    }

    // Get current chain to determine which wiring to perform
    const currentChainId = await this.hre.getChainId();
    const currentChain = chainKeys.find(chainKey => {
      const config = this.getChainConfig(chainKey);
      return config.nativeChainId === parseInt(currentChainId);
    });

    if (!currentChain) {
      throw new Error(`Current chain ${currentChainId} is not in the list of chains to wire`);
    }

    console.log(`📍 Currently on chain: ${currentChain}`);

    // Wire current chain to all other chains
    const targetChains = chainKeys.filter(chain => chain !== currentChain);
    console.log(targetChains);

    for (const targetChain of targetChains) {
      try {
        await this.wireChains(currentChain, targetChain);
      } catch (error) {
        console.error(`❌ Failed to wire ${currentChain} => ${targetChain}:`, error);
        throw error;
      }
    }

    console.log(`\n🎉 Successfully wired ${currentChain} to ${targetChains.length} other chains!`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Switch to each of the following chains and run this script:`);
    for (const chain of targetChains) {
      const config = this.getChainConfig(chain);
      console.log(`      - ${chain} (Chain ID: ${config.nativeChainId})`);
    }
    console.log(`   2. This will create a fully connected mesh network between all chains`);
  }

  /**
   * Get summary of chain configurations
   */
  getChainSummary(): void {
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

// Hardhat task - now uses embedded configuration
task("lz:ft:wire", "Wire multiple chains together using LayerZero")
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    try {
      console.log("🚀 Starting LayerZero Multi-Chain Wiring...");
      console.log("📋 Configuration:");
      console.log(`   Chains: ${MULTI_CHAIN_CONFIG.chainKeys.join(", ")}`);
      console.log(`   Max Message Size: 10000 (fixed)`);
      console.log(`   Gas Limit: 300000 (fixed)`);
      console.log("");

      const wireManager = new LayerZeroMultiChainWire(hre);

      // Load chain metadata from configuration
      wireManager.loadChainMetadata(MULTI_CHAIN_CONFIG.metadata);

      // Show configuration summary
      wireManager.getChainSummary();

      // Wire the chains using embedded configuration
      await wireManager.wireMultipleChains(
        MULTI_CHAIN_CONFIG.chainKeys
      );

    } catch (error) {
      console.error("❌ Multi-chain wiring failed:", error);
      process.exit(1);
    }
  });

// Export the class for standalone use
export { LayerZeroMultiChainWire, ChainConfig };
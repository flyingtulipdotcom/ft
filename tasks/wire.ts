import { Options } from "@layerzerolabs/lz-v2-utilities";
import { NIL_DVN_COUNT } from "@layerzerolabs/metadata-tools"
import { ILayerZeroEndpointV2 } from "../typechain-types";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getChainConfig } from "../utils/constants";

const requiredDVN = "LayerZero Labs"; // Required for both mainnet and testnet
const requiredDVNMainnet = "Stargate" // Only required on mainnet

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
  receiveConfirmations?: number;
}

class LayerZeroMultiChainWire {
  private chainConfigMap: Map<string, ChainConfig> = new Map();

  constructor(private hre: HardhatRuntimeEnvironment) {}

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
      receiveConfirmations: getChainConfig(metadata.chainDetails.nativeChainId)?.confirmations
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
   */
  async wireChains(sourceChainKey: string, destinationChainKey: string): Promise<void> {
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

    const ft = await this.hre.ethers.getContractAt("FT", (await this.hre.deployments.get("FT")).address);

    const destTokenAddress = destConfig.ftTokenAddress;
    if (!destTokenAddress) {
      throw new Error(`No FT token address configured for destination chain ${destinationChainKey}`);
    }

    await this.configureSendSettings(endpointContract, ft, sourceConfig, destConfig);

    await this.configureReceiveSettings(endpointContract, ft, sourceConfig, destConfig);

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
              confirmations: destConfig.receiveConfirmations,
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
              confirmations: sourceConfig.receiveConfirmations,
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

    let tx = await endpointContract.setReceiveLibrary(ft, sourceConfig.eid, sourceConfig.receiveLibAddress, 0);
    await tx.wait(NUM_BLOCKS_TO_WAIT);
    console.log(`Receive library set`);

    tx = await endpointContract.setConfig(ft, sourceConfig.receiveLibAddress, receiveConfig);
    await tx.wait(NUM_BLOCKS_TO_WAIT);
    console.log(`Receive config set`);
  }

  /**
   * Set peer relationship
   */
  private async setPeer(ft: any, destConfig: ChainConfig, destTokenAddress: string): Promise<void> {
    const tx = await ft.setPeer(destConfig.eid, this.hre.ethers.zeroPadValue(destTokenAddress, 32));
    await tx.wait(NUM_BLOCKS_TO_WAIT);
    console.log(`Peer set`);
  }

  /**
   * Set enforced options for gas and execution
   */
  private async setEnforcedOptions(ft: any, destConfig: ChainConfig): Promise<void> {
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

    const tx = await ft.setEnforcedOptions(enforcedOptions);
    await tx.wait(NUM_BLOCKS_TO_WAIT);
    console.log(`Enforced options set`);
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

    // Get current chain to determine which wiring to perform
    const sourceChainId = await this.hre.getChainId();
    const sourceChain = chainKeys.find((chainKey) => {
      const config = this.getChainConfig(chainKey);
      return config.nativeChainId === parseInt(sourceChainId);
    });

    if (!sourceChain) {
      throw new Error(`Current chain ${sourceChainId} is not in the list of chains to wire`);
    }

    console.log(`Source chain: ${sourceChain}`);

    // Wire current chain to all other chains
    const targetChains = chainKeys.filter((chain) => chain !== sourceChain);
    console.log(targetChains);

    for (const targetChain of targetChains) {
      try {
        await this.wireChains(sourceChain, targetChain);
      } catch (error) {
        console.error(`❌ Failed to wire ${sourceChain} => ${targetChain}:`, error);
        throw error;
      }
    }

    console.log(`\nSuccessfully wired ${sourceChain} to ${targetChains.length} other chains!`);
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
  .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
    try {
      const chains = args.chains.split(",").map((c: string) => c.trim());

      const [signer] = await hre.ethers.getSigners();
      console.log(`Using signer: ${signer.address}`);

      console.log("Starting LayerZero Multi-Chain Wiring...");
      console.log("Configuration:");
      console.log(`   Chains: ${chains.join(", ")}`);
      console.log(`   Max Message Size: 10000 (fixed)`);
      console.log(`   Gas Limit: 300000 (fixed)`);
      console.log(`   Required DVNs: LayerZero Labs, Stargate`);
      console.log(`   Optional DVNs: None`);
      console.log(`   Deployer: ${(await hre.ethers.getSigners())[0].address}`);
      console.log("");

      const wireManager = new LayerZeroMultiChainWire(hre);

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

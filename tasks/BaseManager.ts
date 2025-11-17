import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getChainConfig } from "../utils/constants";
import { ChainConfig, ChainMetadata } from "./types";

export abstract class LayerZeroBaseManager {
  protected chainConfigMap: Map<string, ChainConfig> = new Map();
  protected requiredDVN = "LayerZero Labs"; // Required for both mainnet and testnet
  protected requiredDVNMainnet = "Horizen"; // Only required on mainnet

  constructor(protected hre: HardhatRuntimeEnvironment) {}

  /**
   * Load chain metadata and auto-populate FT token addresses and receive confirmations
   */
  buildChainConfigs(metadata: Record<string, ChainMetadata>, includeDVNs: boolean = true): void {
    for (const [chainKey, chainData] of Object.entries(metadata)) {
      this.buildChainConfig(chainKey, chainData, includeDVNs);
    }
  }

  /**
   * Build chain configuration from metadata
   */
  protected buildChainConfig(chainKey: string, metadata: ChainMetadata, includeDVNs: boolean = true): void {
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

    let dvnAddresses: string[] = [];

    if (includeDVNs) {
      const isMainnet = v2Deployment.stage == "mainnet";

      // Filter active DVNs (non-deprecated, version 2)
      dvnAddresses = Object.entries(metadata.dvns)
        .filter(
          ([_, dvn]) =>
            dvn.version === 2 &&
            !dvn.deprecated &&
            !dvn.lzReadCompatible &&
            (dvn.canonicalName == this.requiredDVN || (isMainnet && dvn.canonicalName == this.requiredDVNMainnet))
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
   * Validate that all chains have required configuration
   */
  protected validateChains(chainKeys: string[]): void {
    for (const chainKey of chainKeys) {
      const tokenAddress = this.getChainConfig(chainKey).ftTokenAddress;
      if (!tokenAddress) {
        throw new Error(`No FT token address found for chain ${chainKey}`);
      }
    }
  }

  /**
   * Get and validate source chain configuration
   */
  protected async validateSourceChain(): Promise<{ sourceChain: string; sourceConfig: ChainConfig }> {
    const sourceChain = this.hre.network.name;
    const sourceConfig = this.getChainConfig(sourceChain);

    // Check if we're on the source chain
    const sourceChainId = await this.hre.getChainId();
    if (parseInt(sourceChainId) !== sourceConfig.nativeChainId) {
      throw new Error(`Current chain (${sourceChainId}) doesn't match source chain (${sourceConfig.nativeChainId})`);
    }

    return { sourceChain, sourceConfig };
  }

  /**
   * Load metadata from file
   */
  public loadMetadata(metadataPath: string = "../utils/lzMetadata.json"): Record<string, ChainMetadata> {
    return require(metadataPath) as Record<string, ChainMetadata>;
  }

  /**
   * Get the FT contract instance
   */
  protected async getFTContract() {
    return await this.hre.ethers.getContractAt("FT", (await this.hre.deployments.get("FT")).address);
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

  /**
   * Get summary of chain configurations (simplified for peer options)
   */
  outputSimpleChainSummary(): void {
    console.log("\n📊 Chain Configuration Summary:");
    console.log("=".repeat(60));
    for (const [chainKey, config] of this.chainConfigMap.entries()) {
      const tokenAddress = config.ftTokenAddress;
      console.log(`\n🔗 ${chainKey.toUpperCase()}`);
      console.log(`   EID: ${config.eid}`);
      console.log(`   Native Chain ID: ${config.nativeChainId}`);
      console.log(`   FT Token: ${tokenAddress || "Not found"}`);
    }
    console.log("=".repeat(60));
  }
}

/**
 * Shared CLI utilities
 */
export class CLIUtils {
  static async printTaskHeader(
    taskName: string,
    chains: string[],
    useSafe: boolean,
    hre: HardhatRuntimeEnvironment,
    additionalConfig?: Record<string, any>
  ): Promise<void> {
    const [signer] = await hre.ethers.getSigners();
    console.log(`Using signer: ${signer.address}`);

    console.log(`Starting ${taskName}...`);
    console.log("Configuration:");
    console.log(`   Chains: ${chains.join(", ")}`);
    
    if (additionalConfig) {
      for (const [key, value] of Object.entries(additionalConfig)) {
        console.log(`   ${key}: ${value}`);
      }
    }
    
    console.log(`   Deployer: ${signer.address}`);
    console.log(`   Use Safe Multisig: ${useSafe ? "Yes" : "No"}`);
    console.log("");
  }

  static parseChains(chainsParam: string): string[] {
    return chainsParam.split(",").map((c: string) => c.trim());
  }

  static handleTaskError(error: any, taskName: string): void {
    console.error(`❌ ${taskName} failed:`, error);
    process.exit(1);
  }
}

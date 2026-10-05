import { HardhatRuntimeEnvironment } from "hardhat/types";
import { getChainConfig } from "../utils/constants";
import { ChainConfig, ChainMetadata } from "./types";

export abstract class LayerZeroBaseManager {
  protected chainConfigMap: Map<string, ChainConfig> = new Map();
  protected requiredDVN = "LayerZero Labs"; // Required for both mainnet and testnet
  protected requiredDVNMainnet = "Canary"; // Only required on mainnet
  protected optionalDVNsMainnet = ["Deutsche Telekom", "Horizen", "Nethermind"];

  constructor(protected hre: HardhatRuntimeEnvironment) {}

  /**
   * Load chain metadata and auto-populate FT token addresses and receive confirmations
   */
  buildChainConfigs(
    metadata: Record<string, ChainMetadata>,
    includeDVNs: boolean = true,
    chainKeys: string[] = Object.keys(metadata)
  ): void {
    this.chainConfigMap.clear();
    for (const chainKey of new Set(chainKeys)) {
      const chainData = metadata[chainKey];
      if (!chainData) throw new Error(`Missing LayerZero metadata for chain ${chainKey}`);
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
    let optionalDvnAddresses: string[] = [];
    let optionalDvnThreshold = 0;

    if (includeDVNs) {
      if (v2Deployment.stage !== "mainnet" && v2Deployment.stage !== "testnet") {
        throw new Error(`Unknown LayerZero stage for ${chainKey}: ${v2Deployment.stage}`);
      }
      const isMainnet = v2Deployment.stage === "mainnet";
      const activeDvns = Object.entries(metadata.dvns).filter(
        ([_, dvn]) => dvn.version === 2 && !dvn.deprecated && !dvn.lzReadCompatible
      );
      const resolveProviders = (names: string[]): string[] => names.map((name) => {
        const matches = activeDvns.filter(([_, dvn]) => dvn.canonicalName === name);
        if (matches.length !== 1) {
          throw new Error(
            `${chainKey}: expected exactly one active V2 messaging DVN for ${name}; found ${matches.length}. ` +
            "Cannot apply the FT DVN policy. Resolve missing or ambiguous provider metadata before wiring."
          );
        }
        return matches[0][0];
      }).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

      dvnAddresses = resolveProviders(isMainnet
        ? [this.requiredDVN, this.requiredDVNMainnet]
        : [this.requiredDVN]);
      if (isMainnet) {
        optionalDvnAddresses = resolveProviders(this.optionalDVNsMainnet);
        optionalDvnThreshold = 2;
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
      optionalDvnAddresses,
      optionalDvnThreshold,
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
    return new this.hre.ethers.Contract(
      (await this.hre.deployments.get("FT")).address,
      (await this.hre.artifacts.readArtifact("FT")).abi,
      this.hre.ethers.provider
    );
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
      console.log(`   Required DVNs (${config.dvnAddresses.length}): ${config.dvnAddresses.join(", ")}`);
      console.log(`   Optional DVNs (${config.optionalDvnThreshold} of ${config.optionalDvnAddresses.length}): ${config.optionalDvnAddresses.join(", ") || "None"}`);
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
    additionalConfig?: Record<string, any>,
    readOnly: boolean = false
  ): Promise<void> {
    const signer = readOnly ? undefined : (await hre.ethers.getSigners())[0];
    if (signer) console.log(`Using signer: ${signer.address}`);

    console.log(`Starting ${taskName}...`);
    console.log("Configuration:");
    console.log(`   Chains: ${chains.join(", ")}`);
    
    if (additionalConfig) {
      for (const [key, value] of Object.entries(additionalConfig)) {
        console.log(`   ${key}: ${value}`);
      }
    }
    
    if (signer) console.log(`   Deployer: ${signer.address}`);
    if (readOnly) console.log("   Dry run: read-only transaction preview; no signing or submission");
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

import { NIL_DVN_COUNT } from "@layerzerolabs/metadata-tools"
import { FT, ILayerZeroEndpointV2 } from "../typechain-types";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { LayerZeroPeerOptionsManager } from "./peerOptions";
import { ChainConfig, TaskArgs, NUM_BLOCKS_TO_WAIT } from "./types";
import { LayerZeroBaseManager, CLIUtils } from "./BaseManager";

class LayerZeroMultiChainWire extends LayerZeroBaseManager {
  constructor(hre: HardhatRuntimeEnvironment) {
    super(hre);
  }

  /**
   * Wire source chain with the destination chain (only endpoint configuration)
   */
  async wireChains(
    sourceChainKey: string,
    destinationChainKey: string,
    ft: FT
  ): Promise<void> {
    const sourceConfig = this.getChainConfig(sourceChainKey);
    const destConfig = this.getChainConfig(destinationChainKey);

    console.log(
      `Wiring ${sourceChainKey} (EID: ${sourceConfig.eid}) <=> ${destinationChainKey} (EID: ${destConfig.eid})`
    );

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
   * Wire multiple chains together in a full mesh network
   */
  async wireMultipleChains(chainKeys: string[], useSafe: boolean): Promise<void> {
    console.log("🔗 Starting multi-chain wiring process...");
    console.log(`Chains to wire: ${chainKeys.join(", ")}`);

    // Validate all chains have required configuration
    this.validateChains(chainKeys);

    // Get and validate source chain
    const { sourceChain, sourceConfig } = await this.validateSourceChain();
    console.log(`Source chain: ${sourceChain}`);

    const ft = await this.getFTContract() as unknown as FT;

    // Wire current chain to all other chains (endpoint configuration only)
    const targetChains = chainKeys.filter((chain) => chain !== sourceChain);
    console.log(`Target chains: ${targetChains.join(", ")}`);

    for (const targetChain of targetChains) {
      try {
        await this.wireChains(sourceChain, targetChain, ft);
      } catch (error) {
        console.error(`❌ Failed to configure endpoints for ${sourceChain} => ${targetChain}:`, error);
        throw error;
      }
    }

    // Use the peer options manager to handle setPeer and setEnforcedOptions
    const peerOptionsManager = new LayerZeroPeerOptionsManager(this.hre, useSafe);

    // Build chain configs for the peer options manager (it only needs basic info)
    const metadata = this.loadMetadata();
    peerOptionsManager.buildChainConfigs(metadata);
    
    await peerOptionsManager.setPeersAndOptions(chainKeys);

    console.log(`\nSuccessfully wired ${sourceChain} to ${targetChains.length} other chain(s)!`);
  }
}

task("ft:wire", "Wire multiple chains together using LayerZero")
  .addParam(
    "chains",
    "Comma-separated list of chain keys to wire (e.g., 'sonic,avalanche') can include active chain, it will just be skipped",
    undefined,
    types.string
  )
  .addFlag("safe", "Use Safe multisig for setPeer and setEnforcedOptions transactions")
  .setAction(async (args: TaskArgs, hre: HardhatRuntimeEnvironment) => {
    try {
      const chains = CLIUtils.parseChains(args.chains);
      const useSafe = args.safe || false;

      await CLIUtils.printTaskHeader("LayerZero Multi-Chain Wiring", chains, useSafe, hre, {
        "Max Message Size": "10000 (fixed)",
        "Required DVNs": "LayerZero Labs, Horizen",
        "Optional DVNs": "None"
      });

      const wireManager = new LayerZeroMultiChainWire(hre);

      // Load chain configurations (include DVNs for endpoint config)
      const metadata = wireManager.loadMetadata();
      wireManager.buildChainConfigs(metadata, true);

      // Show configuration summary
      wireManager.outputChainSummary();

      // Wire the chains using embedded configuration
      await wireManager.wireMultipleChains(chains, useSafe);
    } catch (error) {
      CLIUtils.handleTaskError(error, "Multi-chain wiring");
    }
  });

export { LayerZeroMultiChainWire, ChainConfig };

import { NIL_DVN_COUNT } from "@layerzerolabs/metadata-tools"
import { FT, ILayerZeroEndpointV2 } from "../typechain-types";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  MetaTransactionData,
  OperationType
} from '@safe-global/types-kit'
import { SafeManager, SafeAddressType } from "./SafeManager";
import { LayerZeroPeerOptionsManager } from "./peerOptions";
import { ChainConfig, TaskArgs, NUM_BLOCKS_TO_WAIT } from "./types";
import { LayerZeroBaseManager, CLIUtils } from "./BaseManager";

class LayerZeroMultiChainWire extends LayerZeroBaseManager {
  private useSafe: boolean = false;
  private safeManager?: SafeManager;

  constructor(hre: HardhatRuntimeEnvironment, useSafe: boolean = false) {
    super(hre);
    this.useSafe = useSafe;
    if (this.useSafe) {
      this.safeManager = new SafeManager(this.hre, SafeAddressType.DELEGATE);
    }
  }

  /**
   * Use the local chain's verifier addresses for both send and receive.
   * Confirmations always describe the chain where the message originated.
   */
  private buildUlnConfig(localConfig: ChainConfig, confirmations: number | undefined) {
    if (localConfig.dvnAddresses.length === 0) {
      throw new Error(`DVN policy not loaded for ${localConfig.chainKey}; build chain configs with includeDVNs=true`);
    }
    if (confirmations === undefined || !Number.isSafeInteger(confirmations) || confirmations <= 0) {
      throw new Error(`Missing or invalid confirmation count for wiring ${localConfig.chainKey}`);
    }
    return {
      confirmations,
      requiredDVNCount: localConfig.dvnAddresses.length,
      optionalDVNCount: localConfig.optionalDvnAddresses.length || NIL_DVN_COUNT,
      optionalDVNThreshold: localConfig.optionalDvnThreshold,
      requiredDVNs: localConfig.dvnAddresses,
      optionalDVNs: localConfig.optionalDvnAddresses
    };
  }

  /**
   * Build send config for a destination chain
   */
  private buildSendConfig(sourceConfig: ChainConfig, destConfig: ChainConfig): any[] {
    return [
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
          [this.buildUlnConfig(sourceConfig, sourceConfig.confirmations)]
        )
      }
    ];
  }

  /**
   * Build receive config for a destination chain
   */
  private buildReceiveConfig(sourceConfig: ChainConfig, destConfig: ChainConfig): any[] {
    return [
      {
        eid: destConfig.eid,
        configType: 2, // receive
        config: this.hre.ethers.AbiCoder.defaultAbiCoder().encode(
          [
            "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)"
          ],
          [this.buildUlnConfig(sourceConfig, destConfig.confirmations)]
        )
      }
    ];
  }

  /**
   * Prepare endpoint configuration transactions for a single destination
   * Returns the transactions to be batched together
   */
  private async prepareEndpointConfig(
    endpointContract: ILayerZeroEndpointV2,
    ft: FT,
    sourceConfig: ChainConfig,
    destConfig: ChainConfig
  ): Promise<MetaTransactionData[]> {
    const transactions: MetaTransactionData[] = [];
    const endpointAddress = await endpointContract.getAddress();
    const ftAddress = await ft.getAddress();

    // Build configs
    const sendConfig = this.buildSendConfig(sourceConfig, destConfig);
    const receiveConfig = this.buildReceiveConfig(sourceConfig, destConfig);

    // 1. Set send library
    const setSendLibData = endpointContract.interface.encodeFunctionData("setSendLibrary", [
      ftAddress,
      destConfig.eid,
      sourceConfig.sendLibAddress
    ]);

    transactions.push({
      to: endpointAddress,
      value: "0",
      data: setSendLibData,
      operation: OperationType.Call,
    });

    // 2. Set send config
    const setSendConfigData = endpointContract.interface.encodeFunctionData("setConfig", [
      ftAddress,
      sourceConfig.sendLibAddress,
      sendConfig
    ]);

    transactions.push({
      to: endpointAddress,
      value: "0",
      data: setSendConfigData,
      operation: OperationType.Call,
    });

    // 3. Set receive library
    const setReceiveLibData = endpointContract.interface.encodeFunctionData("setReceiveLibrary", [
      ftAddress,
      destConfig.eid,
      sourceConfig.receiveLibAddress,
      0
    ]);

    transactions.push({
      to: endpointAddress,
      value: "0",
      data: setReceiveLibData,
      operation: OperationType.Call,
    });

    // 4. Set receive config
    const setReceiveConfigData = endpointContract.interface.encodeFunctionData("setConfig", [
      ftAddress,
      sourceConfig.receiveLibAddress,
      receiveConfig
    ]);

    transactions.push({
      to: endpointAddress,
      value: "0",
      data: setReceiveConfigData,
      operation: OperationType.Call,
    });

    return transactions;
  }

  /**
   * Wire multiple chains together in a full mesh network
   */
  async wireMultipleChains(chainKeys: string[], dryRun: boolean = false): Promise<void> {
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

    // Collect all endpoint configuration transactions first
    const allTransactions: MetaTransactionData[] = [];
    
    const endpointContract = new this.hre.ethers.Contract(
      sourceConfig.endpointV2Address,
      (await this.hre.artifacts.readArtifact("ILayerZeroEndpointV2")).abi,
      this.hre.ethers.provider
    ) as unknown as ILayerZeroEndpointV2;

    for (const targetChain of targetChains) {
      try {
        const destConfig = this.getChainConfig(targetChain);
        const destTokenAddress = destConfig.ftTokenAddress;
        if (!destTokenAddress) {
          throw new Error(`No FT token address configured for destination chain ${targetChain}`);
        }

        console.log(
          `Preparing ${sourceChain} (EID: ${sourceConfig.eid}) <=> ${targetChain} (EID: ${destConfig.eid})`
        );
        console.log(
          `ULN: send confirmations=${sourceConfig.confirmations}, receive confirmations=${destConfig.confirmations}; ` +
          `required=${sourceConfig.dvnAddresses.length}, optional=${sourceConfig.optionalDvnThreshold} of ${sourceConfig.optionalDvnAddresses.length}`
        );

        // Validate libraries before preparing transactions (per destination EID)
        if ((await endpointContract.defaultSendLibrary(destConfig.eid)) !== sourceConfig.sendLibAddress) {
          throw new Error(`Send library mismatch for ${targetChain}`);
        }
        if ((await endpointContract.defaultReceiveLibrary(destConfig.eid)) !== sourceConfig.receiveLibAddress) {
          throw new Error(`Receive library mismatch for ${targetChain}`);
        }

        const transactions = await this.prepareEndpointConfig(endpointContract, ft, sourceConfig, destConfig);
        allTransactions.push(...transactions);
      } catch (error) {
        console.error(`❌ Failed to prepare endpoint config for ${sourceChain} => ${targetChain}:`, error);
        throw error;
      }
    }

    // Execute transactions - either via Safe or directly
    if (dryRun) {
      console.log(JSON.stringify({ chain: sourceChain, role: "delegate", transactions: allTransactions }, null, 2));
    } else if (this.useSafe && this.safeManager) {
      await this.safeManager.initialize();
      // Propose all endpoint configuration transactions as a single batch
      await this.safeManager.proposeSafeBatchTransaction(
        allTransactions,
        `Wire endpoint configuration for ${sourceChain} to ${targetChains.length} chains (${targetChains.join(", ")})`
      );

      console.log(`\n✅ Successfully proposed 1 batch transaction containing ${allTransactions.length} endpoint operations to Safe multisig!`);
      console.log(`Please review and sign the transaction in the Safe UI.`);
    } else {
      // Execute directly (sequential)
      console.log(`\nExecuting ${allTransactions.length} endpoint configuration transactions...`);
      
      const signer = await this.hre.ethers.provider.getSigner();
      for (let i = 0; i < allTransactions.length; i++) {
        const txData = allTransactions[i];
        console.log(`Transaction ${i + 1}/${allTransactions.length}`);
        
        const tx = await signer.sendTransaction({
          to: txData.to,
          data: txData.data,
          value: txData.value,
        });
        await tx.wait(NUM_BLOCKS_TO_WAIT);
      }
      
      console.log(`All endpoint configurations completed`);
    }

    // Use the peer options manager to handle setPeer and setEnforcedOptions
    const peerOptionsManager = new LayerZeroPeerOptionsManager(this.hre, this.useSafe);

    // Build chain configs for the peer options manager (it only needs basic info)
    const metadata = this.loadMetadata();
    peerOptionsManager.buildChainConfigs(metadata, false, [sourceChain, ...chainKeys]);
    
    await peerOptionsManager.setPeersAndOptions(chainKeys, dryRun);

    console.log(dryRun
      ? "\nDry run complete: endpoint and peer/options calldata generated; no transactions signed or submitted."
      : `\nSuccessfully wired ${sourceChain} to ${targetChains.length} other chain(s)!`);
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
  .addFlag("dryRun", "Preview endpoint and peer/options calldata without signing or submitting transactions")
  .setAction(async (args: TaskArgs, hre: HardhatRuntimeEnvironment) => {
    try {
      const chains = CLIUtils.parseChains(args.chains);
      const useSafe = args.safe || false;
      const dryRun = args.dryRun || false;

      await CLIUtils.printTaskHeader("LayerZero Multi-Chain Wiring", chains, useSafe, hre, {
        "Max Message Size": "10000 (fixed)",
        "Required DVNs": "Mainnet: LayerZero Labs + Canary; testnet: LayerZero Labs",
        "Optional DVNs": "Mainnet: 2 of 3 (Deutsche Telekom, Horizen, Nethermind); testnet: None"
      }, dryRun);

      const wireManager = new LayerZeroMultiChainWire(hre, useSafe);

      // Load chain configurations (include DVNs for endpoint config)
      const metadata = wireManager.loadMetadata();
      wireManager.buildChainConfigs(metadata, true, [hre.network.name, ...chains]);

      // Show configuration summary
      wireManager.outputChainSummary();

      // Wire the chains using embedded configuration
      await wireManager.wireMultipleChains(chains, dryRun);
    } catch (error) {
      CLIUtils.handleTaskError(error, "Multi-chain wiring");
    }
  });

export { LayerZeroMultiChainWire, ChainConfig };

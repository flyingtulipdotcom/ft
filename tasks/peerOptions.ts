import { Options } from "@layerzerolabs/lz-v2-utilities";
import { FT } from "../typechain-types";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  MetaTransactionData,
  OperationType
} from '@safe-global/types-kit'
import { SafeManager, SafeAddressType } from "./SafeManager";
import { ChainConfig, TaskArgs, NUM_BLOCKS_TO_WAIT } from "./types";
import { LayerZeroBaseManager, CLIUtils } from "./BaseManager";

// Only need this task if peering with other contracts on a chain already wired up
class LayerZeroPeerOptionsManager extends LayerZeroBaseManager {
  private useSafe: boolean = false;
  private safeManager?: SafeManager;

  constructor(hre: HardhatRuntimeEnvironment, useSafe: boolean = false) {
    super(hre);
    this.useSafe = useSafe;
    if (this.useSafe) {
      this.safeManager = new SafeManager(this.hre, SafeAddressType.OWNER);
    }
  }

  /**
   * Prepare peer relationship and enforced options transactions for a single destination
   * Returns the transactions to be batched together
   */
  private async preparePeerAndEnforcedOptions(
    ft: FT,
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
   * Set peers and enforced options for multiple chains
   */
  async setPeersAndOptions(chainKeys: string[]): Promise<void> {
    console.log("🔗 Starting peer and enforced options setup...");
    console.log(`Chains to configure: ${chainKeys.join(", ")}`);

    // Validate all chains have required configuration
    this.validateChains(chainKeys);

    // Get and validate source chain
    const { sourceChain } = await this.validateSourceChain();
    console.log(`Source chain: ${sourceChain}`);

    // Initialize Safe if needed
    if (this.useSafe && this.safeManager) {
      await this.safeManager.initialize();
    }

    const ft = await this.getFTContract() as unknown as FT;

    // Configure current chain to all other chains
    const targetChains = chainKeys.filter((chain) => chain !== sourceChain);
    console.log(`Target chains: ${targetChains.join(", ")}`);

    if (this.useSafe && this.safeManager) {
      // Collect all transactions first
      const allTransactions: MetaTransactionData[] = [];
      
      for (const targetChain of targetChains) {
        try {
          const destConfig = this.getChainConfig(targetChain);
          const destTokenAddress = destConfig.ftTokenAddress;
          if (!destTokenAddress) {
            throw new Error(`No FT token address configured for destination chain ${targetChain}`);
          }

          const transactions = await this.preparePeerAndEnforcedOptions(ft, destConfig, destTokenAddress);
          allTransactions.push(...transactions);
        } catch (error) {
          console.error(`❌ Failed to prepare peer/options for ${sourceChain} => ${targetChain}:`, error);
          throw error;
        }
      }

      // Propose all transactions as a single batch
      await this.safeManager.proposeSafeBatchTransaction(
        allTransactions,
        `Set peers and enforced options for ${sourceChain} to ${targetChains.length} chains (${targetChains.join(", ")})`
      );

      console.log(`\nSuccessfully proposed 1 batch transaction containing ${allTransactions.length} operations to Safe multisig!`);
      console.log(`Please review and sign the transaction in the Safe UI.`);
    } else {
      // Execute directly (sequential)
      for (const targetChain of targetChains) {
        try {
          const destConfig = this.getChainConfig(targetChain);
          const destTokenAddress = destConfig.ftTokenAddress;
          if (!destTokenAddress) {
            throw new Error(`No FT token address configured for destination chain ${targetChain}`);
          }

          const transactions = await this.preparePeerAndEnforcedOptions(ft, destConfig, destTokenAddress);
          
          // Execute each transaction
          for (const txData of transactions) {
            const tx = await (await this.hre.ethers.provider.getSigner()).sendTransaction({
              to: txData.to,
              data: txData.data,
              value: txData.value,
            });
            await tx.wait(NUM_BLOCKS_TO_WAIT);
          }
          
          console.log(`Set peer and enforced options for ${sourceChain} => ${targetChain}`);
        } catch (error) {
          console.error(`Failed to set peer/options for ${sourceChain} => ${targetChain}:`, error);
          throw error;
        }
      }

      console.log(`\nSuccessfully set peers and enforced options for ${sourceChain} to ${targetChains.length} other chain(s)!`);
    }
  }
}

task("ft:peer-options", "Set peers and enforced options for FT tokens across multiple chains")
  .addParam(
    "chains",
    "Comma-separated list of chain keys to configure (e.g., 'sonic,avalanche') can include active chain, it will just be skipped",
    undefined,
    types.string
  )
  .addFlag("safe", "Use Safe multisig for setPeer and setEnforcedOptions transactions")
  .setAction(async (args: TaskArgs, hre: HardhatRuntimeEnvironment) => {
    try {
      const chains = CLIUtils.parseChains(args.chains);
      const useSafe = args.safe || false;

      await CLIUtils.printTaskHeader("LayerZero Peer & Enforced Options Setup", chains, useSafe, hre, {
        "Gas Limit": "300000 (fixed)"
      });

      const manager = new LayerZeroPeerOptionsManager(hre, useSafe);

      // Load chain configurations
      const metadata = manager.loadMetadata();
      manager.buildChainConfigs(metadata, false);

      // Show configuration summary
      manager.outputSimpleChainSummary();

      // Set peers and enforced options
      await manager.setPeersAndOptions(chains);
    } catch (error) {
      CLIUtils.handleTaskError(error, "Peer and enforced options setup");
    }
  });

export { LayerZeroPeerOptionsManager };

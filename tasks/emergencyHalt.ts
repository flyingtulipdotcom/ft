import { FT } from "../typechain-types";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { MetaTransactionData, OperationType } from "@safe-global/types-kit";

import { SafeManager, SafeAddressType } from "./SafeManager";
import { ChainConfig, TaskArgs, NUM_BLOCKS_TO_WAIT } from "./types";
import { LayerZeroBaseManager, CLIUtils } from "./BaseManager";

/**
 * Emergency halt for a single chain.
 *
 * IMPORTANT:
 * - `pause` alone does NOT stop LayerZero inbound credits (endpoint is exempt in FT._update).
 * - This task pauses (if needed) AND unsets peers for the specified remote chains by setting them to bytes32(0).
 * - Run this task on EACH chain you want to freeze (e.g., run once on ethereum, once on base, etc).
 */
class LayerZeroEmergencyHaltManager extends LayerZeroBaseManager {
  private useSafe: boolean = false;
  private safeManager?: SafeManager;

  constructor(hre: HardhatRuntimeEnvironment, useSafe: boolean = false) {
    super(hre);
    this.useSafe = useSafe;
    if (this.useSafe) {
      this.safeManager = new SafeManager(this.hre, SafeAddressType.OWNER);
    }
  }

  private async buildUnsetPeerTx(ft: FT, destConfig: ChainConfig): Promise<MetaTransactionData> {
    const ftAddress = await ft.getAddress();
    const data = ft.interface.encodeFunctionData("setPeer", [destConfig.eid, this.hre.ethers.ZeroHash]);

    return {
      to: ftAddress,
      value: "0",
      data,
      operation: OperationType.Call,
    };
  }

  async emergencyHalt(chainKeys: string[]): Promise<void> {
    console.log("Starting emergency halt (pause + unset peers)...");
    console.log(`Chains to process: ${chainKeys.join(", ")}`);

    // Validate all chains have required configuration
    this.validateChains(chainKeys);

    // Get and validate source chain
    const { sourceChain } = await this.validateSourceChain();
    console.log(`Source chain: ${sourceChain}`);

    // Initialize Safe if needed
    if (this.useSafe && this.safeManager) {
      await this.safeManager.initialize();
    }

    const ft = (await this.getFTContract()) as unknown as FT;
    const ftAddress = await ft.getAddress();

    const targetChains = chainKeys.filter((c) => c !== sourceChain);
    console.log(`Target peer chains to unset: ${targetChains.join(", ") || "(none)"}`);

    const txs: MetaTransactionData[] = [];

    // Pause iff not already paused (double pause reverts).
    const paused = await ft.paused();
    if (!paused) {
      const pauseData = ft.interface.encodeFunctionData("setPaused", [true]);
      txs.push({
        to: ftAddress,
        value: "0",
        data: pauseData,
        operation: OperationType.Call,
      });
    }

    for (const targetChain of targetChains) {
      const destConfig = this.getChainConfig(targetChain);
      txs.push(await this.buildUnsetPeerTx(ft, destConfig));
    }

    if (txs.length === 0) {
      console.log("Nothing to do.");
      return;
    }

    const description = `Emergency halt for ${sourceChain}: pause=${!paused} unsetPeers=${targetChains.length} (${targetChains.join(
      ", "
    )})`;

    if (this.useSafe && this.safeManager) {
      await this.safeManager.proposeSafeBatchTransaction(txs, description);
      console.log(`\nSuccessfully proposed 1 batch transaction containing ${txs.length} operations to Safe multisig!`);
      console.log(`Please review and sign the transaction in the Safe UI.`);
    } else {
      for (const txData of txs) {
        const tx = await (await this.hre.ethers.provider.getSigner()).sendTransaction({
          to: txData.to,
          data: txData.data,
          value: txData.value,
        });
        await tx.wait(NUM_BLOCKS_TO_WAIT);
      }
      console.log(`\nEmergency halt executed successfully (${txs.length} operation(s)).`);
    }
  }
}

task("ft:emergency-halt", "Pause (if needed) and unset peers (bytes32(0)) for specified remote chains")
  .addParam(
    "chains",
    "Comma-separated list of chain keys to unset peers for (e.g., 'ethereum,avalanche,base,bsc,sonic'). Include the active chain; it will be skipped.",
    undefined,
    types.string
  )
  .addFlag("safe", "Use Safe multisig (owner) for pause + setPeer transactions")
  .setAction(async (args: TaskArgs, hre: HardhatRuntimeEnvironment) => {
    try {
      const chains = CLIUtils.parseChains(args.chains);
      const useSafe = args.safe || false;

      await CLIUtils.printTaskHeader("Emergency Halt", chains, useSafe, hre);

      const manager = new LayerZeroEmergencyHaltManager(hre, useSafe);

      // Load chain configurations
      const metadata = manager.loadMetadata();
      manager.buildChainConfigs(metadata, false);

      // Show configuration summary
      manager.outputSimpleChainSummary();

      await manager.emergencyHalt(chains);
    } catch (error) {
      CLIUtils.handleTaskError(error, "Emergency halt");
    }
  });

export { LayerZeroEmergencyHaltManager };


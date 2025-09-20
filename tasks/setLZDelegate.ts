import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { FT } from "../typechain-types";

interface MasterArgs {
  account: string;
}

task("lz:ft:set-delegate", "Configures FT tokens cross‐chain from EVM chains")
  .addParam("account", "Delegate address (20-byte hex for EVM)", undefined, types.string)
  .setAction(async (args: MasterArgs, hre: HardhatRuntimeEnvironment) => {
    const [owner] = await hre.ethers.getSigners();

    const chainId = await hre.getChainId();
    console.log(`Setting the delegate for the FT using ${owner.address} on chain: ${chainId}`);
    const account = args.account;

    const ft = (await hre.ethers.getContractAt("FT", (await hre.deployments.get("FT")).address)) as unknown as FT;
    const tx = await ft.setDelegate(account);
    await tx.wait();
  });

import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import { FT, MessagingFeeStruct, SendParamStruct } from "../typechain-types/contracts/FT";
import { ChainType, endpointIdToChainType, endpointIdToNetwork } from "@layerzerolabs/lz-definitions";

interface MasterArgs {
  dstEid: number;
  amount: string;
  to: string;
}

task("lz:ft:send", "Sends FT tokens cross‐chain from EVM chains")
  .addParam("dstEid", "Destination endpoint ID", undefined, types.int)
  .addParam("amount", "Amount to send in wei", undefined, types.string)
  .addParam("to", "Recipient address (20-byte hex for EVM)", undefined, types.string)
  .setAction(async (args: MasterArgs, hre: HardhatRuntimeEnvironment) => {
    const srcEid = (hre.config.networks[hre.network.name] as any).eid;

    const chainType = endpointIdToChainType(srcEid);

    // Only support EVM chains in this example
    if (chainType === ChainType.EVM) {
      const ft = await hre.ethers.getContractAt("FT", (await hre.deployments.get("FT")).address) as unknown as FT;
      console.log(`FT address: ${await ft.getAddress()}`);

      // Defining extra message execution options for the send operation
      const options = Options.newOptions().addExecutorLzReceiveOption(200_000, 0).toHex().toString();

      const sendParams: SendParamStruct = {
        dstEid: args.dstEid,
        to: hre.ethers.zeroPadValue(args.to, 32),
        amountLD: args.amount,
        minAmountLD: args.amount,
        extraOptions: options,
        composeMsg: "0x",
        oftCmd: "0x"
      };

      const [owner] = await hre.ethers.getSigners();
      console.log(`FT balance of ${await owner.getAddress()}: ${await ft.balanceOf(owner)}`);

      // Fetching the native fee for the token send operation
      const [sendFee] = await ft.quoteSend(sendParams, false);

      console.log(`Send fee: ${hre.ethers.formatEther(sendFee)} ETH`);

      // Executing the send operation from contract
      const feeStruct: MessagingFeeStruct = { nativeFee: sendFee, lzTokenFee: 0 };
      const tx = await ft.send(sendParams, feeStruct, owner, { value: sendFee });
      const receipt = await tx.wait();
      console.log(`hash: ${receipt?.hash}`);
    } else {
      throw new Error(
        `The chain type ${chainType} is not supported in this OFT example. Only EVM chains are supported.`
      );
    }

    console.log(
      `Successfully sent ${args.amount} tokens from ${endpointIdToNetwork(srcEid)} to ${endpointIdToNetwork(args.dstEid)}`
    );
  });

import { Options } from "@layerzerolabs/lz-v2-utilities";
import { FT_TOKEN_ADDRESSES } from "../utils/constants";
import {
  DVN_ADDRESSES,
  ENDPOINT_V2_ADDRESSES,
  EXECUTOR_ADDRESSES,
  RECIEVE_LIBRARY_ADDRESSES,
  SEND_LIBRARY_ADDRESSES
} from "../utils/constants";
import { ILayerZeroEndpointV2 } from "../typechain-types";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

interface MasterArgs {
  dstEid: number;
  sendConfirmations: number;
  receiveConfirmations: number;
}

// Enable bridging by adding other chains
task("lz:ft:wire", "Set allowed peers for cross‐chain communication from EVM chains")
  .addParam("dstEid", "Destination endpoint ID", undefined, types.int)
  .addParam(
    "sendConfirmations",
    "Number of confirmations to wait before the transaction is sent cross-chain",
    undefined,
    types.int
  )
  .addParam(
    "receiveConfirmations",
    "Number of confirmations to wait before the transaction is executed cross-chain",
    undefined,
    types.int
  )
  .setAction(async (args: MasterArgs, hre: HardhatRuntimeEnvironment) => {
    const [owner] = await hre.ethers.getSigners();

    const chainId = await hre.getChainId();
    console.log(`Set config from one chain to another using ${owner.address} on chain: ${chainId}`);
    const dstEid = args.dstEid;

    const endpointAddress = ENDPOINT_V2_ADDRESSES[chainId];
    const executorAddress = EXECUTOR_ADDRESSES[chainId];
    const endpointContract = (await hre.ethers.getContractAt(
      "ILayerZeroEndpointV2",
      endpointAddress
    )) as unknown as ILayerZeroEndpointV2;
    const sendLibAddress = SEND_LIBRARY_ADDRESSES[chainId];
    const receiveLibAddress = RECIEVE_LIBRARY_ADDRESSES[chainId];
    const dvns = DVN_ADDRESSES[chainId];

    const ft = await hre.ethers.getContractAt("FT", (await hre.deployments.get("FT")).address);
    console.log(`FT address: ${await ft.getAddress()}`);

    const dstTokenAddress = FT_TOKEN_ADDRESSES[dstEid];
    console.log(`Destination FT address: ${dstTokenAddress}`);
    if (!dstTokenAddress) {
      throw new Error(`No FT token address configured for endpoint ID ${dstEid}`);
    }

    const sendConfig = [
      {
        eid: dstEid,
        configType: 1, // send
        config: hre.ethers.AbiCoder.defaultAbiCoder().encode(
          ["tuple(uint32 maxMessageSize, address executor)"],
          [
            {
              maxMessageSize: 10000,
              executor: executorAddress
            }
          ]
        )
      },
      {
        eid: dstEid,
        configType: 2,
        config: hre.ethers.AbiCoder.defaultAbiCoder().encode(
          [
            "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)"
          ],
          [
            {
              confirmations: args.sendConfirmations,
              requiredDVNCount: dvns.length,
              optionalDVNCount: 0,
              optionalDVNThreshold: 0,
              requiredDVNs: dvns,
              optionalDVNs: []
            }
          ]
        )
      }
    ];

    let tx = await endpointContract.setConfig(ft, sendLibAddress, sendConfig);
    await tx.wait();
    console.log("Set send config");

    const receiveConfig = [
      {
        eid: dstEid,
        configType: 2, // receive
        config: hre.ethers.AbiCoder.defaultAbiCoder().encode(
          [
            "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)"
          ],
          [
            {
              confirmations: args.receiveConfirmations,
              requiredDVNCount: dvns.length,
              optionalDVNCount: 0,
              optionalDVNThreshold: 0,
              requiredDVNs: dvns,
              optionalDVNs: []
            }
          ]
        )
      }
    ];

    tx = await endpointContract.setConfig(ft, receiveLibAddress, receiveConfig);
    await tx.wait();
    console.log("Set receive config");

    console.log(
      `Setting token peer to dstEid: ${args.dstEid} `
    );

    tx = await ft.setPeer(dstEid, hre.ethers.zeroPadValue(dstTokenAddress, 32));
    await tx.wait();
    console.log("Set peer destination");

    const options = Options.newOptions().addExecutorLzReceiveOption(300_000, 0).toHex().toString();
    const enforcedOptions = [
      {
        eid: dstEid,
        msgType: 2, // RECEIVE
        options
      }
    ];
    tx = await ft.setEnforcedOptions(enforcedOptions);
    await tx.wait();
    console.log("Set enforced options");
  });

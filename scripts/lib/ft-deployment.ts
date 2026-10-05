import {
  AbiCoder, Contract, Interface, JsonRpcProvider, Provider, concat, getAddress,
  getCreateAddress, keccak256, parseEther, toQuantity,
} from "ethers";
import productionArtifact from "../../deployments/sonic/FT.json";
import { assertLocalAnvilFork } from "./rollout-fork";

export const FT_ADDRESS = "0x5DD1A7A369e8273371d2DBf9d83356057088082c";
export const FT_DEPLOYER = "0x44820497f8FE95A258A9522f0De2c04ab2bC3da3";
export const FT_DELEGATE = "0x22246a9183cE2CE6e2c2a9973F94aEA91435017C";
export const FT_OWNER = "0x1118e1c057211306a40A4d7006C040dbfE1370Cb";
export const PINNED_CREATION_HASH = "0x4831f2deca983f6bd018ca3ba43d98317ad8855cfbdfbe98a74366c542ffb3d3";
const RUNTIME_HASHES: Record<string, string> = {
  "0x6f475642a6e85809b1c36fa62763669b1b48dd5b": "0x39657e228af4878f6158ab11671aa117c30fbd89262ab0f16ed3355391af0c7a",
  "0x1a44076050125825900e736c501f859c50fe728c": "0x8062c2d6646f1c459825821c9d1e582052bd2e7089367d7087545cf6bab8f4c3",
};

export interface PinnedFTConfig {
  chainId: number;
  endpoint: string;
  eid?: number;
  delegate?: string;
  configurator?: string;
}

/** Construct exactly the production creation bytes, without reading local build artifacts. */
export function buildPinnedFTDeployment(config: PinnedFTConfig) {
  if (!Number.isSafeInteger(config.chainId) || config.chainId <= 0) throw new Error("Invalid chain ID");
  const bytecodeHash = keccak256(productionArtifact.bytecode);
  if (bytecodeHash !== PINNED_CREATION_HASH) throw new Error("Pinned FT production bytecode hash changed");
  const endpoint = getAddress(config.endpoint);
  const runtimeExpectedHash = RUNTIME_HASHES[endpoint.toLowerCase()];
  if (!runtimeExpectedHash) throw new Error(`No independently verified FT runtime hash for endpoint ${endpoint}`);
  const args = ["Flying Tulip", "FT", endpoint, getAddress(config.delegate || FT_DELEGATE),
    getAddress(config.configurator || FT_DELEGATE), 146] as const;
  const types = ["string", "string", "address", "address", "address", "uint256"];
  const abi = productionArtifact.abi;
  if (new Interface(abi).deploy.inputs.map((input) => input.type).join() !== types.join()) {
    throw new Error("Pinned FT constructor ABI changed");
  }
  const data = concat([productionArtifact.bytecode, AbiCoder.defaultAbiCoder().encode(types, args)]);
  const expectedAddress = getCreateAddress({ from: FT_DEPLOYER, nonce: 0 });
  if (expectedAddress !== FT_ADDRESS) throw new Error("FT CREATE address invariant failed");
  return {
    abi, bytecode: productionArtifact.bytecode, deployedBytecode: productionArtifact.deployedBytecode, args, data, expectedAddress,
    nonce: 0, from: FT_DEPLOYER, chainId: config.chainId, value: "0",
    bytecodeHash, initCodeHash: keccak256(data), runtimeExpectedHash,
    artifact: "deployments/sonic/FT.json",
  };
}

/** Read-only guard shared by the real deployment entrypoint and the local-fork rehearsal. */
export async function assertPinnedDeploymentReady(
  provider: Provider & { send(method: string, params: any[]): Promise<any> }, config: PinnedFTConfig, signerAddress: string = FT_DEPLOYER,
) {
  const plan = buildPinnedFTDeployment(config);
  if (getAddress(signerAddress) !== FT_DEPLOYER) throw new Error(`FT must be deployed by ${FT_DEPLOYER}`);
  // Raw RPC avoids a cached nonce after another local transaction in a rehearsal.
  const [chainId, latest, pending, existingCode, deployerCode, endpointCode] = await Promise.all([
    provider.send("eth_chainId", []),
    provider.send("eth_getTransactionCount", [FT_DEPLOYER, "latest"]),
    provider.send("eth_getTransactionCount", [FT_DEPLOYER, "pending"]),
    provider.send("eth_getCode", [FT_ADDRESS, "latest"]),
    provider.send("eth_getCode", [FT_DEPLOYER, "latest"]),
    provider.send("eth_getCode", [config.endpoint, "latest"]),
  ]);
  if (Number(chainId) !== config.chainId) throw new Error(`RPC chain ${Number(chainId)} does not match ${config.chainId}`);
  if (BigInt(latest) !== 0n || BigInt(pending) !== 0n) {
    throw new Error(`FT deployer must have confirmed AND pending nonce 0; found ${BigInt(latest)}/${BigInt(pending)}`);
  }
  if (existingCode !== "0x") throw new Error(`FT address ${FT_ADDRESS} is already deployed`);
  if (deployerCode !== "0x") throw new Error("FT deployer is not an ordinary EOA");
  if (endpointCode === "0x") throw new Error("Configured LayerZero endpoint has no code");
  const endpoint = new Contract(config.endpoint, ["function eid() view returns(uint32)"], provider);
  const eid = Number(await endpoint.eid());
  if (config.eid !== undefined && eid !== config.eid) throw new Error(`Endpoint EID ${eid} does not match ${config.eid}`);
  return { plan, chainId: Number(chainId), latestNonce: 0, pendingNonce: 0, endpointEid: eid };
}

/** Impersonation and funding are restricted to an explicitly identified local Anvil fork. */
export async function deployPinnedFT(provider: JsonRpcProvider, config: PinnedFTConfig) {
  await assertLocalAnvilFork(provider, config.chainId);
  const { plan, endpointEid } = await assertPinnedDeploymentReady(provider, config);
  await provider.send("anvil_setBalance", [FT_DEPLOYER, toQuantity(parseEther("1000"))]);
  await provider.send("anvil_impersonateAccount", [FT_DEPLOYER]);
  try {
    const signer = await provider.getSigner(FT_DEPLOYER);
    const estimate = await provider.estimateGas({ from: FT_DEPLOYER, data: plan.data, value: 0n });
    const transaction = await signer.sendTransaction({ data: plan.data, nonce: 0, value: 0n, gasLimit: estimate * 12n / 10n });
    const receipt = await transaction.wait();
    if (!receipt || receipt.status !== 1 || receipt.contractAddress !== FT_ADDRESS) {
      throw new Error("Pinned CREATE deployment failed or produced the wrong address");
    }
    const runtime = await provider.send("eth_getCode", [FT_ADDRESS, "latest"]);
    const runtimeHash = keccak256(runtime);
    if (runtimeHash !== plan.runtimeExpectedHash) throw new Error(`FT runtime hash mismatch: ${runtimeHash}`);
    const ft = new Contract(FT_ADDRESS, plan.abi, provider);
    const endpoint = new Contract(config.endpoint, ["function delegates(address) view returns(address)"], provider);
    const [name, symbol, decimals, totalSupply, paused, owner, configurator, actualEndpoint, delegate, domain] = await Promise.all([
      ft.name(), ft.symbol(), ft.decimals(), ft.totalSupply(), ft.paused(), ft.owner(), ft.configurator(),
      ft.endpoint(), endpoint.delegates(FT_ADDRESS), ft.eip712Domain(),
    ]);
    const expectedSupply = config.chainId === 146 ? parseEther("10000000000") : 0n;
    if (name !== "Flying Tulip" || symbol !== "FT" || decimals !== 18n || totalSupply !== expectedSupply || !paused ||
        owner !== plan.args[3] || configurator !== plan.args[4] || actualEndpoint !== plan.args[2] || delegate !== plan.args[3] ||
        domain[3] !== BigInt(config.chainId) || domain[4] !== FT_ADDRESS) {
      throw new Error("Pinned FT deployment state verification failed");
    }
    return {
      address: FT_ADDRESS, from: FT_DEPLOYER, nonce: 0, transactionHash: transaction.hash,
      blockNumber: receipt.blockNumber, gasEstimated: estimate.toString(), gasUsed: receipt.gasUsed.toString(),
      creationBytecodeHash: plan.bytecodeHash, initCodeHash: plan.initCodeHash, runtimeHash,
      endpointEid, state: { name, symbol, decimals: Number(decimals), totalSupply: totalSupply.toString(),
        paused, owner, configurator, endpoint: actualEndpoint, delegate,
        eip712ChainId: Number(domain[3]), eip712VerifyingContract: domain[4] },
    };
  } finally {
    await provider.send("anvil_stopImpersonatingAccount", [FT_DEPLOYER]);
  }
}

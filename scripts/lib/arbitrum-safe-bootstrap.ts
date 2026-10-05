import {
  AbiCoder, Contract, Interface, JsonRpcProvider, ZeroAddress, concat, getAddress,
  getCreate2Address, keccak256, parseEther, solidityPacked, toQuantity,
} from "ethers";
import { FT_DEPLOYER, FT_DELEGATE, FT_OWNER } from "./ft-deployment";
import { assertLocalAnvilFork, executeSafeBuilderBatch, SafeBuilderBatch } from "./rollout-fork";

const FACTORY = "0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC";
const SINGLETON = "0xfb1bffC9d739B8D520DaF37dF666da4C687191EA";
const FALLBACK = "0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4";
const BOOTSTRAP_SENDER = "0x3c42749709BF354B3aE0Db29Fd2dd88089b21B4E";
const ADDITIONAL_OWNER = "0xB7B543337539219A5a1326aCB71dBa8Bba408bc8";
const OWNERS = [BOOTSTRAP_SENDER, "0xf9E5aF16243041cE3141284D225CAfC0fC749a10",
  "0x09E2B49280f1879172b2C3345d08896921707881", "0xD0CA88388d1732594D611535314e9B6745396f5A"];
const HASHES = {
  factory: "0x337d7f54be11b6ed55fef7b667ea5488db53db8320a05d1146aa4bd169a39a9b",
  singleton: "0x21842597390c4c6e3c1239e434a682b054bd9548eee5e9b1d6a4482731023c0f",
  fallbackHandler: "0x03e69f7ce809e81687c69b19a7d7cca45b6d551ffdec73d9bb87178476de1abf",
};
const ORIGINALS = [
  { address: FT_OWNER, owners: OWNERS, threshold: 3,
    saltNonce: "112488744633395248723173799332012111452630483371312680219271362406737339773194",
    transactionHash: "0x133631167cbf30a8c4e344f80e5967c743fe6bb9c1e1e84d4eaf5677bef1054d" },
  { address: FT_DELEGATE, owners: [OWNERS[0], OWNERS[2], OWNERS[3]], threshold: 2,
    saltNonce: "106430251993975978589270074926773519088890969377155645149637629411328918818831",
    transactionHash: "0x61a497aebaa1392ee05e59d4590ddbdbd8442ae1b1adfe4db5d8af7298afc220" },
];
const FACTORY_ABI = [
  "function proxyCreationCode() pure returns(bytes)",
  "function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address proxy)",
];
const SAFE_ABI = [
  "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
  "function getOwners() view returns(address[])", "function getThreshold() view returns(uint256)",
  "function addOwnerWithThreshold(address owner,uint256 threshold)",
];
const safeInterface = new Interface(SAFE_ABI);
const factoryInterface = new Interface(FACTORY_ABI);

type OwnerState = { owners: string[]; threshold: number };
type OwnerSnapshot = { chainId: number; blockNumber: number; safes: Record<string, OwnerState> };
type BootstrapTransaction = { to: string; value: string; data: string; safeAddress: string };
export interface SafeBootstrapPlan {
  chainId: 42161;
  status: string;
  targetPolicy: string;
  bootstrapSender: string;
  arbitrumBlockNumber: number;
  ethereumSnapshot: OwnerSnapshot;
  robinhoodSnapshot: OwnerSnapshot;
  infrastructure: {
    factory: string; singleton: string; fallbackHandler: string; proxyCreationCode: string;
    codeHashes: typeof HASHES;
  };
  safes: Array<{
    address: string; setupData: string; saltNonce: string; originalOwners: string[]; originalThreshold: number;
    targetOwners: string[]; targetThreshold: number; computedAddress: string; staticCallAddress: string;
    sourceUrl: string; originalEthereumTransaction: string;
  }>;
  bootstrapTransactions: BootstrapTransaction[];
  rotationBatches: SafeBuilderBatch[];
  provenance: { generatedAt: string; ethereumRpc: string; arbitrumRpc: string; robinhoodRpc: string };
}

function sameOwners(actual: string[], expected: string[]) {
  const normalize = (values: string[]) => values.map((value) => getAddress(value).toLowerCase()).sort().join();
  return normalize(actual) === normalize(expected);
}

function originalSetup(original: typeof ORIGINALS[number]) {
  return safeInterface.encodeFunctionData("setup", [original.owners, original.threshold,
    ZeroAddress, "0x", FALLBACK, ZeroAddress, 0, ZeroAddress]);
}

function deriveAddress(proxyCreationCode: string, setupData: string, saltNonce: string) {
  const salt = keccak256(solidityPacked(["bytes32", "uint256"], [keccak256(setupData), saltNonce]));
  const init = concat([proxyCreationCode, AbiCoder.defaultAbiCoder().encode(["address"], [SINGLETON])]);
  return getCreate2Address(FACTORY, salt, keccak256(init));
}

async function ownersSnapshot(provider: JsonRpcProvider, chainId: number): Promise<OwnerSnapshot> {
  const blockNumber = await provider.getBlockNumber();
  const safes: Record<string, OwnerState> = {};
  for (const original of ORIGINALS) {
    const safe = new Contract(original.address, SAFE_ABI, provider);
    const [owners, threshold] = await Promise.all([
      safe.getOwners({ blockTag: blockNumber }), safe.getThreshold({ blockTag: blockNumber }),
    ]);
    safes[original.address] = { owners: [...owners], threshold: Number(threshold) };
  }
  return { chainId, blockNumber, safes };
}

function rotationBatch(address: string, original: OwnerState, target: OwnerState): SafeBuilderBatch {
  if (target.threshold !== 3 || target.owners.length !== 5 || !sameOwners(target.owners, [ADDITIONAL_OWNER, ...OWNERS])) {
    throw new Error("Ethereum Safe membership changed from the approved three-of-five target");
  }
  const missing = target.owners.filter((owner) => !original.owners.some((value) => value.toLowerCase() === owner.toLowerCase())).reverse();
  if (!missing.length) throw new Error("Expected canonical Safe bootstrap to require membership additions");
  return {
    version: "1.0", chainId: "42161", createdAt: Date.now(),
    meta: { name: "Match the captured Ethereum FT Safe owners", createdFromSafeAddress: address,
      createdFromOwnerAddress: "", txBuilderVersion: "1.18.0",
      description: "Execute after canonical Safe creation and before FT configuration. Add the missing Ethereum owners and set the threshold to 3 of 5." },
    transactions: missing.map((owner, index) => ({
      to: address, value: "0", data: safeInterface.encodeFunctionData("addOwnerWithThreshold",
        [owner, index === missing.length - 1 ? target.threshold : original.threshold]),
      contractMethod: null, contractInputsValues: null,
    })),
  };
}

/** Read-only provenance and exact calldata; never creates a Safe or submits to a transaction service. */
export async function buildSafeBootstrapPlan(): Promise<SafeBootstrapPlan> {
  const rpc = { ethereum: "https://ethereum-rpc.publicnode.com", arbitrum: "https://arb1.arbitrum.io/rpc", robinhood: "https://rpc.mainnet.chain.robinhood.com" };
  const ethereum = new JsonRpcProvider(rpc.ethereum, 1, { staticNetwork: true });
  const arbitrum = new JsonRpcProvider(rpc.arbitrum, 42161, { staticNetwork: true });
  const robinhood = new JsonRpcProvider(rpc.robinhood, 4663, { staticNetwork: true });
  try {
    const actualChainIds = await Promise.all([ethereum, arbitrum, robinhood].map(provider => provider.send("eth_chainId", [])));
    if (actualChainIds.map(Number).join(",") !== "1,42161,4663") throw new Error("Safe provenance RPC chain ID mismatch");
    const [ethereumSnapshot, robinhoodSnapshot, arbitrumBlockNumber] = await Promise.all([
      ownersSnapshot(ethereum, 1), ownersSnapshot(robinhood, 4663), arbitrum.getBlockNumber(),
    ]);
    for (const [label, address] of [["factory", FACTORY], ["singleton", SINGLETON], ["fallbackHandler", FALLBACK]] as const) {
      const [ethCode, arbCode] = await Promise.all([
        ethereum.getCode(address, ethereumSnapshot.blockNumber), arbitrum.getCode(address, arbitrumBlockNumber),
      ]);
      if (keccak256(ethCode) !== HASHES[label] || keccak256(arbCode) !== HASHES[label]) {
        throw new Error(`Safe ${label} bytecode does not match the canonical Ethereum/Arbitrum deployment`);
      }
    }
    const factory = new Contract(FACTORY, FACTORY_ABI, arbitrum);
    const proxyCreationCode = await factory.proxyCreationCode({ blockTag: arbitrumBlockNumber });
    const plan: SafeBootstrapPlan = {
      chainId: 42161, status: "Prepared proposal; not broadcast", targetPolicy: "Match captured Ethereum Safe owners: both three of five",
      bootstrapSender: BOOTSTRAP_SENDER, arbitrumBlockNumber, ethereumSnapshot, robinhoodSnapshot,
      infrastructure: { factory: FACTORY, singleton: SINGLETON, fallbackHandler: FALLBACK, proxyCreationCode, codeHashes: HASHES },
      safes: [], bootstrapTransactions: [], rotationBatches: [],
      provenance: { generatedAt: new Date().toISOString(), ethereumRpc: rpc.ethereum, arbitrumRpc: rpc.arbitrum, robinhoodRpc: rpc.robinhood },
    };
    for (const original of ORIGINALS) {
      const sourceUrl = `https://safe-transaction-mainnet.safe.global/api/v1/safes/${original.address}/creation/`;
      const response = await fetch(sourceUrl, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`Safe creation provenance unavailable: HTTP ${response.status}`);
      const record = await response.json() as Record<string, any>;
      const setupData = originalSetup(original);
      if (record.setupData !== setupData || record.saltNonce !== original.saltNonce ||
          record.transactionHash !== original.transactionHash || getAddress(record.factoryAddress) !== FACTORY || getAddress(record.masterCopy) !== SINGLETON) {
        throw new Error(`Original Safe creation evidence changed for ${original.address}`);
      }
      if (await arbitrum.getCode(original.address, arbitrumBlockNumber) !== "0x") throw new Error(`Safe ${original.address} already exists on Arbitrum; refresh the rollout`);
      const computedAddress = deriveAddress(proxyCreationCode, setupData, original.saltNonce);
      const staticCallAddress = await factory.createProxyWithNonce.staticCall(SINGLETON, setupData, original.saltNonce, { blockTag: arbitrumBlockNumber });
      if (computedAddress !== original.address || staticCallAddress !== original.address) throw new Error("Canonical Safe CREATE2 address mismatch");
      const target = ethereumSnapshot.safes[original.address];
      plan.safes.push({ address: original.address, setupData, saltNonce: original.saltNonce,
        originalOwners: original.owners, originalThreshold: original.threshold,
        targetOwners: target.owners, targetThreshold: target.threshold, computedAddress, staticCallAddress,
        sourceUrl, originalEthereumTransaction: original.transactionHash });
      plan.bootstrapTransactions.push({ to: FACTORY, value: "0", safeAddress: original.address,
        data: factoryInterface.encodeFunctionData("createProxyWithNonce", [SINGLETON, setupData, original.saltNonce]) });
      plan.rotationBatches.push(rotationBatch(original.address, { owners: original.owners, threshold: original.threshold }, target));
    }
    return plan;
  } finally {
    ethereum.destroy(); arbitrum.destroy(); robinhood.destroy();
  }
}

/** Rehearse only the persisted, verified plan on a local fork; preserve FT deployer's nonce. */
export async function simulateSafeBootstrap(provider: JsonRpcProvider, mode: "original" | "ethereum", plan: SafeBootstrapPlan) {
  await assertLocalAnvilFork(provider, 42161);
  if (plan.chainId !== 42161 || plan.bootstrapSender !== BOOTSTRAP_SENDER || plan.safes.length !== 2 ||
      plan.bootstrapTransactions.length !== 2 || plan.rotationBatches.length !== 2) throw new Error("Invalid persisted Safe bootstrap plan");
  for (const [label, address] of [["factory", FACTORY], ["singleton", SINGLETON], ["fallbackHandler", FALLBACK]] as const) {
    if (keccak256(await provider.getCode(address)) !== HASHES[label]) throw new Error(`Fork Safe ${label} code hash mismatch`);
  }
  const factory = new Contract(FACTORY, FACTORY_ABI, provider);
  const actualProxyCreationCode = await factory.proxyCreationCode();
  if (actualProxyCreationCode !== plan.infrastructure.proxyCreationCode) throw new Error("Fork Safe proxy creation bytecode differs from the persisted plan");
  for (let index = 0; index < ORIGINALS.length; index++) {
    const original = ORIGINALS[index], item = plan.safes[index], tx = plan.bootstrapTransactions[index];
    const expectedData = factoryInterface.encodeFunctionData("createProxyWithNonce", [SINGLETON, originalSetup(original), original.saltNonce]);
    if (item.address !== original.address || item.setupData !== originalSetup(original) || item.saltNonce !== original.saltNonce ||
        tx.to !== FACTORY || tx.value !== "0" || tx.safeAddress !== original.address || tx.data !== expectedData ||
        deriveAddress(actualProxyCreationCode, item.setupData, item.saltNonce) !== original.address) {
      throw new Error("Persisted Safe bootstrap calldata differs from the canonical original setup");
    }
    const expectedRotation = rotationBatch(original.address, { owners: original.owners, threshold: original.threshold },
      plan.ethereumSnapshot.safes[original.address]);
    if (JSON.stringify(plan.rotationBatches[index].transactions) !== JSON.stringify(expectedRotation.transactions) ||
        plan.rotationBatches[index].meta.createdFromSafeAddress !== original.address || Number(plan.rotationBatches[index].chainId) !== 42161) {
      throw new Error("Persisted Safe rotation calldata differs from the captured Ethereum target");
    }
    if (await provider.getCode(original.address) !== "0x") throw new Error(`Safe ${original.address} already exists on this fork`);
  }
  const ftNonceBefore = await provider.send("eth_getTransactionCount", [FT_DEPLOYER, "latest"]);
  await provider.send("anvil_setBalance", [BOOTSTRAP_SENDER, toQuantity(parseEther("1000"))]);
  await provider.send("anvil_impersonateAccount", [BOOTSTRAP_SENDER]);
  const creations = [];
  try {
    const signer = await provider.getSigner(BOOTSTRAP_SENDER);
    for (const call of plan.bootstrapTransactions) {
      const tx = await signer.sendTransaction({ to: call.to, data: call.data, value: BigInt(call.value) });
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1 || await provider.getCode(call.safeAddress) === "0x") throw new Error("Safe bootstrap transaction failed");
      const safe = new Contract(call.safeAddress, SAFE_ABI, provider);
      const original = ORIGINALS.find((item) => item.address === call.safeAddress)!;
      const [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
      if (!sameOwners([...owners], original.owners) || Number(threshold) !== original.threshold) throw new Error("Canonical Safe initial ownership mismatch");
      creations.push({ safeAddress: call.safeAddress, from: BOOTSTRAP_SENDER, transactionHash: tx.hash,
        gasUsed: receipt.gasUsed.toString(), blockNumber: receipt.blockNumber, owners: [...owners], threshold: Number(threshold) });
    }
  } finally {
    await provider.send("anvil_stopImpersonatingAccount", [BOOTSTRAP_SENDER]);
  }
  const rotations = [];
  if (mode === "ethereum") for (const batch of plan.rotationBatches) rotations.push(await executeSafeBuilderBatch(provider, batch));
  const finalSafes = [];
  for (const original of ORIGINALS) {
    const safe = new Contract(original.address, SAFE_ABI, provider);
    const [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
    const target = mode === "ethereum" ? plan.ethereumSnapshot.safes[original.address] : original;
    if (!sameOwners([...owners], target.owners) || Number(threshold) !== target.threshold) throw new Error("Final Arbitrum Safe membership differs from the selected target");
    finalSafes.push({ address: original.address, owners: [...owners], threshold: Number(threshold) });
  }
  const ftNonceAfter = await provider.send("eth_getTransactionCount", [FT_DEPLOYER, "latest"]);
  if (ftNonceAfter !== ftNonceBefore) throw new Error("Safe bootstrap unexpectedly consumed the FT deployment account nonce");
  return { mode, creations, rotations, finalSafes, ftDeployerNonceBefore: ftNonceBefore, ftDeployerNonceAfter: ftNonceAfter,
    authorization: "Local Anvil only; original-owner impersonation for CREATE2 and threshold-approved Safe rotations; no live transactions" };
}

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
const PROXY_CODE_HASH = "0xb89c1b3bdf2cf8827818646bce9a8f6e372885f8c55e5c07acbd307cb133b000";
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
export type ExistingSafeState = { deployed: false } | {
  deployed: true; owners: string[]; threshold: number; proxyCodeHash: string; singleton: string;
};
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
    targetOwners: string[]; targetThreshold: number; computedAddress: string; staticCallAddress: string | null;
    existingState: ExistingSafeState;
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

function rotationBatch(address: string, current: OwnerState, target: OwnerState): SafeBuilderBatch | null {
  if (target.threshold !== 3 || target.owners.length !== 5 || !sameOwners(target.owners, [ADDITIONAL_OWNER, ...OWNERS])) {
    throw new Error("Ethereum Safe membership changed from the approved three-of-five target");
  }
  const original = ORIGINALS.find((safe) => safe.address === address)!;
  const missing = target.owners.filter((owner) => !original.owners.some((value) => value.toLowerCase() === owner.toLowerCase())).reverse();
  // Accept only the initial state, exact prefixes of the approved additions, or the final target.
  // This permits recovery after a partially executed owner-add sequence without accepting a different policy.
  const states: OwnerState[] = [{ owners: [...original.owners], threshold: original.threshold }];
  for (let index = 0; index < missing.length; index++) {
    states.push({ owners: [missing[index], ...states[index].owners],
      threshold: index === missing.length - 1 ? target.threshold : original.threshold });
  }
  const completed = states.findIndex((state) => state.threshold === current.threshold && sameOwners(state.owners, current.owners));
  if (completed < 0) throw new Error(`Unexpected existing Safe owners or threshold for ${address}`);
  if (completed === missing.length) return null;
  return {
    version: "1.0", chainId: "42161", createdAt: Date.now(),
    meta: { name: "Match the captured Ethereum FT Safe owners", createdFromSafeAddress: address,
      createdFromOwnerAddress: "", txBuilderVersion: "1.18.0",
      description: "Execute after canonical Safe creation and before FT configuration. Add the missing Ethereum owners and set the threshold to 3 of 5." },
    transactions: missing.slice(completed).map((owner, remainingIndex) => ({
      to: address, value: "0", data: safeInterface.encodeFunctionData("addOwnerWithThreshold",
        [owner, completed + remainingIndex === missing.length - 1 ? target.threshold : original.threshold]),
      contractMethod: null, contractInputsValues: null,
    })),
  };
}

function validateExistingSafe(state: ExistingSafeState, address: string) {
  if (state.deployed && (state.proxyCodeHash !== PROXY_CODE_HASH || getAddress(state.singleton) !== SINGLETON)) {
    throw new Error(`Existing Safe ${address} has unexpected proxy bytecode or singleton`);
  }
}

async function readExistingSafe(provider: JsonRpcProvider, address: string, blockTag: number | "latest" = "latest"): Promise<ExistingSafeState> {
  const code = await provider.getCode(address, blockTag);
  if (code === "0x") return { deployed: false };
  const singletonStorage = await provider.getStorage(address, 0, blockTag);
  const singleton = getAddress(`0x${singletonStorage.slice(-40)}`);
  const state = { deployed: true as const, proxyCodeHash: keccak256(code), singleton, owners: [] as string[], threshold: 0 };
  validateExistingSafe(state, address);
  const safe = new Contract(address, SAFE_ABI, provider);
  const [owners, threshold] = await Promise.all([safe.getOwners({ blockTag }), safe.getThreshold({ blockTag })]);
  return { ...state, owners: [...owners], threshold: Number(threshold) };
}

/** Derive only the remaining canonical creates and owner-add calls from captured Safe state. */
export function deriveSafeBootstrapActions(states: Record<string, ExistingSafeState>, targets: Record<string, OwnerState>) {
  const bootstrapTransactions: BootstrapTransaction[] = [];
  const rotationBatches: SafeBuilderBatch[] = [];
  for (const original of ORIGINALS) {
    const state = states[original.address];
    if (!state) throw new Error(`Missing captured Safe state for ${original.address}`);
    validateExistingSafe(state, original.address);
    if (!state.deployed) bootstrapTransactions.push({ to: FACTORY, value: "0", safeAddress: original.address,
      data: factoryInterface.encodeFunctionData("createProxyWithNonce", [SINGLETON, originalSetup(original), original.saltNonce]) });
    const rotation = rotationBatch(original.address, state.deployed ? state : original, targets[original.address]);
    if (rotation) rotationBatches.push(rotation);
  }
  return { bootstrapTransactions, rotationBatches };
}

/** Read-only provenance and exact calldata; never creates a Safe or submits to a transaction service. */
export async function buildSafeBootstrapPlan(options: { arbitrumProvider?: JsonRpcProvider } = {}): Promise<SafeBootstrapPlan> {
  const rpc = { ethereum: "https://ethereum-rpc.publicnode.com", arbitrum: "https://arb1.arbitrum.io/rpc", robinhood: "https://rpc.mainnet.chain.robinhood.com" };
  const ethereum = new JsonRpcProvider(rpc.ethereum, 1, { staticNetwork: true });
  const arbitrum = options.arbitrumProvider || new JsonRpcProvider(rpc.arbitrum, 42161, { staticNetwork: true });
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
      provenance: { generatedAt: new Date().toISOString(), ethereumRpc: rpc.ethereum, arbitrumRpc: arbitrum._getConnection().url, robinhoodRpc: rpc.robinhood },
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
      const existingState = await readExistingSafe(arbitrum, original.address, arbitrumBlockNumber);
      const computedAddress = deriveAddress(proxyCreationCode, setupData, original.saltNonce);
      const staticCallAddress = existingState.deployed ? null
        : await factory.createProxyWithNonce.staticCall(SINGLETON, setupData, original.saltNonce, { blockTag: arbitrumBlockNumber });
      if (computedAddress !== original.address || (staticCallAddress !== null && staticCallAddress !== original.address)) throw new Error("Canonical Safe CREATE2 address mismatch");
      const target = ethereumSnapshot.safes[original.address];
      plan.safes.push({ address: original.address, setupData, saltNonce: original.saltNonce,
        originalOwners: original.owners, originalThreshold: original.threshold,
        targetOwners: target.owners, targetThreshold: target.threshold, computedAddress, staticCallAddress, existingState,
        sourceUrl, originalEthereumTransaction: original.transactionHash });
    }
    const actions = deriveSafeBootstrapActions(Object.fromEntries(plan.safes.map((safe) => [safe.address, safe.existingState])), ethereumSnapshot.safes);
    plan.bootstrapTransactions = actions.bootstrapTransactions;
    plan.rotationBatches = actions.rotationBatches;
    return plan;
  } finally {
    ethereum.destroy(); if (!options.arbitrumProvider) arbitrum.destroy(); robinhood.destroy();
  }
}

/** Rehearse only the persisted, verified plan on a local fork; preserve FT deployer's nonce. */
export async function simulateSafeBootstrap(provider: JsonRpcProvider, mode: "original" | "ethereum", plan: SafeBootstrapPlan) {
  await assertLocalAnvilFork(provider, 42161);
  if (mode !== "original" && mode !== "ethereum") throw new Error("Invalid Safe bootstrap mode");
  if (plan.chainId !== 42161 || plan.bootstrapSender !== BOOTSTRAP_SENDER || plan.safes.length !== 2) throw new Error("Invalid persisted Safe bootstrap plan");
  for (const [label, address] of [["factory", FACTORY], ["singleton", SINGLETON], ["fallbackHandler", FALLBACK]] as const) {
    if (keccak256(await provider.getCode(address)) !== HASHES[label]) throw new Error(`Fork Safe ${label} code hash mismatch`);
  }
  const factory = new Contract(FACTORY, FACTORY_ABI, provider);
  const actualProxyCreationCode = await factory.proxyCreationCode();
  if (actualProxyCreationCode !== plan.infrastructure.proxyCreationCode) throw new Error("Fork Safe proxy creation bytecode differs from the persisted plan");
  for (let index = 0; index < ORIGINALS.length; index++) {
    const original = ORIGINALS[index], item = plan.safes[index];
    if (item.address !== original.address || item.setupData !== originalSetup(original) || item.saltNonce !== original.saltNonce ||
        deriveAddress(actualProxyCreationCode, item.setupData, item.saltNonce) !== original.address) {
      throw new Error("Persisted Safe bootstrap calldata differs from the canonical original setup");
    }
    const actual = await readExistingSafe(provider, original.address);
    const captured = item.existingState;
    if (!captured || actual.deployed !== captured.deployed || (actual.deployed && captured.deployed &&
        (actual.proxyCodeHash !== captured.proxyCodeHash || actual.singleton !== captured.singleton ||
         actual.threshold !== captured.threshold || !sameOwners(actual.owners, captured.owners)))) {
      throw new Error(`Safe ${original.address} changed after the plan was captured; refresh the rollout`);
    }
  }
  const actions = deriveSafeBootstrapActions(Object.fromEntries(plan.safes.map((safe) => [safe.address, safe.existingState])), plan.ethereumSnapshot.safes);
  if (JSON.stringify(plan.bootstrapTransactions) !== JSON.stringify(actions.bootstrapTransactions)) throw new Error("Persisted Safe create transactions differ from the required canonical creates");
  if (plan.rotationBatches.length !== actions.rotationBatches.length || actions.rotationBatches.some((expected, index) => {
    const actual = plan.rotationBatches[index];
    return JSON.stringify(actual.transactions) !== JSON.stringify(expected.transactions) || actual.meta.createdFromSafeAddress !== expected.meta.createdFromSafeAddress || Number(actual.chainId) !== 42161;
  })) throw new Error("Persisted Safe rotation calldata differs from the captured Ethereum target");
  const ftNonceBefore = await provider.send("eth_getTransactionCount", [FT_DEPLOYER, "latest"]);
  const creations = [];
  if (plan.bootstrapTransactions.length) {
    await provider.send("anvil_setBalance", [BOOTSTRAP_SENDER, toQuantity(parseEther("1000"))]);
    await provider.send("anvil_impersonateAccount", [BOOTSTRAP_SENDER]);
    try {
      const signer = await provider.getSigner(BOOTSTRAP_SENDER);
      for (const call of plan.bootstrapTransactions) {
        const tx = await signer.sendTransaction({ to: call.to, data: call.data, value: BigInt(call.value) });
        const receipt = await tx.wait();
        if (!receipt || receipt.status !== 1) throw new Error("Safe bootstrap transaction failed");
        const original = ORIGINALS.find((item) => item.address === call.safeAddress)!;
        const initial = await readExistingSafe(provider, call.safeAddress);
        if (!initial.deployed || !sameOwners(initial.owners, original.owners) || initial.threshold !== original.threshold) throw new Error("Canonical Safe initial ownership mismatch");
        creations.push({ safeAddress: call.safeAddress, from: BOOTSTRAP_SENDER, transactionHash: tx.hash,
          gasUsed: receipt.gasUsed.toString(), blockNumber: receipt.blockNumber, owners: initial.owners, threshold: initial.threshold });
      }
    } finally {
      await provider.send("anvil_stopImpersonatingAccount", [BOOTSTRAP_SENDER]);
    }
  }
  const rotations = [];
  if (mode === "ethereum") for (const batch of plan.rotationBatches) rotations.push(await executeSafeBuilderBatch(provider, batch));
  const finalSafes = [];
  for (const original of ORIGINALS) {
    const safe = new Contract(original.address, SAFE_ABI, provider);
    const [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
    const existing = plan.safes.find((safe) => safe.address === original.address)!.existingState;
    const target = mode === "ethereum" ? plan.ethereumSnapshot.safes[original.address] : existing.deployed ? existing : original;
    if (!sameOwners([...owners], target.owners) || Number(threshold) !== target.threshold) throw new Error("Final Arbitrum Safe membership differs from the selected target");
    finalSafes.push({ address: original.address, owners: [...owners], threshold: Number(threshold) });
  }
  const ftNonceAfter = await provider.send("eth_getTransactionCount", [FT_DEPLOYER, "latest"]);
  if (ftNonceAfter !== ftNonceBefore) throw new Error("Safe bootstrap unexpectedly consumed the FT deployment account nonce");
  return { mode, creations, rotations, finalSafes, ftDeployerNonceBefore: ftNonceBefore, ftDeployerNonceAfter: ftNonceAfter,
    authorization: "Local Anvil only; original-owner impersonation for CREATE2 and threshold-approved Safe rotations; no live transactions" };
}

/**
 * Generate unsigned Safe Transaction Builder files and execute those exact calls
 * on pinned, local Anvil forks. Public RPC connections are read-only.
 * Run: npx hardhat run --no-compile scripts/rollout-ft.ts
 */
import hre from "hardhat";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createHash } from "node:crypto";
import { spawn, ChildProcess } from "node:child_process";
import { AbiCoder, Contract, JsonRpcProvider, keccak256, zeroPadValue } from "ethers";
import { LayerZeroMultiChainWire } from "../tasks/wire";
import { LayerZeroPeerOptionsManager } from "../tasks/peerOptions";
import { ChainConfig } from "../tasks/types";
import { getChainConfig } from "../utils/constants";
import { buildPinnedFTDeployment, deployPinnedFT, FT_DEPLOYER, PINNED_CREATION_HASH } from "./lib/ft-deployment";
import { executeSafeBuilderBatch } from "./lib/rollout-fork";
import { buildSafeBootstrapPlan, simulateSafeBootstrap, SafeBootstrapPlan } from "./lib/arbitrum-safe-bootstrap";

const FT = "0x5DD1A7A369e8273371d2DBf9d83356057088082c";
const DEFAULT_CHAINS = ["ethereum", "sonic", "bsc", "avalanche", "base", "monad", "robinhood", "arc", "arbitrum"];
const EXPANSION_CHAINS = new Set(["monad", "robinhood", "arc", "arbitrum"]);
const PUBLIC_RPCS: Record<string, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com", sonic: "https://rpc.soniclabs.com",
  bsc: "https://bsc-rpc.publicnode.com", avalanche: "https://api.avax.network/ext/bc/C/rpc",
  base: "https://base-rpc.publicnode.com", monad: "https://rpc.monad.xyz",
  robinhood: "https://rpc.mainnet.chain.robinhood.com", arc: "https://rpc.mainnet.arc.io",
  arbitrum: "https://arb1.arbitrum.io/rpc"
};
const ULN = "tuple(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs)";
const EXECUTOR = "tuple(uint32 maxMessageSize,address executor)";
const coder = AbiCoder.defaultAbiCoder();
const stringify = (value: unknown) => JSON.stringify(value, (_, v) => typeof v === "bigint" ? v.toString() : v, 2) + "\n";
const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
type Call = { to: string; value: string; data: string; operation?: number };
type Batch = { version: string; chainId: string; createdAt: number; meta: {
  name: string; description: string; txBuilderVersion: string; createdFromSafeAddress: string; createdFromOwnerAddress: string;
}; transactions: Array<Call & { contractMethod: null; contractInputsValues: null }> };

function write(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, stringify(value));
}

function batch(chain: ChainConfig, safe: string, role: string, calls: Call[], createdAt: number): Batch {
  assert(calls.every(tx => !tx.operation), "Only CALL operations are allowed in exported Safe JSON");
  return {
    version: "1.0", chainId: String(chain.nativeChainId), createdAt,
    meta: { name: `FT ${chain.chainKey}: ${role}`, txBuilderVersion: "1.18.0",
      description: "FT rollout. Execute only after reviewing manifest.json and its deployment, Safe and route prerequisites. Delegate endpoint batches on every network precede owner peer batches. Activation is separate.",
      createdFromSafeAddress: safe, createdFromOwnerAddress: "" },
    transactions: calls.map(({ to, value, data }) => ({ to, value, data, contractMethod: null, contractInputsValues: null }))
  };
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = (server.address() as net.AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

async function startFork(rpc: string, chainId: number, block: number) {
  const port = await freePort();
  const child: ChildProcess = spawn(process.env.ANVIL_BINARY || "anvil", [
    "--host", "127.0.0.1", "--port", String(port), "--chain-id", String(chainId),
    "--fork-url", rpc, "--fork-block-number", String(block), "--hardfork", "cancun",
    "--accounts", "0", "--silent", "--retries", "3", "--timeout", "30000",
    "--compute-units-per-second", String(chainId === 146 ? 150 : 1000)
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  let failure = "";
  child.stderr?.on("data", data => { failure = (failure + data.toString()).slice(-3000); });
  child.on("error", error => { failure = error.message; });
  const provider = new JsonRpcProvider(`http://127.0.0.1:${port}`, chainId, { staticNetwork: true, cacheTimeout: -1 });
  provider.pollingInterval = 50;
  try {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (child.exitCode !== null || child.pid === undefined) throw new Error(`Anvil failed to start: ${failure}`);
      try {
        assert.match(await provider.send("web3_clientVersion", []), /anvil/i);
        assert.equal(Number(await provider.send("eth_chainId", [])), chainId);
        assert.equal(Number(await provider.send("eth_blockNumber", [])), block);
        const header = await provider.send("eth_getBlockByNumber", ["latest", false]);
        // Some L2 headers omit Cancun blob fields. A local empty block supplies
        // them without altering the pinned remote storage or inventing state.
        const bootstrapBlocks = header.excessBlobGas == null ? 1 : 0;
        if (bootstrapBlocks) await provider.send("anvil_mine", ["0x1"]);
        return { provider, child, bootstrapBlocks, stop: () => { provider.destroy(); child.kill(); } };
      } catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    throw new Error(`Timed out starting Anvil: ${failure}`);
  } catch (error) { provider.destroy(); child.kill(); throw error; }
}

function ulnObject(value: any, metadata: any) {
  const providerName = (address: string) => metadata.dvns[address.toLowerCase()]?.canonicalName
    || (Object.entries(metadata.dvns).find(([a]) => equal(a, address))?.[1] as any)?.canonicalName || "UNKNOWN";
  return {
    confirmations: Number(value[0]), requiredDVNCount: Number(value[1]), optionalDVNCount: Number(value[2]),
    optionalDVNThreshold: Number(value[3]), requiredDVNs: Array.from(value[4] as string[]),
    optionalDVNs: Array.from(value[5] as string[]),
    requiredProviders: Array.from(value[4] as string[]).map(providerName),
    optionalProviders: Array.from(value[5] as string[]).map(providerName)
  };
}

async function routeState(provider: JsonRpcProvider, endpoint: Contract, ft: Contract, local: ChainConfig, remote: ChainConfig, metadata: any) {
  const send = new Contract(local.sendLibAddress, [
    `function getAppUlnConfig(address,uint32) view returns (${ULN})`,
    "function executorConfigs(address,uint32) view returns (uint32 maxMessageSize,address executor)"
  ], provider);
  const receive = new Contract(local.receiveLibAddress, [`function getAppUlnConfig(address,uint32) view returns (${ULN})`], provider);
  const [sendLibrary, defaultSend, receiveLibrary, rawSend, rawReceive, executor, effectiveSend, effectiveReceive,
    effectiveExecutor, peer, options, receiveTimeout, currentBlock] = await Promise.all([
    endpoint.getSendLibrary(FT, remote.eid), endpoint.isDefaultSendLibrary(FT, remote.eid),
    endpoint.getReceiveLibrary(FT, remote.eid), send.getAppUlnConfig(FT, remote.eid),
    receive.getAppUlnConfig(FT, remote.eid), send.executorConfigs(FT, remote.eid),
    endpoint.getConfig(FT, local.sendLibAddress, remote.eid, 2),
    endpoint.getConfig(FT, local.receiveLibAddress, remote.eid, 2),
    endpoint.getConfig(FT, local.sendLibAddress, remote.eid, 1),
    ft.peers(remote.eid), ft.enforcedOptions(remote.eid, 1),
    endpoint.receiveLibraryTimeout(FT, remote.eid), provider.send("eth_blockNumber", [])
  ]);
  return {
    remote: remote.chainKey, remoteEid: remote.eid,
    sendLibrary, isDefaultSendLibrary: defaultSend, receiveLibrary: receiveLibrary[0], isDefaultReceiveLibrary: receiveLibrary[1],
    rawSend: ulnObject(rawSend, metadata), rawReceive: ulnObject(rawReceive, metadata),
    rawSendBytes: coder.encode([ULN], [rawSend]), rawReceiveBytes: coder.encode([ULN], [rawReceive]),
    rawExecutorBytes: coder.encode([EXECUTOR], [executor]),
    effectiveSend: ulnObject(coder.decode([ULN], effectiveSend)[0], metadata),
    effectiveReceive: ulnObject(coder.decode([ULN], effectiveReceive)[0], metadata),
    effectiveSendBytes: effectiveSend, effectiveReceiveBytes: effectiveReceive, effectiveExecutorBytes: effectiveExecutor,
    peer, options, receiveTimeout: { library: receiveTimeout[0], expiryBlock: Number(receiveTimeout[1]),
      active: BigInt(receiveTimeout[1]) > BigInt(currentBlock), observedBlock: Number(currentBlock) }
  };
}

/** Drop already explicit config values, never values merely inherited from defaults. */
function changedEndpointCalls(endpoint: Contract, calls: Call[], before: any, local: ChainConfig): Call[] {
  return calls.flatMap(tx => {
    const parsed = endpoint.interface.parseTransaction({ data: tx.data });
    if (parsed?.name !== "setConfig") return [tx];
    const [oapp, library, configs] = parsed.args;
    const changed = Array.from(configs as any[]).filter(config => {
      const raw = Number(config.configType) === 1 ? before.rawExecutorBytes
        : equal(library, local.sendLibAddress) ? before.rawSendBytes : before.rawReceiveBytes;
      return !equal(raw, config.config);
    }).map(config => ({ eid: config.eid, configType: config.configType, config: config.config }));
    return changed.length ? [{ ...tx, data: endpoint.interface.encodeFunctionData("setConfig", [oapp, library, changed]) }] : [];
  });
}

async function processChain(key: string, chains: string[], configs: Map<string, ChainConfig>, metadata: any, output: string, createdAt: number, bootstrapPlan?: SafeBootstrapPlan) {
  const local = configs.get(key)!;
  const roles = getChainConfig(local.nativeChainId)!;
  const rpc = process.env[`RPC_URL_${key.toUpperCase()}`] || PUBLIC_RPCS[key];
  const live = new JsonRpcProvider(rpc, local.nativeChainId, { staticNetwork: true, batchMaxCount: 1, cacheTimeout: -1 });
  const report: any = { chain: key, chainId: local.nativeChainId, status: "running", batches: [], routes: [] };
  const chainDir = path.join(output, key);
  let fork: Awaited<ReturnType<typeof startFork>> | undefined;
  try {
    assert.equal(Number(await live.send("eth_chainId", [])), local.nativeChainId, "Live RPC chain ID mismatch");
    const head = await live.getBlock("latest");
    assert(head, "No live head block");
    report.forkBlock = head.number;
    report.forkBlockHash = head.hash;
    report.forkTimestamp = head.timestamp;
    console.log(`[${key}] Forking block ${head.number}`);
    fork = await startFork(rpc, local.nativeChainId, head.number);
    report.localBootstrapBlocks = fork.bootstrapBlocks;
    const provider = fork.provider;
    if (key === "arbitrum" && bootstrapPlan) {
      const planFile = path.join(chainDir, "00a-governance-bootstrap-plan.json");
      write(planFile, bootstrapPlan);
      write(path.join(chainDir, "00a-safe-deployments.unsigned.json"), {
        chainId: 42161, description: "Ordinary CALLs to SafeProxyFactory from a funded EOA OTHER THAN the FT deployer. Preserve the FT deployer's nonce 0. Execute before the governance and FT Safe batches.",
        transactions: bootstrapPlan.bootstrapTransactions
      });
      const unsignedBootstrapFile = path.join(chainDir, "00a-safe-deployments.unsigned.json");
      const unsignedBootstrap = JSON.parse(fs.readFileSync(unsignedBootstrapFile, "utf8"));
      assert.deepEqual(unsignedBootstrap.transactions, bootstrapPlan.bootstrapTransactions);
      report.governanceBootstrapArtifact = { file: "arbitrum/00a-safe-deployments.unsigned.json",
        sha256: createHash("sha256").update(fs.readFileSync(unsignedBootstrapFile)).digest("hex") };
      const rotations = bootstrapPlan.rotationBatches.map((payload, index) => {
        const name = `00b-governance-${index + 1}.safe.json`;
        const filename = path.join(chainDir, name);
        write(filename, payload);
        return { file: `arbitrum/${name}`, safe: payload.meta.createdFromSafeAddress,
          operations: payload.transactions.length, sha256: createHash("sha256").update(fs.readFileSync(filename)).digest("hex") };
      });
      const persistedPlan = JSON.parse(fs.readFileSync(planFile, "utf8"));
      for (const [index, entry] of rotations.entries()) {
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(output, entry.file), "utf8")), persistedPlan.rotationBatches[index]);
      }
      console.log("[arbitrum] Replaying canonical Safe creation and aligning both Safes to Ethereum 3-of-5");
      report.governanceBootstrap = await simulateSafeBootstrap(provider, "ethereum", persistedPlan);
      report.batches.push(...rotations.map(entry => ({ ...entry, status: "passed", simulation: "See governanceBootstrap for exact Safe receipts" })));
    }
    const pinned = buildPinnedFTDeployment({ chainId: local.nativeChainId, endpoint: local.endpointV2Address, eid: local.eid,
      delegate: roles.delegate, configurator: roles.configurator });
    const beforeCode = await provider.getCode(FT);
    const isNew = beforeCode === "0x";
    report.wasDeployed = !isNew;
    if (isNew) {
      const [latestNonce, pendingNonce, balance, gasPrice] = await Promise.all([
        live.send("eth_getTransactionCount", [FT_DEPLOYER, "latest"]),
        live.send("eth_getTransactionCount", [FT_DEPLOYER, "pending"]),
        live.getBalance(FT_DEPLOYER, head.number), live.send("eth_gasPrice", [])
      ]);
      report.liveDeployerPreflight = { address: FT_DEPLOYER, latestNonce: Number(latestNonce),
        pendingNonce: Number(pendingNonce), balanceWei: balance.toString(), gasPriceWei: BigInt(gasPrice).toString(),
        forkBalanceToppedUp: true };
      assert(Number(latestNonce) === 0 && Number(pendingNonce) === 0, "Live confirmed AND pending deployer nonce must be zero");
      write(path.join(chainDir, "00-deployment-unsigned.json"), pinned);
      report.deployment = await deployPinnedFT(provider, { chainId: local.nativeChainId, endpoint: local.endpointV2Address, eid: local.eid,
        delegate: roles.delegate, configurator: roles.configurator });
      report.liveDeployerPreflight.approximateGasCostWei = (BigInt(report.deployment.gasEstimated) * BigInt(gasPrice)).toString();
      report.liveDeployerPreflight.fundedAtSnapshot = balance >= BigInt(report.liveDeployerPreflight.approximateGasCostWei);
      console.log(`[${key}] CREATE deployment verified at ${FT}`);
    } else {
      report.runtimeHash = keccak256(beforeCode);
      assert.equal(report.runtimeHash, pinned.runtimeExpectedHash, `${key}: existing runtime differs from pinned production`);
    }
    const ft = new Contract(FT, pinned.abi, provider);
    const endpoint = new Contract(local.endpointV2Address, [
      ...(await hre.artifacts.readArtifact("ILayerZeroEndpointV2")).abi,
      "function delegates(address) view returns(address)",
      "function receiveLibraryTimeout(address,uint32) view returns(address lib,uint256 expiry)"
    ], provider);
    const forkHre: any = { ...hre, ethers: { ...hre.ethers, provider }, network: { ...hre.network, name: key } };
    const wire = new LayerZeroMultiChainWire(forkHre);
    wire.buildChainConfigs(metadata, true, chains);
    const peers = new LayerZeroPeerOptionsManager(forkHre);
    const delegate = await endpoint.delegates(FT);
    const owner = await ft.owner();
    const configurator = await ft.configurator();
    report.roles = { owner, delegate, configurator, desiredOwner: roles.finalOwner };
    assert(equal(delegate, roles.delegate), "Unexpected LayerZero delegate");
    assert(equal(configurator, roles.configurator), "Unexpected configurator");
    // A freshly deployed expansion FT remains owned by its constructor delegate
    // until the separate ownership batch executes, even on a later rehearsal.
    assert(equal(owner, roles.finalOwner) || (EXPANSION_CHAINS.has(key) && equal(owner, roles.delegate)), "Unexpected FT owner");
    report.pausedBefore = await ft.paused();
    const needsOwnershipTransfer = !equal(owner, roles.finalOwner);
    const needsActivation = EXPANSION_CHAINS.has(key) && report.pausedBefore;
    report.needsOwnershipTransfer = needsOwnershipTransfer;
    report.totalSupplyBefore = await ft.totalSupply();
    const delegateCalls: Call[] = [];
    const ownerCalls: Call[] = [];
    for (const remoteKey of chains.filter(name => name !== key)) {
      const remote = configs.get(remoteKey)!;
      const before = await routeState(provider, endpoint, ft, local, remote, metadata[key]);
      const sendDesired = wire.buildSendConfig(local, remote);
      const receiveDesired = wire.buildReceiveConfig(local, remote);
      const desired = {
        send: ulnObject(coder.decode([ULN], sendDesired.find(c => c.configType === 2)!.config)[0], metadata[key]),
        receive: ulnObject(coder.decode([ULN], receiveDesired[0].config)[0], metadata[key]),
        sendBytes: sendDesired.find(c => c.configType === 2)!.config,
        receiveBytes: receiveDesired[0].config,
        executorBytes: sendDesired.find(c => c.configType === 1)!.config,
        peer: zeroPadValue(FT, 32), options: "0x00030100110100000000000000000000000000013880"
      };
      const allEndpoint = await wire.prepareEndpointConfig(endpoint as any, ft as any, local, remote);
      const endpointCalls = changedEndpointCalls(endpoint, allEndpoint as Call[], before, local);
      // Use exactly the native task's encoder for owner operations.
      const allOwner: Call[] = await (peers as any).preparePeerAndEnforcedOptions(ft, remote, FT);
      const changedOwner = allOwner.filter(tx => {
        const decoded = ft.interface.parseTransaction({ data: tx.data })!;
        return decoded.name === "setPeer" ? !equal(before.peer, desired.peer) : !equal(before.options, desired.options);
      });
      delegateCalls.push(...endpointCalls);
      ownerCalls.push(...changedOwner);
      report.routes.push({ remote: remoteKey, before, desired, endpointOperations: endpointCalls.length, ownerOperations: changedOwner.length });
    }
    // This first transaction must be signed by the constructor's owner (delegate Safe).
    const ownershipCalls: Call[] = needsOwnershipTransfer ? [{ to: FT, value: "0", data: ft.interface.encodeFunctionData("transferOwnership", [roles.finalOwner]) }] : [];
    const specifications = [
      { file: "01-delegate-endpoints.safe.json", role: "delegate endpoint configuration", safe: roles.delegate, calls: delegateCalls },
      { file: "02-delegate-ownership.safe.json", role: "transfer FT ownership", safe: roles.delegate, calls: ownershipCalls },
      { file: "03-owner-peers.safe.json", role: "owner peers and enforced options", safe: roles.finalOwner, calls: ownerCalls },
      { file: "04-optional-activation.safe.json", role: "OPTIONAL unpause after ALL networks are ready", safe: roles.configurator,
        calls: needsActivation ? [{ to: FT, value: "0", data: ft.interface.encodeFunctionData("setPaused", [false]) }] : [] }
    ];
    const missingSafes: string[] = [];
    for (const address of new Set(specifications.filter(s => s.calls.length).map(s => s.safe))) {
      if (await provider.getCode(address) === "0x") missingSafes.push(address);
    }
    report.missingSafes = missingSafes;
    for (const spec of specifications) {
      if (!spec.calls.length) continue;
      const payload = batch(local, spec.safe, spec.role, spec.calls, createdAt);
      const filename = path.join(chainDir, spec.file);
      write(filename, payload);
      // Read back the artifact; this is the exact file whose calls are simulated.
      const saved = JSON.parse(fs.readFileSync(filename, "utf8"));
      const entry: any = { file: path.relative(output, filename).replace(/\\/g, "/"), safe: spec.safe,
        operations: spec.calls.length, sha256: createHash("sha256").update(fs.readFileSync(filename)).digest("hex") };
      report.batches.push(entry);
      if (missingSafes.length) { entry.status = "blocked: governance Safe not deployed"; continue; }
      console.log(`[${key}] Simulating ${spec.file} (${spec.calls.length} calls) through Safe.execTransaction`);
      entry.simulation = await executeSafeBuilderBatch(provider, saved);
      entry.status = "passed";
    }
    if (missingSafes.length) {
      report.status = "blocked";
      report.blocker = "The configured governance Safe(s) have no code. Their deployment/setup must be supplied before these batches can be simulated or executed. No Safe state was invented on the fork.";
    } else {
      for (const route of report.routes) {
        const remote = configs.get(route.remote)!;
        const after = await routeState(provider, endpoint, ft, local, remote, metadata[key]);
        route.after = after;
        assert(!after.isDefaultSendLibrary && !after.isDefaultReceiveLibrary, "Libraries must be explicitly pinned");
        assert(equal(after.sendLibrary, local.sendLibAddress) && equal(after.receiveLibrary, local.receiveLibAddress), "Library mismatch");
        assert(!after.receiveTimeout.active || equal(after.receiveTimeout.library, local.receiveLibAddress),
          "An alternate receive library still has an active grace period");
        for (const [actual, desired] of [
          [after.rawSendBytes, route.desired.sendBytes], [after.rawReceiveBytes, route.desired.receiveBytes],
          [after.effectiveSendBytes, route.desired.sendBytes], [after.effectiveReceiveBytes, route.desired.receiveBytes],
          [after.rawExecutorBytes, route.desired.executorBytes], [after.effectiveExecutorBytes, route.desired.executorBytes],
          [after.peer, route.desired.peer], [after.options, route.desired.options]
        ]) assert(equal(actual, desired), `${key}->${route.remote}: final config mismatch`);
        // Exercise the complete messaging quote, including the selected DVNs,
        // executor, treasury and FT's enforced receive options. This is read-only.
        const sendParam = { dstEid: remote.eid, to: zeroPadValue(roles.finalOwner, 32),
          amountLD: 10n ** 18n, minAmountLD: 10n ** 18n, extraOptions: "0x", composeMsg: "0x", oftCmd: "0x" };
        const fee = await ft.quoteSend(sendParam, false);
        route.messagingQuote = { sendParam, payInLzToken: false, nativeFee: fee.nativeFee.toString(),
          lzTokenFee: fee.lzTokenFee.toString(), status: "passed" };
      }
      assert(equal(await ft.owner(), roles.finalOwner), "Final owner mismatch");
      assert.equal(await ft.totalSupply(), report.totalSupplyBefore, "Wiring changed token supply");
      assert.equal(await ft.paused(), needsActivation ? false : report.pausedBefore, "Unexpected pause state after simulation");
      report.status = "passed";
      report.activationSimulatedSeparately = needsActivation;
    }
    const unchangedHead = await live.getBlock(head.number);
    assert(unchangedHead && unchangedHead.hash === head.hash, "Pinned source block changed during simulation; rerun after the reorganization");
    console.log(`[${key}] ${report.status}: ${report.routes.length} routes, ${report.batches.length} Safe files`);
  } catch (error: any) {
    report.status = "failed";
    report.error = error.shortMessage || error.message || String(error);
    report.errorDetails = { code: error.code, info: error.info, cause: error.cause?.message, stack: error.stack?.split("\n").slice(0, 5) };
    console.error(`[${key}] FAILED: ${report.error}`);
  } finally {
    write(path.join(chainDir, "report.json"), report);
    fork?.stop(); live.destroy();
  }
  return report;
}

async function main() {
  const createdAt = Date.now();
  const chains = (process.env.FT_ROLLOUT_CHAINS || DEFAULT_CHAINS.join(",")).split(",").map(s => s.trim());
  assert(chains.length > 1 && new Set(chains).size === chains.length && chains.every(c => DEFAULT_CHAINS.includes(c)), "Invalid rollout chain list");
  const output = path.resolve(process.env.FT_ROLLOUT_OUTPUT || path.join("reports", "ft-rollout", new Date(createdAt).toISOString().replace(/[:.]/g, "-")));
  const previous = process.env.FT_ROLLOUT_RESUME === "1" ? JSON.parse(fs.readFileSync(path.join(output, "manifest.json"), "utf8")) : undefined;
  const manager = new LayerZeroMultiChainWire(hre);
  const metadata = manager.loadMetadata();
  manager.buildChainConfigs(metadata, true, chains);
  const configs = new Map(chains.map(key => [key, manager.getChainConfig(key)]));
  if (previous) assert.deepEqual(previous.chains, chains, "Cannot resume a different chain mesh");
  const providerReportFile = path.resolve(process.env.FT_ROLLOUT_DVN_REPORT || "reports/ft-rollout/provider-support.json");
  assert(fs.existsSync(providerReportFile), "Run scripts/check-rollout-dvns.ts first to obtain fresh provider support evidence");
  const providerReport = JSON.parse(fs.readFileSync(providerReportFile, "utf8"));
  assert(!providerReport.summary.chainReadErrors?.length && !providerReport.summary.confirmationReadErrors?.length
    && !providerReport.summary.confirmationMismatches?.length, "Provider report contains chain or confirmation errors");
  const metadataHash = createHash("sha256").update(fs.readFileSync("utils/lzMetadata.json")).digest("hex");
  if (previous) assert.equal(previous.providerSupport.metadataSha256, metadataHash, "Cannot resume changed metadata");
  assert.equal(providerReport.metadataSha256, metadataHash, "Provider evidence is for different LayerZero metadata; rerun the checker");
  assert(createdAt - Date.parse(providerReport.completedAt) >= 0 && createdAt - Date.parse(providerReport.completedAt) < 86_400_000,
    "Provider checks must have completed within the preceding 24 hours; rerun the checker");
  const sortedAddresses = (addresses: string[]) => addresses.map(a => a.toLowerCase()).sort().join("|");
  for (const source of chains) for (const destination of chains.filter(c => c !== source)) {
    const matches = providerReport.routes.filter((r: any) => r.source === source && r.destination === destination);
    assert.equal(matches.length, 1, `Expected one provider report for ${source}->${destination}`);
    const route = matches[0];
    const policy = manager.getRouteDvnPolicy(configs.get(source)!, configs.get(destination)!);
    assert(route.ok && route.providers.every((p: any) => p.ok), `Provider quote failed: ${source}->${destination}`);
    assert.equal(Number(route.confirmations), configs.get(source)!.confirmations, "Provider confirmation mismatch");
    assert.equal(sortedAddresses(route.providers.filter((p: any) => p.role === "required").map((p: any) => p.address)), sortedAddresses(policy.requiredDvnAddresses));
    assert.equal(sortedAddresses(route.providers.filter((p: any) => p.role === "optional").map((p: any) => p.address)), sortedAddresses(policy.optionalDvnAddresses));
    assert.equal(route.optionalThreshold, policy.optionalDvnThreshold);
  }
  write(path.join(output, "provider-support.json"), providerReport);
  write(path.join(output, "metadata-snapshot.json"), Object.fromEntries(chains.map(key => [key, metadata[key]])));
  const manifest: any = {
    createdAt: new Date(createdAt).toISOString(), chains, ftAddress: FT, simulationOnly: true, liveTransactionsSent: 0,
    readyForAllNetworkExecution: false,
    providerSupport: { file: "provider-support.json", completedAt: providerReport.completedAt, summary: providerReport.summary, metadataSha256: metadataHash },
    executionOrder: ["Resolve all blockers and review Safe owners/thresholds; confirm both governance Safes exist on every chain.",
      "On Arbitrum, execute the canonical SafeProxyFactory calls in 00a-safe-deployments.unsigned.json from a funded EOA OTHER THAN the FT deployer, then the 00b-governance-*.safe.json batches to align both Safes to the captured Ethereum 3-of-5 membership.",
      "Deploy missing FT contracts using each 00-deployment-unsigned.json, original deployer and nonce 0. Recheck pending nonce and empty target address immediately before signing.",
      "Execute 01-delegate-endpoints.safe.json on every chain; then transfer new FT ownership with each 02-delegate-ownership.safe.json.",
      "After all deployments and both ends' endpoint configurations are verified, execute 03-owner-peers.safe.json on the four new chains first, then the five existing chains.",
      "Review and execute 04-optional-activation.safe.json only when ready to enable transfers; those files were simulated separately."],
    limitations: ["Forks use Cancun EVM execution; chain-specific live gas pricing, finality and sequencer behavior are not reproduced.",
      "Safe execution uses approvals from impersonated current owners on local forks. This tests actual Safe/guard/MultiSend execution, not access to real signing keys.",
      "Configuration and worker quotes do not simulate off-chain DVN attestations or end-to-end LayerZero delivery.",
      "Safe Transaction Builder files contain calls, not signatures or a fixed live Safe nonce. Refresh chain state and re-simulate before signing."],
    results: []
  };
  if (previous) manifest.resumedFromCreatedAt = previous.createdAt;
  const compiled = await hre.artifacts.readArtifact("FT");
  manifest.bytecode = {
    compiledCreationHash: keccak256(compiled.bytecode),
    productionCreationHashes: Object.fromEntries(["ethereum", "sonic", "bsc", "avalanche", "base"].map(key =>
      [key, keccak256(JSON.parse(fs.readFileSync(path.join("deployments", key, "FT.json"), "utf8")).bytecode)])),
    deploymentUses: "Pinned production artifact, not the current compiler output"
  };
  assert(Object.values(manifest.bytecode.productionCreationHashes).every(hash => hash === PINNED_CREATION_HASH),
    "Saved production artifacts disagree with the pinned creation bytecode");
  write(path.join(output, "manifest.json"), manifest);
  console.log(`Writing rollout evidence to ${output}`);
  const retrySources = (process.env.FT_ROLLOUT_RETRY_SOURCES || "").split(",").filter(Boolean);
  const canRetain = (result: any) => result?.status === "passed"
    && result.routes.every((route: any) => route.messagingQuote?.status === "passed");
  const bootstrapPlan = chains.includes("arbitrum") && (!previous || retrySources.includes("arbitrum")
    || !canRetain(previous.results.find((r: any) => r.chain === "arbitrum"))) ? await buildSafeBootstrapPlan() : undefined;
  for (const key of chains) {
    const prior = previous?.results.find((r: any) => r.chain === key);
    if (canRetain(prior) && !retrySources.includes(key)) {
      // Resume preserves previously executed artifacts only when their hashes
      // and every raw/observed route value still match the current builders.
      assert.equal(prior.routes.length, chains.length - 1, "Incomplete prior source report");
      const currentRoles = getChainConfig(configs.get(key)!.nativeChainId)!;
      assert(equal(prior.roles.delegate, currentRoles.delegate) && equal(prior.roles.configurator, currentRoles.configurator)
        && equal(prior.roles.desiredOwner, currentRoles.finalOwner), "Cannot resume changed role configuration");
      for (const route of prior.routes) {
        const local = configs.get(key)!, remote = configs.get(route.remote)!;
        const send = manager.buildSendConfig(local, remote), receive = manager.buildReceiveConfig(local, remote);
        assert.equal(route.after.rawSendBytes, send.find(c => c.configType === 2)!.config);
        assert.equal(route.after.rawReceiveBytes, receive[0].config);
        assert.equal(route.after.rawExecutorBytes, send.find(c => c.configType === 1)!.config);
        assert(equal(route.after.peer, zeroPadValue(FT, 32)) && route.after.options === "0x00030100110100000000000000000000000000013880");
        assert(!route.after.receiveTimeout.active || equal(route.after.receiveTimeout.library, local.receiveLibAddress));
      }
      for (const entry of prior.batches) {
        assert.equal(entry.status, "passed");
        assert.equal(createHash("sha256").update(fs.readFileSync(path.join(output, entry.file))).digest("hex"), entry.sha256);
      }
      manifest.results.push(prior);
      console.log(`[${key}] Retaining verified fork result at block ${prior.forkBlock}; exact artifact hashes checked`);
      write(path.join(output, "manifest.json"), manifest);
      continue;
    }
    const result = await processChain(key, chains, configs, metadata, output, createdAt, bootstrapPlan);
    manifest.results.push(result);
    write(path.join(output, "manifest.json"), manifest);
  }
  // Compare identities (addresses differ per chain) and source confirmations at both ends.
  manifest.crossChainComparisons = [];
  const sorted = (values: string[]) => [...values].sort().join("|");
  for (const source of manifest.results) {
    for (const route of source.routes) {
      const reverse = manifest.results.find((r: any) => r.chain === route.remote)?.routes.find((r: any) => r.remote === source.chain);
      if (!reverse) continue;
      const a = route.desired.send, b = reverse.desired.receive;
      const match = sorted(a.requiredProviders) === sorted(b.requiredProviders) && sorted(a.optionalProviders) === sorted(b.optionalProviders)
        && a.optionalDVNThreshold === b.optionalDVNThreshold && a.confirmations === b.confirmations;
      manifest.crossChainComparisons.push({ source: source.chain, destination: route.remote, desiredPoliciesMatch: match,
        bothForkStatesVerified: source.status === "passed" && manifest.results.find((r: any) => r.chain === route.remote)?.status === "passed" });
      assert(match, `Cross-chain provider policy mismatch: ${source.chain}->${route.remote}`);
    }
  }
  manifest.completeDirectedRouteComparison = manifest.crossChainComparisons.length === chains.length * (chains.length - 1);
  manifest.successfulMessagingQuotes = manifest.results.reduce((sum: number, r: any) =>
    sum + r.routes.filter((route: any) => route.messagingQuote?.status === "passed").length, 0);
  manifest.allMessagingQuotesPassed = manifest.successfulMessagingQuotes === chains.length * (chains.length - 1);
  manifest.allConfigurationSimulationsPassed = manifest.completeDirectedRouteComparison && manifest.results.every((r: any) => r.status === "passed");
  manifest.executionBlockers = manifest.results.flatMap((r: any) => [
    ...(r.status !== "passed" ? [{ chain: r.chain, reason: r.blocker || r.error || "Simulation incomplete" }] : []),
    ...(r.liveDeployerPreflight && !r.liveDeployerPreflight.fundedAtSnapshot ? [{ chain: r.chain, reason: "Original FT deployer needs native gas funding; the fork supplied a local balance top-up" }] : [])
  ]);
  manifest.readyForAllNetworkExecution = manifest.allConfigurationSimulationsPassed && manifest.allMessagingQuotesPassed && !manifest.executionBlockers.length;
  manifest.totalSafeFiles = manifest.results.reduce((sum: number, r: any) => sum + r.batches.length, 0);
  manifest.simulatedSafeFiles = manifest.results.reduce((sum: number, r: any) => sum + r.batches.filter((b: any) => b.status === "passed").length, 0);
  manifest.unchangedExistingRoutes = manifest.results.flatMap((r: any) => r.routes.filter((route: any) =>
    route.endpointOperations === 0 && route.ownerOperations === 0)).length;
  write(path.join(output, "manifest.json"), manifest);
  console.log(stringify({ output, ready: manifest.readyForAllNetworkExecution, results: manifest.results.map((r: any) => ({ chain: r.chain, status: r.status })) }));
  if (!manifest.readyForAllNetworkExecution) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });

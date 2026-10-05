/**
 * Read-only, block-pinned worker quotes for all 72 directed FT routes.
 * Run: npx hardhat run --no-compile scripts/check-rollout-dvns.ts
 * FT_DVN_METADATA and FT_DVN_SUPPORT_OUTPUT optionally select snapshot/output paths.
 * RPC_URL_<CHAIN> overrides public RPCs. No signer or transaction API is used.
 */
import hre from "hardhat";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Interface, ZeroAddress, toQuantity } from "ethers";
import { LayerZeroMultiChainWire } from "../tasks/wire";
import { resolveDvnPolicy } from "../tasks/BaseManager";
import { ChainMetadata } from "../tasks/types";
import { getChainConfig } from "../utils/constants";

const CHAINS = ["ethereum", "sonic", "bsc", "avalanche", "base", "monad", "robinhood", "arc", "arbitrum"];
const FT = "0x5DD1A7A369e8273371d2DBf9d83356057088082c";
const PUBLIC_RPCS: Record<string, string> = {
  ethereum: "https://ethereum-rpc.publicnode.com", sonic: "https://rpc.soniclabs.com",
  bsc: "https://bsc-rpc.publicnode.com", avalanche: "https://api.avax.network/ext/bc/C/rpc",
  base: "https://base-rpc.publicnode.com", monad: "https://rpc.monad.xyz",
  robinhood: "https://rpc.mainnet.chain.robinhood.com", arc: "https://rpc.mainnet.arc.io",
  arbitrum: "https://arb1.arbitrum.io/rpc"
};
const READ_METHODS = new Set(["eth_chainId", "eth_getBlockByNumber", "eth_getCode", "eth_call"]);
const dvn = new Interface(["function getFee(uint32,uint64,address,bytes) view returns (uint256)"]);
const uln = new Interface(["function getUlnConfig(address,uint32) view returns (tuple(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs))"]);
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const write = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
};

// A method allowlist makes accidental mutation through this RPC client impossible.
async function readRpc(rpc: string, method: string, params: unknown[], priorErrors: string[] = []): Promise<any> {
  assert(READ_METHODS.has(method), `Non-read RPC method forbidden: ${method}`);
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(rpc, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body: any = await response.json();
      if (body.error) throw new Error(`RPC ${body.error.code}: ${body.error.message}`);
      if (body.result == null) throw new Error(`${method} returned no result`);
      return body.result;
    } catch (error) {
      priorErrors.push(message(error));
      if (attempt === 3) throw error;
      await pause(500 * (attempt + 1));
    }
  }
  throw new Error("Unreachable RPC retry state");
}

async function main() {
  const metadataPath = path.resolve(process.env.FT_DVN_METADATA || "utils/lzMetadata.json");
  const output = path.resolve(process.env.FT_DVN_SUPPORT_OUTPUT || "reports/ft-rollout/provider-support.json");
  const metadataBytes = fs.readFileSync(metadataPath);
  const metadata = JSON.parse(metadataBytes.toString("utf8")) as Record<string, ChainMetadata>;
  const manager = new LayerZeroMultiChainWire(hre);
  manager.buildChainConfigs(metadata, true, CHAINS);
  const configs = Object.fromEntries(CHAINS.map(key => [key, manager.getChainConfig(key)]));
  const report: any = {
    generatedAt: new Date().toISOString(), source: "https://metadata.layerzero-api.com/v1/metadata/deployments",
    metadataSha256: createHash("sha256").update(metadataBytes).digest("hex"),
    metadataSnapshot: path.relative(process.cwd(), metadataPath),
    mode: "read-only eth_call; no transactions broadcast", ftAddress: FT,
    policy: { required: ["layerzero-labs", "canary"], optionalThreshold: 2,
      ordinaryOptional: ["deutsche-telekom", "horizen-labs", "nethermind"],
      arcOrRobinhoodOptional: ["p2p", "horizen-labs", "nethermind"] },
    chains: {}, routes: [], blockers: [],
    limitations: ["Successful worker fee quotes demonstrate configured on-chain support at the pinned source block, not off-chain delivery or future availability.",
      "Provider identities and deployments are resolved from the recorded local official-metadata snapshot; this command does not silently update policy metadata."]
  };
  await Promise.all(CHAINS.map(async source => {
    const local = configs[source];
    assert.equal(metadata[source].deployments.find(d => d.version === 2)?.stage, "mainnet");
    assert(local.confirmations && Number.isSafeInteger(local.confirmations) && local.confirmations > 0);
    assert.equal(local.ftTokenAddress?.toLowerCase(), FT.toLowerCase());
    const rpc = process.env[`RPC_URL_${source.toUpperCase()}`] || PUBLIC_RPCS[source];
    const chain: any = report.chains[source] = {
      chainId: local.nativeChainId, eid: local.eid,
      rpc: rpc === PUBLIC_RPCS[source] ? rpc : `${new URL(rpc).origin}/[configured RPC path omitted]`,
      sourceConfirmations: local.confirmations, sendUln302: local.sendLibAddress
    };
    let blockTag: string | undefined;
    try {
      assert.equal(Number(await readRpc(rpc, "eth_chainId", [])), local.nativeChainId, `${source}: RPC chain mismatch`);
      const block = await readRpc(rpc, "eth_getBlockByNumber", ["latest", false]);
      blockTag = toQuantity(Number(block.number));
      chain.blockNumber = Number(block.number);
      chain.blockHash = block.hash;
      chain.blockTime = new Date(Number(block.timestamp) * 1000).toISOString();
      const roles = getChainConfig(local.nativeChainId)!;
      chain.roleContractCode = {};
      for (const address of new Set([roles.finalOwner, roles.delegate, roles.configurator])) {
        const code = await readRpc(rpc, "eth_getCode", [address, blockTag]);
        chain.roleContractCode[address] = (code.length - 2) / 2;
        if (code === "0x") report.blockers.push({ chain: source, address, reason: "Configured governance Safe has no deployed code at the pinned block" });
      }
    } catch (error) { chain.error = message(error); }

    for (const destination of CHAINS.filter(key => key !== source)) {
      const remote = configs[destination];
      const policy = resolveDvnPolicy(metadata, source, destination);
      assert.equal(policy.requiredDvnAddresses.length, 2);
      assert.equal(policy.optionalDvnAddresses.length, 3);
      assert.equal(policy.optionalDvnThreshold, 2);
      const route: any = { source, destination, sourceEid: local.eid, destinationEid: remote.eid,
        blockNumber: chain.blockNumber, confirmations: local.confirmations,
        requiredCount: 2, optionalCount: 3, optionalThreshold: policy.optionalDvnThreshold, providers: [] };
      report.routes.push(route);
      for (const [role, addresses] of [["required", policy.requiredDvnAddresses], ["optional", policy.optionalDvnAddresses]] as const) {
        for (const address of addresses) {
          const entry = Object.entries(metadata[source].dvns).find(([key]) => key.toLowerCase() === address.toLowerCase())![1];
          const worker: any = { id: entry.id, name: entry.canonicalName, address, role, ok: false };
          route.providers.push(worker);
          if (chain.error || !blockTag) { worker.error = chain.error || "Missing pinned block"; continue; }
          const priorErrors: string[] = [];
          try {
            const data = dvn.encodeFunctionData("getFee", [remote.eid, local.confirmations, FT, "0x"]);
            const result = await readRpc(rpc, "eth_call", [{ to: address, from: local.sendLibAddress, data }, blockTag], priorErrors);
            worker.fee = dvn.decodeFunctionResult("getFee", result)[0].toString();
            worker.ok = true;
          } catch (error) { worker.error = message(error); }
          if (priorErrors.length) worker.priorErrors = priorErrors;
          await pause(125);
        }
      }
      if (!chain.error && blockTag) {
        try {
          const data = uln.encodeFunctionData("getUlnConfig", [ZeroAddress, remote.eid]);
          const result = await readRpc(rpc, "eth_call", [{ to: local.sendLibAddress, data }, blockTag]);
          route.defaultSendConfirmations = uln.decodeFunctionResult("getUlnConfig", result)[0].confirmations.toString();
        } catch (error) { route.confirmationReadError = message(error); }
      } else { route.confirmationReadError = chain.error || "Missing pinned block"; }
      route.ok = route.providers.every((worker: any) => worker.ok);
    }
    // Detect a reorg while collecting all calls using the same block number.
    if (!chain.error && blockTag) {
      try {
        const finalBlock = await readRpc(rpc, "eth_getBlockByNumber", [blockTag, false]);
        assert.equal(finalBlock.hash, chain.blockHash, `${source}: pinned block changed during checks`);
      } catch (error) { chain.error = message(error); }
    }
    console.log(`${source}: ${report.routes.filter((route: any) => route.source === source && route.ok).length}/8 routes quoted${chain.error ? `; ${chain.error}` : ""}`);
  }));
  report.routes.sort((a: any, b: any) => `${a.source}->${a.destination}`.localeCompare(`${b.source}->${b.destination}`));
  const workers = report.routes.flatMap((route: any) => route.providers.map((worker: any) => ({ source: route.source, destination: route.destination, ...worker })));
  report.summary = {
    expectedRoutes: 72, checkedRoutes: report.routes.length,
    passingRoutes: report.routes.filter((route: any) => route.ok).length,
    expectedProviderQuotes: 360, checkedProviderQuotes: workers.length,
    passingProviderQuotes: workers.filter((worker: any) => worker.ok).length,
    failedQuotes: workers.filter((worker: any) => !worker.ok),
    confirmationMismatches: report.routes.filter((route: any) => route.defaultSendConfirmations != null && BigInt(route.defaultSendConfirmations) !== BigInt(route.confirmations)),
    confirmationReadErrors: report.routes.filter((route: any) => route.confirmationReadError),
    chainReadErrors: Object.entries(report.chains).filter(([_, chain]: [string, any]) => chain.error).map(([chain, state]: [string, any]) => ({ chain, error: state.error }))
  };
  assert.equal(report.routes.length, 72);
  assert.equal(new Set(report.routes.map((route: any) => `${route.source}->${route.destination}`)).size, 72);
  assert.equal(workers.length, 360);
  report.completedAt = new Date().toISOString();
  write(output, report);
  console.log(JSON.stringify({ output, ...report.summary, governanceBlockers: report.blockers.length }, null, 2));
  if (report.summary.failedQuotes.length || report.summary.confirmationReadErrors.length || report.summary.confirmationMismatches.length || report.summary.chainReadErrors.length) process.exitCode = 1;
}

main().catch(error => { console.error(error); process.exitCode = 1; });

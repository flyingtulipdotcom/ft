import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import {
  AbiCoder,
  Contract,
  ContractFactory,
  JsonRpcProvider,
  JsonRpcSigner,
  formatEther,
  formatUnits,
  keccak256,
  parseEther,
  toBeHex,
  zeroPadValue,
} from "ethers";
import { Options } from "@layerzerolabs/lz-v2-utilities";

import { FT_DETERMINISTIC_ADDRESS, FT_DETERMINISTIC_DEPLOYER, FT_DETERMINISTIC_NONCE, getChainConfig } from "../utils/constants";
import { assertDeterministicDeployment, getFTConstructorArgs } from "../utils/deterministic";
import { startAnvilFork } from "../utils/anvilFork";
import { LayerZeroMultiChainWire } from "./wire";
import { LayerZeroPeerOptionsManager } from "./peerOptions";
import { ChainConfig as WireChainConfig } from "./types";

// Same as peerOptions.ts
const EXPECTED_ENFORCED_OPTIONS = Options.newOptions().addExecutorLzReceiveOption(80000, 0).toHex().toString();
const MAX_MESSAGE_SIZE = 10000n;
const NATIVE_SYMBOL: Record<number, string> = { 1: "ETH", 56: "BNB", 146: "S", 143: "MON", 4663: "ETH", 8453: "ETH", 43114: "AVAX" };
const MSG_TYPE_SEND = 1;
const CONFIG_TYPE_EXECUTOR = 1;
const CONFIG_TYPE_ULN = 2;

const ENDPOINT_ABI = [
  "function getSendLibrary(address,uint32) view returns (address)",
  "function getReceiveLibrary(address,uint32) view returns (address,bool)",
  "function getConfig(address,address,uint32,uint32) view returns (bytes)",
  "function delegates(address) view returns (address)",
  "function defaultSendLibrary(uint32) view returns (address)",
  "function defaultReceiveLibrary(uint32) view returns (address)",
];
const ULN_CONFIG = "tuple(uint64 confirmations, uint8 requiredDVNCount, uint8 optionalDVNCount, uint8 optionalDVNThreshold, address[] requiredDVNs, address[] optionalDVNs)";
const EXECUTOR_CONFIG = "tuple(uint32 maxMessageSize, address executor)";

type Row = { check: string; expected: string; actual: string; ok: boolean };

const lower = (a: string) => a.toLowerCase();
const same = (a: string, b: string) => lower(a) === lower(b);
const row = (check: string, expected: unknown, actual: unknown, ok?: boolean): Row => ({
  check,
  expected: String(expected),
  actual: String(actual),
  ok: ok ?? String(expected).toLowerCase() === String(actual).toLowerCase(),
});
const mark = (ok: boolean) => (ok ? "✅" : "❌");
// Provider URLs often embed an API key (e.g. Alchemy's /v2/<key>): only ever print the host
const rpcHost = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return "<rpc>";
  }
};

function table(rows: Row[]): string[] {
  return [
    "| | Check | Expected | Actual |",
    "|---|---|---|---|",
    ...rows.map((r) => `| ${mark(r.ok)} | ${r.check} | \`${r.expected}\` | \`${r.actual}\` |`),
  ];
}

function gitInfo(): string {
  try {
    const commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const dirty = execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() !== "";
    return `${commit}${dirty ? " (+ uncommitted changes)" : ""}`;
  } catch {
    return "unknown";
  }
}

async function impersonate(provider: JsonRpcProvider, address: string, fund: boolean): Promise<JsonRpcSigner> {
  await provider.send("anvil_impersonateAccount", [address]);
  // Safes don't pay gas themselves (their executor does); give them gas money on the fork only
  if (fund) await provider.send("anvil_setBalance", [address, toBeHex(parseEther("1000"))]);
  return new JsonRpcSigner(provider, address);
}

async function readTokenState(ft: Contract, endpoint: Contract) {
  const address = await ft.getAddress();
  const domain = await ft.eip712Domain();
  return {
    name: (await ft.name()) as string,
    symbol: (await ft.symbol()) as string,
    decimals: (await ft.decimals()) as bigint,
    totalSupply: (await ft.totalSupply()) as bigint,
    paused: (await ft.paused()) as boolean,
    owner: (await ft.owner()) as string,
    configurator: (await ft.configurator()) as string,
    endpoint: (await ft.endpoint()) as string,
    lzDelegate: (await endpoint.delegates(address)) as string,
    eip712ChainId: domain.chainId as bigint,
    eip712Contract: domain.verifyingContract as string,
  };
}

task("ft:dry-run", "Simulate the FT deployment + post-deploy Safe steps on an anvil fork and report the expected final state")
  .addOptionalParam("deployer", "Deployer address to impersonate", FT_DETERMINISTIC_DEPLOYER, types.string)
  .addOptionalParam("chains", "Comma-separated peer chains to wire (default: every other mainnet FT chain)", undefined, types.string)
  .addOptionalParam("out", "Markdown report path (default: dry-runs/<network>.md)", undefined, types.string)
  .setAction(async (taskArgs: { deployer: string; chains?: string; out?: string }, hre: HardhatRuntimeEnvironment) => {
    const network = hre.network.name;
    const liveUrl = (hre.network.config as any).url as string | undefined;
    if (!liveUrl) throw new Error(`ft:dry-run needs an HTTP network (got ${network})`);

    const chainId = Number(await hre.getChainId());
    const chainConfig = getChainConfig(chainId);
    if (!chainConfig) throw new Error(`No configuration for chain ${chainId} in utils/constants.ts`);
    const isTestnet = (hre.network.config as any).isTestnet ?? false;
    const args = getFTConstructorArgs(chainConfig, isTestnet);
    const [, , endpointAddress, delegate, configurator, mintChainId] = args;
    const deployer = taskArgs.deployer;

    const artifact = await hre.artifacts.readArtifact("FT");
    const factory = new ContractFactory(artifact.abi, artifact.bytecode);
    const { data: initCode } = await factory.getDeployTransaction(...args);
    if (!initCode) throw new Error("Could not build FT init code");

    // Wiring plan, built exactly like ft:wire / ft:peer-options
    const wire = new LayerZeroMultiChainWire(hre, false);
    const metadata = wire.loadMetadata();
    wire.buildChainConfigs(metadata, true);
    const peerManager = new LayerZeroPeerOptionsManager(hre, false);
    peerManager.buildChainConfigs(metadata, true);
    const source = wire.getChainConfig(network);
    const ftAddressOf = (c: WireChainConfig) =>
      c.ftTokenAddress ?? (getChainConfig(c.nativeChainId)?.deterministic ? FT_DETERMINISTIC_ADDRESS : undefined);
    const peerKeys = taskArgs.chains
      ? taskArgs.chains.split(",").map((c) => c.trim()).filter((c) => c !== network)
      : Object.keys(metadata).filter((key) => {
          if (key === network) return false;
          try {
            const c = wire.getChainConfig(key);
            return !!getChainConfig(c.nativeChainId)?.deterministic === !!chainConfig.deterministic && !!ftAddressOf(c);
          } catch {
            return false;
          }
        });
    const peers = peerKeys.map((key) => {
      const c = { ...wire.getChainConfig(key) };
      c.ftTokenAddress = ftAddressOf(c);
      if (!c.ftTokenAddress) throw new Error(`No FT address for peer chain ${key}`);
      return c;
    });

    // Live (read-only) facts
    const live = new JsonRpcProvider(liveUrl, chainId, { staticNetwork: true });
    const [liveNonce, liveBalance, feeData, liveBlock] = await Promise.all([
      live.getTransactionCount(deployer, "pending"),
      live.getBalance(deployer),
      live.getFeeData(),
      live.getBlockNumber(),
    ]);
    let liveGas: bigint | undefined;
    let liveGasError: string | undefined;
    try {
      liveGas = await live.estimateGas({ from: deployer, data: initCode });
    } catch (e: any) {
      liveGasError = e.shortMessage ?? e.message;
    }

    const preRows: Row[] = [];
    const deployRows: Row[] = [];
    const finalRows: Row[] = [];
    const peerTable: string[] = [];
    const steps: string[] = [];
    let forkBlock = 0;
    let deployGasUsed: bigint | undefined;
    let runtimeHash = "";
    let fatal: string | undefined;

    console.log(`Forking ${network} (${rpcHost(liveUrl)}) with anvil...`);
    const fork = await startAnvilFork(liveUrl, chainId);
    try {
      const p = fork.provider;
      forkBlock = await p.getBlockNumber();
      const endpoint = new Contract(endpointAddress, ENDPOINT_ABI, p);

      // 1. Pre-deploy checks (same guard as deploy/FT.ts)
      preRows.push(row("Fork chain id", chainId, BigInt(await p.send("eth_chainId", []))));
      if (chainConfig.deterministic) {
        try {
          await assertDeterministicDeployment(p, deployer, args, initCode);
          preRows.push(row("Deterministic pre-checks (deploy/FT.ts guard)", "pass", "pass"));
        } catch (e: any) {
          preRows.push(row("Deterministic pre-checks (deploy/FT.ts guard)", "pass", e.message.replace(/\n/g, " "), false));
          throw new Error("pre-checks failed");
        }
      }

      // 2. Deploy as the deployer, nonce pinned like deploy/FT.ts
      const deployerSigner = await impersonate(p, deployer, false);
      const overrides = chainConfig.deterministic ? { nonce: FT_DETERMINISTIC_NONCE } : {};
      const deployed = await factory.connect(deployerSigner).deploy(...args, overrides);
      const receipt = await deployed.deploymentTransaction()!.wait();
      deployGasUsed = receipt!.gasUsed;
      const ftAddress = await deployed.getAddress();
      const ft = new Contract(ftAddress, artifact.abi, p);
      runtimeHash = keccak256(await p.getCode(ftAddress));
      steps.push(`\`${deployer}\` deploys FT (CREATE, nonce ${deployed.deploymentTransaction()!.nonce}) → \`${ftAddress}\` (gas used ${deployGasUsed})`);

      const isMintChain = chainId === mintChainId;
      const expectedSupply = isMintChain ? 10_000_000_000n * 10n ** 18n : 0n;
      const s1 = await readTokenState(ft, endpoint);
      if (chainConfig.deterministic) deployRows.push(row("Address", FT_DETERMINISTIC_ADDRESS, ftAddress));
      deployRows.push(
        row("Name", "Flying Tulip", s1.name),
        row("Symbol", "FT", s1.symbol),
        row("Decimals", 18, s1.decimals),
        row("Total supply", expectedSupply, s1.totalSupply),
        row("Paused", true, s1.paused),
        row("Owner (= delegate until transfer)", delegate, s1.owner),
        row("Configurator", configurator, s1.configurator),
        row("LayerZero endpoint", endpointAddress, s1.endpoint),
        row("LayerZero delegate", delegate, s1.lzDelegate),
        row("EIP-712 chainId", chainId, s1.eip712ChainId),
        row("EIP-712 verifyingContract", ftAddress, s1.eip712Contract)
      );
      const sonic = getChainConfig(146);
      const sonicUrl = (hre.config.networks.sonic as any)?.url;
      if (sonic && same(sonic.endpointV2, endpointAddress) && sonicUrl) {
        const sonicHash = keccak256(await new JsonRpcProvider(sonicUrl, 146, { staticNetwork: true }).getCode(FT_DETERMINISTIC_ADDRESS));
        deployRows.push(row("Runtime code hash = live Sonic FT", sonicHash, runtimeHash));
      }

      // 3. Post-deploy Safe steps from the runbook
      const ownerSafe = chainConfig.finalOwner;
      const delegateSigner = await impersonate(p, delegate, true);
      await (await ft.connect(delegateSigner).getFunction("transferOwnership")(ownerSafe)).wait();
      steps.push(`Delegate Safe \`${delegate}\` → FT.transferOwnership(\`${ownerSafe}\`)`);

      preRows.push(
        row("Endpoint default send lib (ft:wire precheck)", source.sendLibAddress, await endpoint.defaultSendLibrary(source.eid)),
        row("Endpoint default receive lib (ft:wire precheck)", source.receiveLibAddress, await endpoint.defaultReceiveLibrary(source.eid))
      );

      const endpointTyped = await hre.ethers.getContractAt("ILayerZeroEndpointV2", endpointAddress);
      let endpointTxs = 0;
      for (const dest of peers) {
        const txs = await wire["prepareEndpointConfig"](endpointTyped, ft as any, source, dest);
        for (const tx of txs) await (await delegateSigner.sendTransaction({ to: tx.to, data: tx.data })).wait();
        endpointTxs += txs.length;
      }
      steps.push(`Delegate Safe \`${delegate}\` → ${endpointTxs} endpoint calls from \`ft:wire\` (setSendLibrary/setConfig/setReceiveLibrary/setConfig × ${peers.length} peers)`);

      const ownerSigner = await impersonate(p, ownerSafe, true);
      let peerTxs = 0;
      for (const dest of peers) {
        const txs = await peerManager["preparePeerAndEnforcedOptions"](ft as any, dest, dest.ftTokenAddress!);
        for (const tx of txs) await (await ownerSigner.sendTransaction({ to: tx.to, data: tx.data })).wait();
        peerTxs += txs.length;
      }
      steps.push(`Owner Safe \`${ownerSafe}\` → ${peerTxs} calls from \`ft:wire\` (setPeer + setEnforcedOptions × ${peers.length} peers)`);

      const configuratorSigner = await impersonate(p, configurator, true);
      await (await ft.connect(configuratorSigner).getFunction("setPaused")(false)).wait();
      steps.push(`Configurator Safe \`${configurator}\` → FT.setPaused(false)`);

      // 4. Final state
      const s2 = await readTokenState(ft, endpoint);
      finalRows.push(
        row("Owner", ownerSafe, s2.owner),
        row("Paused", false, s2.paused),
        row("Configurator", configurator, s2.configurator),
        row("LayerZero delegate", delegate, s2.lzDelegate),
        row("Total supply", expectedSupply, s2.totalSupply)
      );

      const coder = AbiCoder.defaultAbiCoder();
      const sortedDvns = (a: string[]) => [...a].map(lower).sort().join(",");
      peerTable.push(
        "| Peer | EID | Peer address | Enforced options | Send lib | Receive lib | Executor / max msg | Send conf / DVNs | Receive conf / DVNs |",
        "|---|---|---|---|---|---|---|---|---|"
      );
      for (const dest of peers) {
        const peer = await ft.peers(dest.eid);
        const options = await ft.enforcedOptions(dest.eid, MSG_TYPE_SEND);
        const sendLib = await endpoint.getSendLibrary(ftAddress, dest.eid);
        const [recvLib, recvDefault] = await endpoint.getReceiveLibrary(ftAddress, dest.eid);
        const [exec] = coder.decode([EXECUTOR_CONFIG], await endpoint.getConfig(ftAddress, sendLib, dest.eid, CONFIG_TYPE_EXECUTOR));
        const [sendUln] = coder.decode([ULN_CONFIG], await endpoint.getConfig(ftAddress, sendLib, dest.eid, CONFIG_TYPE_ULN));
        const [recvUln] = coder.decode([ULN_CONFIG], await endpoint.getConfig(ftAddress, recvLib, dest.eid, CONFIG_TYPE_ULN));

        const checks = {
          peer: same(peer, zeroPadValue(dest.ftTokenAddress!, 32)),
          options: same(options, EXPECTED_ENFORCED_OPTIONS),
          sendLib: same(sendLib, source.sendLibAddress),
          recvLib: same(recvLib, source.receiveLibAddress) && !recvDefault,
          exec: same(exec.executor, source.executorAddress) && exec.maxMessageSize === MAX_MESSAGE_SIZE,
          send: sendUln.confirmations === BigInt(source.confirmations ?? -1) && sortedDvns(sendUln.requiredDVNs) === sortedDvns(source.dvnAddresses),
          recv: recvUln.confirmations === BigInt(dest.confirmations ?? -1) && sortedDvns(recvUln.requiredDVNs) === sortedDvns(source.dvnAddresses),
        };
        const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
        peerTable.push(
          `| ${dest.chainKey} | ${dest.eid} | ${mark(checks.peer)} ${short("0x" + peer.slice(26))} | ${mark(checks.options)} lzReceive 80k | ${mark(checks.sendLib)} ${short(sendLib)} | ${mark(checks.recvLib)} ${short(recvLib)} | ${mark(checks.exec)} ${short(exec.executor)} / ${exec.maxMessageSize} | ${mark(checks.send)} ${sendUln.confirmations} / ${sendUln.requiredDVNs.length} | ${mark(checks.recv)} ${recvUln.confirmations} / ${recvUln.requiredDVNs.length} |`
        );
        finalRows.push(row(`Peer ${dest.chainKey} (${dest.eid}) fully configured`, "yes", Object.values(checks).every(Boolean) ? "yes" : "no"));
      }
    } catch (e: any) {
      fatal = e.shortMessage ?? e.message;
    } finally {
      fork.anvil.kill();
    }

    // Report
    const all = [...preRows, ...deployRows, ...finalRows];
    const failed = all.filter((r) => !r.ok).length + (fatal ? 1 : 0);
    const gasPrice = feeData.gasPrice ?? 0n;
    const maxFee = feeData.maxFeePerGas ?? gasPrice;
    const gasForCost = liveGas ?? deployGasUsed ?? 0n;
    const symbol = NATIVE_SYMBOL[chainId] ?? "native";
    const lines: string[] = [
      `# FT deployment dry run: ${network} (chain ${chainId})`,
      "",
      `**Result: ${failed === 0 ? "✅ all checks passed" : `❌ ${failed} check(s) failed`}**`,
      "",
      `- Generated: ${new Date().toISOString()} · repo commit ${gitInfo()}`,
      `- Live RPC: ${rpcHost(liveUrl)} · live block ${liveBlock} · anvil fork block ${forkBlock}`,
      `- Nothing was sent to the live chain. Deployment and Safe transactions were executed on a local anvil fork with impersonated accounts.`,
      "",
      "## Deployment transaction",
      "",
      `| | |`,
      `|---|---|`,
      `| Deployer | \`${deployer}\` (live pending nonce **${liveNonce}**) |`,
      `| Expected address | \`${chainConfig.deterministic ? FT_DETERMINISTIC_ADDRESS : "n/a (non-deterministic chain)"}\` |`,
      `| Constructor args | \`${JSON.stringify(args)}\` |`,
      `| Init code keccak256 | \`${keccak256(initCode)}\` |`,
      `| Runtime code keccak256 | \`${runtimeHash || "n/a"}\` |`,
      `| Gas (live estimate / fork used) | ${liveGas ?? `estimate failed: ${liveGasError}`} / ${deployGasUsed ?? "n/a"} |`,
      `| Live gas price / max fee | ${formatUnits(gasPrice, "gwei")} gwei / ${formatUnits(maxFee, "gwei")} gwei |`,
      `| Est. cost (at gas price / at max fee) | ${formatEther(gasForCost * gasPrice)} / ${formatEther(gasForCost * maxFee)} ${symbol} |`,
      `| Deployer live balance | ${formatEther(liveBalance)} ${symbol} ${liveBalance >= gasForCost * maxFee ? "✅ sufficient" : "❌ insufficient for max fee"} |`,
      "",
      "## Pre-deploy checks",
      "",
      ...table(preRows),
      "",
      "## State right after deployment",
      "",
      ...(deployRows.length ? table(deployRows) : ["_not reached_"]),
      "",
      "## Simulated post-deploy steps (runbook order)",
      "",
      ...(steps.length ? steps.map((s, i) => `${i + 1}. ${s}`) : ["_not reached_"]),
      "",
      "## Expected final state (after ownership transfer, wiring and unpause)",
      "",
      ...(finalRows.length ? table(finalRows) : ["_not reached_"]),
      "",
      ...(peerTable.length ? ["### LayerZero configuration per peer (this chain's side)", "", ...peerTable, ""] : []),
      ...(fatal ? ["## ❌ Dry run aborted", "", "```", fatal, "```", ""] : []),
      "> Only this chain's side is simulated. The matching `ft:wire --chains <this chain>` batches on the peer chains",
      "> (setPeer/config pointing back here) must also be executed for messages to flow.",
      "",
    ];
    const report = lines.join("\n");
    console.log("\n" + report);

    const out = taskArgs.out ?? path.join("dry-runs", `${network}.md`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, report);
    console.log(`Report written to ${out}`);
    if (failed > 0) process.exitCode = 1;
  });

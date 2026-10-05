/**
 * FT production audit script (LayerZero OFT mesh).
 *
 * Focus: prevent "wrong peer" / miswired ULN configuration leading to unauthorized minting.
 *
 * What it checks (for each chain in CHAINS):
 * - FT contract metadata + roles (owner/configurator) + paused state
 * - LayerZero endpoint + endpoint delegate
 * - Peer mapping for every other chain in the mesh
 * - Enforced options for SEND msgType (1)
 * - Endpoint message libraries + explicit receive-library pinning + executor/maxMessageSize config
 * - ULN302 send/receive config (confirmations + 2 required DVNs + 2-of-3 optional DVNs)
 * - Global supply invariant (sum across chains <= initial mint)
 *
 * Usage:
 *   npx hardhat run scripts/audit-prod.ts --network hardhat
 *
 * Notes:
 * - This script creates its own RPC providers for each chain using hardhat.config.ts URLs.
 * - Override RPC URLs via RPC_URL_* env vars as usual.
 */

import hre from "hardhat";
import { ethers } from "ethers";
import { Options } from "@layerzerolabs/lz-v2-utilities";

import { getChainConfig } from "../utils/constants";
import { LayerZeroBaseManager } from "../tasks/BaseManager";
import { ChainMetadata } from "../tasks/types";
import { FT__factory } from "../typechain-types/factories/contracts/FT__factory";
import { ILayerZeroEndpointV2__factory } from "../typechain-types/factories/@layerzerolabs/lz-evm-protocol-v2/contracts/interfaces/ILayerZeroEndpointV2__factory";

type Status = "PASS" | "WARN" | "FAIL";

type ChainKey = "ethereum" | "avalanche" | "base" | "bsc" | "sonic";

const CHAINS: ChainKey[] = ["ethereum", "avalanche", "base", "bsc", "sonic"];

const EXPECTED_TOKEN_NAME = "Flying Tulip";
const EXPECTED_TOKEN_SYMBOL = "FT";
const EXPECTED_DECIMALS = 18n;
const INITIAL_MINT = 10_000_000_000n * 10n ** 18n;

const MSG_TYPE_SEND = 1;
const EXPECTED_ENFORCED_OPTIONS = Options.newOptions()
  .addExecutorLzReceiveOption(80000, 0)
  .toHex()
  .toString();

const REQUIRED_DVN_NAMES = ["LayerZero Labs", "Canary"] as const;
const OPTIONAL_DVN_NAMES = ["Deutsche Telekom", "Horizen", "Nethermind"] as const;

const EXPECTED_REQUIRED_DVN_COUNT = BigInt(REQUIRED_DVN_NAMES.length);
const EXPECTED_OPTIONAL_DVN_COUNT = BigInt(OPTIONAL_DVN_NAMES.length);
const EXPECTED_OPTIONAL_DVN_THRESHOLD = 2n;

const ULN_CONFIG_ABI = [
  "function getAppUlnConfig(address oapp, uint32 remoteEid) view returns (tuple(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs))",
];

interface CheckResult {
  chain: ChainKey | "global";
  check: string;
  status: Status;
  expected?: string;
  actual?: string;
}

interface ExpectedDvnConfig {
  required: string[];
  optional: string[];
}

function normalizeAddress(addr: string): string {
  return addr.toLowerCase();
}

function isEqualAddress(a: string, b: string): boolean {
  return normalizeAddress(a) === normalizeAddress(b);
}

function formatAddresses(addresses: string[]): string {
  return addresses.map(normalizeAddress).join(",");
}

function getExpectedDvns(metadata: Record<string, ChainMetadata>, chain: ChainKey): ExpectedDvnConfig {
  const chainMetadata = metadata[chain];
  if (!chainMetadata) throw new Error(`Missing LayerZero metadata for chain '${chain}'`);

  const activeDvns = Object.entries(chainMetadata.dvns).filter(
    ([_, dvn]) => dvn.version === 2 && !dvn.deprecated && !dvn.lzReadCompatible
  );

  const findDvns = (names: readonly string[]): string[] =>
    activeDvns
      .filter(([_, dvn]) => names.includes(dvn.canonicalName))
      .map(([address]) => address)
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const required = findDvns(REQUIRED_DVN_NAMES);
  const optional = findDvns(OPTIONAL_DVN_NAMES);

  if (required.length !== REQUIRED_DVN_NAMES.length) {
    throw new Error(
      `Expected ${REQUIRED_DVN_NAMES.length} required DVNs for ${chain}; found ${required.length}: ${required.join(",")}`
    );
  }

  if (optional.length !== OPTIONAL_DVN_NAMES.length) {
    throw new Error(
      `Expected ${OPTIONAL_DVN_NAMES.length} optional DVNs for ${chain}; found ${optional.length}: ${optional.join(",")}`
    );
  }

  return { required, optional };
}

function statusWeight(status: Status): number {
  if (status === "FAIL") return 2;
  if (status === "WARN") return 1;
  return 0;
}

const CHAIN_CALL_DELAY_MS: Partial<Record<ChainKey, number>> = {
  // Public Ethereum RPCs are commonly rate limited; avoid bursty call patterns.
  ethereum: 125,
  base: 125,
  bsc: 125,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isRateLimitError(err: unknown): boolean {
  const msg = getErrorMessage(err).toLowerCase();
  if (msg.includes("rate limit") || msg.includes("too many requests") || msg.includes("429")) return true;

  const anyErr = err as any;
  const nested = String(anyErr?.info?.error?.message ?? anyErr?.error?.message ?? "").toLowerCase();
  return (
    nested.includes("rate limit") ||
    nested.includes("over rate limit") ||
    nested.includes("too many requests") ||
    nested.includes("429")
  );
}

async function withRetry<T>(chain: ChainKey, label: string, fn: () => Promise<T>): Promise<T> {
  const maxAttempts = 8;
  let delayMs = 250;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const value = await fn();
      const postDelay = CHAIN_CALL_DELAY_MS[chain] ?? 0;
      if (postDelay > 0) await sleep(postDelay);
      return value;
    } catch (err) {
      const isRateLimited = isRateLimitError(err);
      const isLastAttempt = attempt === maxAttempts;
      if (!isRateLimited || isLastAttempt) {
        throw err;
      }

      console.warn(`[${chain}] ${label}: rate limited; retrying in ${delayMs}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 5000);
    }
  }

  // Unreachable, but satisfies TS control flow.
  throw new Error(`[${chain}] ${label}: exhausted retries`);
}

async function getRpcUrl(chain: ChainKey): Promise<string> {
  const network = hre.config.networks[chain] as unknown as { url?: string };
  const url = network?.url;
  if (!url) throw new Error(`Missing RPC url for hardhat network '${chain}'`);
  return url;
}

function formatBigint(n: bigint): string {
  return n.toString();
}

function pass(chain: CheckResult["chain"], check: string, actual?: string): CheckResult {
  return { chain, check, status: "PASS", actual };
}

function warn(
  chain: CheckResult["chain"],
  check: string,
  expected: string | undefined,
  actual: string | undefined
): CheckResult {
  return { chain, check, status: "WARN", expected, actual };
}

function fail(
  chain: CheckResult["chain"],
  check: string,
  expected: string | undefined,
  actual: string | undefined
): CheckResult {
  return { chain, check, status: "FAIL", expected, actual };
}

function printResults(results: CheckResult[]): void {
  const byChain = new Map<CheckResult["chain"], CheckResult[]>();
  for (const r of results) {
    if (!byChain.has(r.chain)) byChain.set(r.chain, []);
    byChain.get(r.chain)!.push(r);
  }

  const chains = Array.from(byChain.keys());
  for (const chain of chains) {
    const chainResults = byChain.get(chain)!;
    const failCount = chainResults.filter((r) => r.status === "FAIL").length;
    const warnCount = chainResults.filter((r) => r.status === "WARN").length;
    console.log(`\n=== ${chain.toString().toUpperCase()} (${failCount} FAIL, ${warnCount} WARN) ===`);
    for (const r of chainResults) {
      const prefix = r.status === "PASS" ? "[PASS]" : r.status === "WARN" ? "[WARN]" : "[FAIL]";
      console.log(`${prefix} ${r.check}${r.actual ? `: ${r.actual}` : ""}`);
      if (r.status !== "PASS") {
        if (r.expected != null) console.log(`   Expected: ${r.expected}`);
        if (r.actual != null) console.log(`   Actual:   ${r.actual}`);
      }
    }
  }

  const score = results.reduce((acc, r) => acc + statusWeight(r.status), 0);
  const failTotal = results.filter((r) => r.status === "FAIL").length;
  const warnTotal = results.filter((r) => r.status === "WARN").length;
  console.log(`\n=== SUMMARY ===`);
  console.log(`Checks: ${results.length} | FAIL: ${failTotal} | WARN: ${warnTotal} | Score: ${score}`);
}

async function audit(): Promise<number> {
  console.log("============================================================");
  console.log("FT PRODUCTION AUDIT (LayerZero OFT mesh)");
  console.log("============================================================");
  console.log(`Chains: ${CHAINS.join(", ")}`);
  console.log(`Expected token: ${EXPECTED_TOKEN_NAME} (${EXPECTED_TOKEN_SYMBOL}), decimals=${EXPECTED_DECIMALS}`);
  console.log(`Expected enforced options (SEND): ${EXPECTED_ENFORCED_OPTIONS}`);
  console.log(
    `Expected DVNs: required=${REQUIRED_DVN_NAMES.join(" + ")}; optional=${EXPECTED_OPTIONAL_DVN_THRESHOLD} of ${OPTIONAL_DVN_NAMES.join(
      ", "
    )}`
  );
  console.log(`Initial mint cap (global): ${formatBigint(INITIAL_MINT)}`);

  class AuditorManager extends LayerZeroBaseManager {}
  const auditor = new AuditorManager(hre);
  const metadata = auditor.loadMetadata();
  auditor.buildChainConfigs(metadata, false);

  const expectedDvnsByChain = Object.fromEntries(
    CHAINS.map((chain) => [chain, getExpectedDvns(metadata, chain)])
  ) as Record<ChainKey, ExpectedDvnConfig>;

  const results: CheckResult[] = [];

  const chainState: Partial<Record<ChainKey, { totalSupply: bigint; ftAddress: string }>> = Object.create(null);

  for (const chain of CHAINS) {
    const cfg = auditor.getChainConfig(chain);

    let rpcUrl: string | undefined;
    try {
      rpcUrl = await getRpcUrl(chain);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const network = await withRetry(chain, "provider.getNetwork", () => provider.getNetwork());
      const chainId = network.chainId;

      const expected = getChainConfig(Number(chainId));
      if (!expected) throw new Error(`No utils/constants.ts config for chainId ${chainId} (${chain})`);

      const ftAddress = cfg.ftTokenAddress;
      if (!ftAddress) throw new Error(`Missing FT deployment address for chain '${chain}'`);

      const ft = FT__factory.connect(ftAddress, provider);

      // Basic metadata
      const name = await withRetry(chain, "ft.name", () => ft.name());
      const symbol = await withRetry(chain, "ft.symbol", () => ft.symbol());
      const decimals = await withRetry(chain, "ft.decimals", () => ft.decimals());
      if (name === EXPECTED_TOKEN_NAME) results.push(pass(chain, "Token name", name));
      else results.push(fail(chain, "Token name", EXPECTED_TOKEN_NAME, name));

      if (symbol === EXPECTED_TOKEN_SYMBOL) results.push(pass(chain, "Token symbol", symbol));
      else results.push(fail(chain, "Token symbol", EXPECTED_TOKEN_SYMBOL, symbol));

      const decimalsBig = BigInt(decimals);
      if (decimalsBig === EXPECTED_DECIMALS) results.push(pass(chain, "Token decimals", decimals.toString()));
      else results.push(fail(chain, "Token decimals", EXPECTED_DECIMALS.toString(), decimals.toString()));

      // Roles + pause
      const owner = await withRetry(chain, "ft.owner", () => ft.owner());
      const configurator = await withRetry(chain, "ft.configurator", () => ft.configurator());
      const paused = await withRetry(chain, "ft.paused", () => ft.paused());
      const totalSupply = await withRetry(chain, "ft.totalSupply", () => ft.totalSupply());

      if (isEqualAddress(owner, expected.finalOwner)) results.push(pass(chain, "Owner (final owner)", owner));
      else results.push(fail(chain, "Owner (final owner)", expected.finalOwner, owner));

      if (isEqualAddress(configurator, expected.configurator))
        results.push(pass(chain, "Configurator", configurator));
      else results.push(fail(chain, "Configurator", expected.configurator, configurator));

      results.push(pass(chain, "Paused", paused.toString()));

      // Owner/configurator should be contracts (Safe, Timelock, etc) in production.
      const ownerCode = await withRetry(chain, "provider.getCode(owner)", () => provider.getCode(owner));
      const configuratorCode = await withRetry(chain, "provider.getCode(configurator)", () =>
        provider.getCode(configurator)
      );
      if (ownerCode.length > 2) results.push(pass(chain, "Owner is contract", owner));
      else results.push(warn(chain, "Owner is contract", "contract", "EOA"));

      if (configuratorCode.length > 2) results.push(pass(chain, "Configurator is contract", configurator));
      else results.push(warn(chain, "Configurator is contract", "contract", "EOA"));

    // Endpoint + delegate
    const endpointAddress = await withRetry(chain, "ft.endpoint", () => ft.endpoint());
    if (isEqualAddress(endpointAddress, expected.endpointV2))
      results.push(pass(chain, "EndpointV2", endpointAddress));
    else results.push(fail(chain, "EndpointV2", expected.endpointV2, endpointAddress));

    const endpoint = ILayerZeroEndpointV2__factory.connect(endpointAddress, provider);

    // Endpoint delegate mapping isn't in the interface, but the endpoint implements it.
    const endpointDelegateAbi = ["function delegates(address) view returns (address)"];
    const endpointWithDelegate = new ethers.Contract(endpointAddress, endpointDelegateAbi, provider);
    const endpointDelegate: string = await withRetry(chain, "endpoint.delegates(oapp)", () =>
      endpointWithDelegate.delegates(ftAddress)
    );
    if (isEqualAddress(endpointDelegate, expected.delegate))
      results.push(pass(chain, "Endpoint delegate", endpointDelegate));
    else results.push(fail(chain, "Endpoint delegate", expected.delegate, endpointDelegate));

    // Record supply for global invariant
    chainState[chain] = { totalSupply, ftAddress };
    results.push(pass(chain, "Total supply", totalSupply.toString()));

    // Msg inspector should be unset unless explicitly used
    const msgInspector = await withRetry(chain, "ft.msgInspector", () => ft.msgInspector());
    if (isEqualAddress(msgInspector, ethers.ZeroAddress))
      results.push(pass(chain, "Msg inspector", msgInspector));
    else results.push(warn(chain, "Msg inspector", ethers.ZeroAddress, msgInspector));

    // Per-destination checks: peers + enforced options + endpoint config + ULN config
    for (const destChain of CHAINS) {
      if (destChain === chain) continue;
      const destCfg = auditor.getChainConfig(destChain);
      const destEid = destCfg.eid;

      // 1) Peer mapping (critical)
      const peer = await withRetry(chain, `ft.peers(${destEid})`, () => ft.peers(destEid));
      const expectedPeer = ethers.zeroPadValue(destCfg.ftTokenAddress!, 32);
      if (peer === expectedPeer) results.push(pass(chain, `Peer[${destChain}]`, peer));
      else results.push(fail(chain, `Peer[${destChain}]`, expectedPeer, peer));

      // 2) Enforced options (availability)
      const enforced = await withRetry(chain, `ft.enforcedOptions(${destEid},${MSG_TYPE_SEND})`, () =>
        ft.enforcedOptions(destEid, MSG_TYPE_SEND)
      );
      if (enforced === EXPECTED_ENFORCED_OPTIONS)
        results.push(pass(chain, `EnforcedOptions[${destChain}]`, enforced));
      else if (enforced.length > 2)
        results.push(warn(chain, `EnforcedOptions[${destChain}]`, EXPECTED_ENFORCED_OPTIONS, enforced));
      else results.push(warn(chain, `EnforcedOptions[${destChain}]`, EXPECTED_ENFORCED_OPTIONS, "0x"));

      // 3) Endpoint message libs
      const sendLib = await withRetry(chain, `endpoint.getSendLibrary(${destEid})`, () =>
        endpoint.getSendLibrary(ftAddress, destEid)
      );
      const recvLibRes = await withRetry(chain, `endpoint.getReceiveLibrary(${destEid})`, () =>
        endpoint.getReceiveLibrary(ftAddress, destEid)
      );
      const receiveLib = recvLibRes[0];
      const receiveLibIsDefault = recvLibRes[1];

      if (isEqualAddress(sendLib, cfg.sendLibAddress))
        results.push(pass(chain, `Send library[${destChain}]`, sendLib));
      else results.push(fail(chain, `Send library[${destChain}]`, cfg.sendLibAddress, sendLib));

      if (isEqualAddress(receiveLib, cfg.receiveLibAddress))
        results.push(pass(chain, `Receive library[${destChain}]`, receiveLib));
      else results.push(fail(chain, `Receive library[${destChain}]`, cfg.receiveLibAddress, receiveLib));

      if (receiveLibIsDefault === false) results.push(pass(chain, `Receive library pinned[${destChain}]`, "true"));
      else results.push(fail(chain, `Receive library pinned[${destChain}]`, "isDefault=false", "isDefault=true"));

      // 4) Executor / maxMessageSize
      const rawExecCfg = await withRetry(chain, `endpoint.getConfig(${destEid},1)`, () =>
        endpoint.getConfig(ftAddress, cfg.sendLibAddress, destEid, 1)
      );
      const execCfg = ethers.AbiCoder.defaultAbiCoder().decode(
        ["tuple(uint32 maxMessageSize, address executor)"],
        rawExecCfg
      )[0];

      const maxMessageSize: bigint = execCfg.maxMessageSize;
      const executor: string = execCfg.executor;

      if (maxMessageSize === 10_000n)
        results.push(pass(chain, `MaxMessageSize[${destChain}]`, maxMessageSize.toString()));
      else results.push(fail(chain, `MaxMessageSize[${destChain}]`, "10000", maxMessageSize.toString()));

      if (isEqualAddress(executor, cfg.executorAddress))
        results.push(pass(chain, `Executor[${destChain}]`, executor));
      else results.push(fail(chain, `Executor[${destChain}]`, cfg.executorAddress, executor));

      // 5) ULN configs (custom, on the library)
      const sendLibContract = new ethers.Contract(cfg.sendLibAddress, ULN_CONFIG_ABI, provider);
      const recvLibContract = new ethers.Contract(cfg.receiveLibAddress, ULN_CONFIG_ABI, provider);

      const sendUln = await withRetry(chain, `sendUln.getAppUlnConfig(${destEid})`, () =>
        sendLibContract.getAppUlnConfig(ftAddress, destEid)
      );
      const recvUln = await withRetry(chain, `recvUln.getAppUlnConfig(${destEid})`, () =>
        recvLibContract.getAppUlnConfig(ftAddress, destEid)
      );

      // tuple indices: 0 confirmations, 1 requiredDVNCount, 2 optionalDVNCount, 3 optionalDVNThreshold, 4 requiredDVNs, 5 optionalDVNs
      const sendConfirmations: bigint = sendUln[0];
      const sendRequiredDVNCount: bigint = sendUln[1];
      const sendOptionalDVNCount: bigint = sendUln[2];
      const sendOptionalDVNThreshold: bigint = sendUln[3];
      const sendRequiredDVNs: string[] = sendUln[4];
      const sendOptionalDVNs: string[] = sendUln[5];

      const recvConfirmations: bigint = recvUln[0];
      const recvRequiredDVNCount: bigint = recvUln[1];
      const recvOptionalDVNCount: bigint = recvUln[2];
      const recvOptionalDVNThreshold: bigint = recvUln[3];
      const recvRequiredDVNs: string[] = recvUln[4];
      const recvOptionalDVNs: string[] = recvUln[5];
      const expectedDvns = expectedDvnsByChain[chain];

      const expectedSendConfirmations = cfg.confirmations;
      if (expectedSendConfirmations != null) {
        if (sendConfirmations === BigInt(expectedSendConfirmations))
          results.push(pass(chain, `Send confirmations[${destChain}]`, sendConfirmations.toString()));
        else
          results.push(
            fail(
              chain,
              `Send confirmations[${destChain}]`,
              expectedSendConfirmations.toString(),
              sendConfirmations.toString()
            )
          );
      } else {
        results.push(warn(chain, `Send confirmations[${destChain}]`, "configured", sendConfirmations.toString()));
      }

      if (sendRequiredDVNCount === EXPECTED_REQUIRED_DVN_COUNT)
        results.push(pass(chain, `Send requiredDVNCount[${destChain}]`, sendRequiredDVNCount.toString()));
      else
        results.push(
          fail(
            chain,
            `Send requiredDVNCount[${destChain}]`,
            EXPECTED_REQUIRED_DVN_COUNT.toString(),
            sendRequiredDVNCount.toString()
          )
        );

      const expectedSendRequiredDvns = formatAddresses(expectedDvns.required);
      const actualSendRequiredDvns = formatAddresses(sendRequiredDVNs);
      if (expectedSendRequiredDvns === actualSendRequiredDvns)
        results.push(pass(chain, `Send requiredDVNs[${destChain}]`, sendRequiredDVNs.join(",")));
      else results.push(fail(chain, `Send requiredDVNs[${destChain}]`, expectedSendRequiredDvns, actualSendRequiredDvns));

      if (sendOptionalDVNCount === EXPECTED_OPTIONAL_DVN_COUNT)
        results.push(pass(chain, `Send optionalDVNCount[${destChain}]`, sendOptionalDVNCount.toString()));
      else
        results.push(
          fail(
            chain,
            `Send optionalDVNCount[${destChain}]`,
            EXPECTED_OPTIONAL_DVN_COUNT.toString(),
            sendOptionalDVNCount.toString()
          )
        );

      if (sendOptionalDVNThreshold === EXPECTED_OPTIONAL_DVN_THRESHOLD)
        results.push(pass(chain, `Send optionalDVNThreshold[${destChain}]`, sendOptionalDVNThreshold.toString()));
      else
        results.push(
          fail(
            chain,
            `Send optionalDVNThreshold[${destChain}]`,
            EXPECTED_OPTIONAL_DVN_THRESHOLD.toString(),
            sendOptionalDVNThreshold.toString()
          )
        );

      const expectedSendOptionalDvns = formatAddresses(expectedDvns.optional);
      const actualSendOptionalDvns = formatAddresses(sendOptionalDVNs);
      if (expectedSendOptionalDvns === actualSendOptionalDvns)
        results.push(pass(chain, `Send optionalDVNs[${destChain}]`, sendOptionalDVNs.join(",")));
      else results.push(fail(chain, `Send optionalDVNs[${destChain}]`, expectedSendOptionalDvns, actualSendOptionalDvns));

      const expectedRecvConfirmations = destCfg.confirmations;
      if (expectedRecvConfirmations != null) {
        if (recvConfirmations === BigInt(expectedRecvConfirmations))
          results.push(pass(chain, `Receive confirmations[${destChain}]`, recvConfirmations.toString()));
        else
          results.push(
            fail(
              chain,
              `Receive confirmations[${destChain}]`,
              expectedRecvConfirmations.toString(),
              recvConfirmations.toString()
            )
          );
      } else {
        results.push(warn(chain, `Receive confirmations[${destChain}]`, "configured", recvConfirmations.toString()));
      }

      if (recvRequiredDVNCount === EXPECTED_REQUIRED_DVN_COUNT)
        results.push(pass(chain, `Receive requiredDVNCount[${destChain}]`, recvRequiredDVNCount.toString()));
      else
        results.push(
          fail(
            chain,
            `Receive requiredDVNCount[${destChain}]`,
            EXPECTED_REQUIRED_DVN_COUNT.toString(),
            recvRequiredDVNCount.toString()
          )
        );

      const expectedRecvRequiredDvns = formatAddresses(expectedDvns.required);
      const actualRecvRequiredDvns = formatAddresses(recvRequiredDVNs);
      if (expectedRecvRequiredDvns === actualRecvRequiredDvns)
        results.push(pass(chain, `Receive requiredDVNs[${destChain}]`, recvRequiredDVNs.join(",")));
      else
        results.push(
          fail(chain, `Receive requiredDVNs[${destChain}]`, expectedRecvRequiredDvns, actualRecvRequiredDvns)
        );

      if (recvOptionalDVNCount === EXPECTED_OPTIONAL_DVN_COUNT)
        results.push(pass(chain, `Receive optionalDVNCount[${destChain}]`, recvOptionalDVNCount.toString()));
      else
        results.push(
          fail(
            chain,
            `Receive optionalDVNCount[${destChain}]`,
            EXPECTED_OPTIONAL_DVN_COUNT.toString(),
            recvOptionalDVNCount.toString()
          )
        );

      if (recvOptionalDVNThreshold === EXPECTED_OPTIONAL_DVN_THRESHOLD)
        results.push(pass(chain, `Receive optionalDVNThreshold[${destChain}]`, recvOptionalDVNThreshold.toString()));
      else
        results.push(
          fail(
            chain,
            `Receive optionalDVNThreshold[${destChain}]`,
            EXPECTED_OPTIONAL_DVN_THRESHOLD.toString(),
            recvOptionalDVNThreshold.toString()
          )
        );

      const expectedRecvOptionalDvns = formatAddresses(expectedDvns.optional);
      const actualRecvOptionalDvns = formatAddresses(recvOptionalDVNs);
      if (expectedRecvOptionalDvns === actualRecvOptionalDvns)
        results.push(pass(chain, `Receive optionalDVNs[${destChain}]`, recvOptionalDVNs.join(",")));
      else
        results.push(fail(chain, `Receive optionalDVNs[${destChain}]`, expectedRecvOptionalDvns, actualRecvOptionalDvns));
      }
    } catch (err) {
      results.push(
        fail(
          chain,
          "Chain audit",
          "complete",
          `${rpcUrl ?? "<missing rpc url>"} | ${getErrorMessage(err)}`
        )
      );
      continue;
    }
  }

  // Global supply invariant (cap)
  const missingSupplyChains = CHAINS.filter((c) => chainState[c] == null);
  if (missingSupplyChains.length > 0) {
    results.push(
      fail(
        "global",
        "Global supply (sum)",
        "all chains reachable",
        `missing: ${missingSupplyChains.join(", ")}`
      )
    );
  } else {
    const supplySum = CHAINS.reduce((acc, c) => acc + chainState[c]!.totalSupply, 0n);
    if (supplySum > INITIAL_MINT) {
      results.push(
        fail("global", "Global supply (sum)", `<= ${formatBigint(INITIAL_MINT)}`, formatBigint(supplySum))
      );
    } else if (supplySum < INITIAL_MINT) {
      results.push(warn("global", "Global supply (sum)", formatBigint(INITIAL_MINT), formatBigint(supplySum)));
    } else {
      results.push(pass("global", "Global supply (sum)", formatBigint(supplySum)));
    }
  }

  printResults(results);

  const failCount = results.filter((r) => r.status === "FAIL").length;
  return failCount === 0 ? 0 : 1;
}

if (require.main === module) {
  audit()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

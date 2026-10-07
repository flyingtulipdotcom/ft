import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn, ChildProcess } from "node:child_process";
import { task, types } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const FT_DEPLOYER = "0x44820497f8FE95A258A9522f0De2c04ab2bC3da3";

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function rpc(url: string, method: string, params: unknown[] = []): Promise<any> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = await response.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

/**
 * Rehearse `hardhat deploy --tags FT --network <network>` against a local Anvil fork of that network.
 * The live chain only serves fork reads; every transaction goes to the local fork.
 * Run: npx hardhat ft:dry-run-deploy --network monad
 */
task("ft:dry-run-deploy", "Rehearse the FT deployment on a local Anvil fork of --network (nothing is sent to the live chain)")
  .addFlag("keystore", "Decrypt KEYSTORE_PATH and validate its address; the real key never signs during the rehearsal")
  .addFlag("yes", "Answer 'yes' to the deployment confirmation prompt automatically")
  .addFlag("verify", "Also attempt Etherscan verification (always fails in a dry run: the contract only exists on the fork)")
  .addOptionalParam("block", "Fork block number (default: latest)", undefined, types.int)
  .setAction(async (args: { keystore: boolean; yes: boolean; verify: boolean; block?: number }, hre: HardhatRuntimeEnvironment) => {
    const network = hre.network.name;
    const liveUrl = (hre.network.config as any).url as string | undefined;
    if (!liveUrl) throw new Error(`--network ${network} has no RPC URL; use a live network such as monad or robinhood`);
    if (args.keystore && !process.env.KEYSTORE_PATH) {
      throw new Error("--keystore requires KEYSTORE_PATH; refusing to fall back to a mnemonic or private key");
    }

    const port = await freePort();
    const forkUrl = `http://127.0.0.1:${port}`;
    const chainId = Number(await rpc(liveUrl, "eth_chainId"));
    const configuredChainId = Number((hre.network.config as any).chainId);
    if (Number.isFinite(configuredChainId) && chainId !== configuredChainId) {
      throw new Error(`Live RPC chain ${chainId} does not match --network ${network} (${configuredChainId})`);
    }
    const targetAddress = "0x5DD1A7A369e8273371d2DBf9d83356057088082c";
    const [liveNonceBefore, livePendingBefore, liveCodeBefore, latestBlock] = await Promise.all([
      rpc(liveUrl, "eth_getTransactionCount", [FT_DEPLOYER, "latest"]),
      rpc(liveUrl, "eth_getTransactionCount", [FT_DEPLOYER, "pending"]),
      rpc(liveUrl, "eth_getCode", [targetAddress, "latest"]),
      rpc(liveUrl, "eth_blockNumber"),
    ]);
    if (BigInt(liveNonceBefore) !== 0n || BigInt(livePendingBefore) !== 0n) {
      throw new Error(
        `Live ${network} deployer nonce must be 0/0 before rehearsal; found ${BigInt(liveNonceBefore)}/${BigInt(livePendingBefore)}`,
      );
    }
    if (liveCodeBefore !== "0x") {
      throw new Error(`Live ${network} already has code at ${targetAddress}`);
    }
    const forkBlock = args.block ?? Number(latestBlock);
    // Rehearsal records live outside the repository and are deleted afterward.
    // This removes any possibility of overwriting or deleting a real record.
    const rehearsalDeployments = fs.mkdtempSync(path.join(os.tmpdir(), "ft-dry-run-deployments-"));
    const anvilArgs = ["--fork-url", liveUrl, "--port", String(port), "--block-time", "1", "--accounts", "0", "--silent"];
    anvilArgs.push("--fork-block-number", String(forkBlock));
    if (chainId === 143) anvilArgs.push("--network", "monad");
    const anvil: ChildProcess = spawn(process.env.ANVIL_BINARY || "anvil", anvilArgs, { stdio: "ignore" });
    const anvilRunning = () => anvil.exitCode === null && anvil.signalCode === null;
    // Anvil can ignore SIGTERM while fork requests are in flight: escalate to SIGKILL after 3s
    const stopAnvil = async () => {
      if (!anvilRunning()) return;
      anvil.kill("SIGTERM");
      const exited = await Promise.race([
        new Promise<boolean>((r) => anvil.once("exit", () => r(true))),
        new Promise<boolean>((r) => setTimeout(() => r(false), 3000)),
      ]);
      if (!exited && anvilRunning()) anvil.kill("SIGKILL");
    };
    process.once("exit", () => { if (anvilRunning()) anvil.kill("SIGKILL"); });
    let child: ChildProcess | undefined;
    // Ctrl+C must not leave the fork running or a rehearsal record that looks like a real deployment
    const onSignal = async (signal: NodeJS.Signals) => {
      if (child && child.exitCode === null) {
        child.kill("SIGINT");
        await Promise.race([new Promise((r) => child!.once("exit", r)), new Promise((r) => setTimeout(r, 5000))]);
      }
      await stopAnvil();
      fs.rmSync(rehearsalDeployments, { recursive: true, force: true });
      console.log(`\nDRY RUN interrupted (${signal}): stopped the fork and removed its temporary deployment records.`);
      process.exit(130);
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    try {
      for (let i = 0; ; i++) {
        try { await rpc(forkUrl, "eth_blockNumber"); break; } catch {
          if (i > 120) throw new Error("Anvil fork did not start");
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      // Mine one local block: some forked headers (Arbitrum Orbit, e.g. Robinhood) lack blob-gas fields
      await rpc(forkUrl, "evm_mine");
      // Even with --keystore, the local transaction is sent by Anvil
      // impersonation. A production-chain-valid signature is never created.
      await rpc(forkUrl, "anvil_impersonateAccount", [FT_DEPLOYER]);
      const localBlock = Number(await rpc(forkUrl, "eth_blockNumber"));

      console.log("=".repeat(70));
      console.log(`DRY RUN: hardhat deploy --tags FT --network ${network}`);
      console.log(`Local Anvil fork of chain ${chainId} (live RPC host ${new URL(liveUrl).host}), pinned at ${forkBlock}, local block ${localBlock}`);
      console.log(args.keystore
        ? `Keystore: decrypt and validate ${FT_DEPLOYER}; local transactions use Anvil impersonation (no real signature)`
        : `Signer: Anvil-impersonated ${FT_DEPLOYER}`);
      console.log("Nothing is sent to the live chain.");
      console.log(args.verify
        ? "Etherscan verification will be attempted and is expected to fail (the contract only exists on the fork)."
        : "Etherscan verification is skipped in a dry run (use --verify to attempt it).");
      console.log("=".repeat(70));

      const env: NodeJS.ProcessEnv = {
        ...process.env,
        [`RPC_URL_${network.toUpperCase()}`]: forkUrl,
        FT_DEPLOYMENT_MODE: "dry-run",
        FT_DEPLOYMENTS_PATH: rehearsalDeployments,
        FT_DRY_RUN_VALIDATE_KEYSTORE: args.keystore ? "1" : "0",
        FT_DRY_RUN_AUTO_CONFIRM: args.yes ? "yes" : "no",
      };
      // dotenv does not override an existing (empty) variable
      if (!args.keystore) {
        env.KEYSTORE_PATH = "";
        env.MNEMONIC = "";
        env.PRIVATE_KEY = "";
      }
      // deploy/FT.ts skips the Etherscan wait + verification when the key is empty
      if (!args.verify) env.ETHERSCAN_API_KEY = "";
      child = spawn(
        process.execPath,
        [require.resolve("hardhat/internal/cli/cli"), "deploy", "--tags", "FT", "--network", network],
        { cwd: hre.config.paths.root, env, stdio: "inherit" }
      );
      const code: number = await new Promise((resolve) => child!.on("exit", (c) => resolve(c ?? 1)));

      // Prove nothing reached the live chain: the deployer must still be unused there
      const [liveNonce, livePending, liveCode] = await Promise.all([
        rpc(liveUrl, "eth_getTransactionCount", [FT_DEPLOYER, "latest"]),
        rpc(liveUrl, "eth_getTransactionCount", [FT_DEPLOYER, "pending"]),
        rpc(liveUrl, "eth_getCode", [targetAddress, "latest"]),
      ]);
      const untouched = BigInt(liveNonce) === 0n && BigInt(livePending) === 0n && liveCode === "0x";
      console.log("=".repeat(70));
      console.log(`DRY RUN finished with exit code ${code}.`);
      console.log(untouched
        ? `✅ Live ${network} untouched: deployer nonce 0 (pending 0), no code at 0x5DD1…082c`
        : `❌ LIVE ${network} CHANGED: deployer nonce ${BigInt(liveNonce)} (pending ${BigInt(livePending)}), code ${liveCode === "0x" ? "none" : "present"}. Investigate before deploying.`);
      process.exitCode = untouched ? code : 1;
    } finally {
      await stopAnvil();
      fs.rmSync(rehearsalDeployments, { recursive: true, force: true });
      console.log("Removed temporary rehearsal deployment records.");
    }
  });

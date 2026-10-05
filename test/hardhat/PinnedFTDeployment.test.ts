import { expect } from "chai";
import { AbiCoder, ContractFactory, JsonRpcProvider, keccak256 } from "ethers";
import {
  assertPinnedDeploymentReady, buildPinnedFTDeployment, deployPinnedFT, FT_ADDRESS, FT_DEPLOYER,
} from "../../scripts/lib/ft-deployment";
import { assertLocalAnvilFork } from "../../scripts/lib/rollout-fork";
import sonicArtifact from "../../deployments/sonic/FT.json";
import ethereumArtifact from "../../deployments/ethereum/FT.json";

const SONIC_ENDPOINT = "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B";
const ETHEREUM_ENDPOINT = "0x1a44076050125825900e736c501f859c50fE728c";
const MONAD = { chainId: 143, eid: 30390, endpoint: SONIC_ENDPOINT };

async function expectFailure(result: Promise<unknown>, pattern: RegExp) {
  const error = await result.then(() => undefined, (failure: unknown) => failure);
  expect(error).to.be.instanceOf(Error);
  expect((error as Error).message).to.match(pattern);
}

function readinessProvider(overrides: Partial<{
  chainId: number; latest: number; pending: number; targetCode: string;
  deployerCode: string; endpointCode: string; eid: number;
}> = {}) {
  const state = { chainId: 143, latest: 0, pending: 0, targetCode: "0x", deployerCode: "0x", endpointCode: "0x6000", eid: 30390, ...overrides };
  const methods: string[] = [];
  const provider = {
    send: async (method: string, params: string[]) => {
      methods.push(method);
      if (method === "eth_chainId") return `0x${state.chainId.toString(16)}`;
      if (method === "eth_getTransactionCount") {
        expect(params[0]).to.equal(FT_DEPLOYER);
        return `0x${(params[1] === "pending" ? state.pending : state.latest).toString(16)}`;
      }
      if (method === "eth_getCode") {
        const address = params[0].toLowerCase();
        if (address === FT_ADDRESS.toLowerCase()) return state.targetCode;
        if (address === FT_DEPLOYER.toLowerCase()) return state.deployerCode;
        if (address === SONIC_ENDPOINT.toLowerCase()) return state.endpointCode;
      }
      throw new Error(`Unexpected RPC method: ${method}`);
    },
    call: async (transaction: { to: string; data: string }) => {
      methods.push("eth_call");
      expect(transaction.to.toLowerCase()).to.equal(SONIC_ENDPOINT.toLowerCase());
      expect(transaction.data).to.equal("0x416ecebf"); // eid()
      return AbiCoder.defaultAbiCoder().encode(["uint32"], [state.eid]);
    },
  } as unknown as Parameters<typeof assertPinnedDeploymentReady>[0];
  return { provider, methods };
}

function anvilProvider(options: { url?: string; forkConfig?: unknown; chainId?: number; version?: string } = {}) {
  const methods: string[] = [];
  const provider = {
    _getConnection: () => ({ url: options.url || "http://127.0.0.1:18545" }),
    send: async (method: string) => {
      methods.push(method);
      if (method === "web3_clientVersion") return options.version || "anvil/v1.5.0";
      if (method === "eth_chainId") return `0x${(options.chainId || 143).toString(16)}`;
      if (method === "anvil_nodeInfo") return { forkConfig: options.forkConfig === undefined ? { forkBlockNumber: 110000000 } : options.forkConfig };
      throw new Error(`Mutation or unexpected RPC method attempted: ${method}`);
    },
  } as unknown as JsonRpcProvider;
  return { provider, methods };
}

describe("Pinned FT production deployment", function () {
  it("pins the original deployer, nonce, address, and production creation bytes", function () {
    const plan = buildPinnedFTDeployment(MONAD);
    expect(plan.from).to.equal("0x44820497f8FE95A258A9522f0De2c04ab2bC3da3");
    expect(plan.nonce).to.equal(0);
    expect(plan.expectedAddress).to.equal("0x5DD1A7A369e8273371d2DBf9d83356057088082c");
    expect(keccak256(plan.bytecode)).to.equal("0x4831f2deca983f6bd018ca3ba43d98317ad8855cfbdfbe98a74366c542ffb3d3");
    expect(plan.args[5]).to.equal(146);
    expect(plan.runtimeExpectedHash).to.equal("0x39657e228af4878f6158ab11671aa117c30fbd89262ab0f16ed3355391af0c7a");
  });

  for (const [network, chainId] of [["Monad", 143], ["Robinhood", 4663], ["Arc", 5042]] as const) {
    it(`${network} uses the exact recorded Sonic init code`, async function () {
      const plan = buildPinnedFTDeployment({ chainId, endpoint: SONIC_ENDPOINT });
      const original = await new ContractFactory(sonicArtifact.abi, sonicArtifact.bytecode).getDeployTransaction(...sonicArtifact.args);
      expect(plan.data).to.equal(original.data);
      expect(plan.initCodeHash).to.equal("0xaeb36c5db598274a6ab78158fb1799a2b40aaab55a27b6ff28597429d46260dd");
    });
  }

  it("Arbitrum uses the exact recorded Ethereum init code", async function () {
    const plan = buildPinnedFTDeployment({ chainId: 42161, endpoint: ETHEREUM_ENDPOINT });
    const original = await new ContractFactory(ethereumArtifact.abi, ethereumArtifact.bytecode).getDeployTransaction(...ethereumArtifact.args);
    expect(plan.data).to.equal(original.data);
    expect(plan.initCodeHash).to.equal("0x1dfb0a45b5257a0530708ef3be0d8cb1355529330a47c2318118c4c1ddd8adbb");
    expect(plan.runtimeExpectedHash).to.equal("0x8062c2d6646f1c459825821c9d1e582052bd2e7089367d7087545cf6bab8f4c3");
  });

  it("accepts an unused funded-or-unfunded deployer only on the intended chain and endpoint", async function () {
    const { provider, methods } = readinessProvider();
    const result = await assertPinnedDeploymentReady(provider, MONAD);
    expect(result.latestNonce).to.equal(0);
    expect(result.pendingNonce).to.equal(0);
    expect(result.endpointEid).to.equal(30390);
    expect(methods).to.have.members(["eth_chainId", "eth_getTransactionCount", "eth_getTransactionCount", "eth_getCode", "eth_getCode", "eth_getCode", "eth_call"]);
  });

  for (const [description, overrides, error] of [
    ["a wrong RPC chain", { chainId: 1 }, /RPC chain/],
    ["a used confirmed nonce", { latest: 1 }, /confirmed AND pending nonce 0/],
    ["a pending transaction at nonce zero", { pending: 1 }, /confirmed AND pending nonce 0/],
    ["an occupied FT address", { targetCode: "0x6000" }, /already deployed/],
    ["a deployer with account code", { deployerCode: "0x6000" }, /ordinary EOA/],
    ["an absent endpoint", { endpointCode: "0x" }, /endpoint has no code/],
    ["an endpoint with the wrong EID", { eid: 30101 }, /Endpoint EID/],
  ] as const) {
    it(`rejects ${description} before deployment`, async function () {
      const { provider } = readinessProvider(overrides);
      await expectFailure(assertPinnedDeploymentReady(provider, MONAD), error);
    });
  }

  it("rejects a different signing account before any RPC request", async function () {
    const { provider, methods } = readinessProvider();
    await expectFailure(assertPinnedDeploymentReady(provider, MONAD, "0x0000000000000000000000000000000000000001"), /must be deployed by/);
    expect(methods).to.deep.equal([]);
  });
});

describe("Local fork mutation boundary", function () {
  it("refuses a remote RPC before any impersonation or RPC call", async function () {
    const { provider, methods } = anvilProvider({ url: "https://rpc.monad.xyz" });
    await expectFailure(deployPinnedFT(provider, MONAD), /loopback HTTP/);
    expect(methods).to.deep.equal([]);
  });

  it("refuses a loopback node without a pinned fork", async function () {
    const { provider, methods } = anvilProvider({ forkConfig: null });
    await expectFailure(assertLocalAnvilFork(provider, 143), /pinned mainnet fork/);
    expect(methods).to.have.members(["web3_clientVersion", "eth_chainId", "anvil_nodeInfo"]);
  });

  it("refuses a local fork of a different chain", async function () {
    const { provider } = anvilProvider({ chainId: 1 });
    await expectFailure(assertLocalAnvilFork(provider, 143), /does not match expected 143/);
  });

  it("refuses a loopback service that is not Anvil", async function () {
    const { provider } = anvilProvider({ version: "Geth/v1.16" });
    await expectFailure(assertLocalAnvilFork(provider, 143), /not Anvil/);
  });

  it("identifies the pinned local chain without mutating it", async function () {
    const { provider, methods } = anvilProvider();
    const fork = await assertLocalAnvilFork(provider, 143);
    expect(fork.chainId).to.equal(143);
    expect(fork.forkBlockNumber).to.equal(110000000);
    expect(methods).to.have.members(["web3_clientVersion", "eth_chainId", "anvil_nodeInfo"]);
  });
});

import { expect } from "chai";
import hre from "hardhat";
import { ChildProcess } from "child_process";
import { Contract, ContractFactory, JsonRpcProvider, JsonRpcSigner, getCreateAddress, keccak256, parseEther } from "ethers";

import {
  FT_DETERMINISTIC_ADDRESS,
  FT_DETERMINISTIC_DEPLOYER,
  FT_DETERMINISTIC_NONCE,
  getChainConfig,
} from "../../utils/constants";
import {
  FT_CANONICAL_CONFIGURATOR,
  FT_CANONICAL_DELEGATE,
  assertDeterministicDeployment,
  getFTConstructorArgs,
} from "../../utils/deterministic";
import { LayerZeroBaseManager } from "../../tasks/BaseManager";
import { startAnvilFork } from "../../utils/anvilFork";
import type { FT } from "../../typechain-types";

// Fork tests run against live RPCs, so they are opt-in: `pnpm test:fork` (FORK_TESTS=true).
// They use anvil (Foundry, see utils/anvilFork.ts) because, unlike the Hardhat network, an anvil fork
// keeps the real chain id, so block.chainid, getChainConfig() and the mint-chain gating behave as in production.
const FORK_TESTS = process.env.FORK_TESTS === "true";

const SONIC_RPC = process.env.RPC_URL_SONIC || "https://rpc.soniclabs.com";
const SONIC_DEPLOYMENT = require("../../deployments/sonic/FT.json");

const CHAINS = [
  {
    name: "monad",
    chainId: 143,
    eid: 30390,
    rpc: process.env.RPC_URL_MONAD || process.env.MONAD_RPC_URL || "https://rpc.monad.xyz",
  },
  {
    name: "robinhood",
    chainId: 4663,
    eid: 30416,
    rpc: process.env.RPC_URL_ROBINHOOD || process.env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com",
  },
];

class MetadataReader extends LayerZeroBaseManager {}

describe("FT deterministic deployment (Monad, Robinhood)", function () {
  describe("LayerZero wiring metadata", function () {
    const manager = new MetadataReader(hre);
    manager.buildChainConfigs(manager.loadMetadata());

    for (const chain of CHAINS) {
      it(`${chain.name}: eid, endpoint and DVNs resolve for ft:wire`, function () {
        const wire = manager.getChainConfig(chain.name);
        const config = getChainConfig(chain.chainId)!;
        expect(wire.eid).to.equal(chain.eid);
        expect(wire.nativeChainId).to.equal(chain.chainId);
        expect(wire.endpointV2Address.toLowerCase()).to.equal(config.endpointV2.toLowerCase());
        expect(wire.dvnAddresses).to.have.length(2); // LayerZero Labs + Canary
        expect(wire.confirmations).to.equal(config.confirmations);
        expect((hre.config.networks[chain.name] as any).eid).to.equal(chain.eid);
      });
    }
  });

  for (const chain of CHAINS) {
    describe(`${chain.name} fork (chain ${chain.chainId})`, function () {
      this.timeout(300_000);

      let anvil: ChildProcess | undefined;
      let provider: JsonRpcProvider;
      let forkUrl: string;
      let factory: ContractFactory;
      let initCode: string;
      const config = getChainConfig(chain.chainId)!;
      const args = getFTConstructorArgs(config, false);

      before(async function () {
        if (!FORK_TESTS) this.skip();
        ({ anvil, provider, url: forkUrl } = await startAnvilFork(chain.rpc, chain.chainId));
        const artifact = await hre.artifacts.readArtifact("FT");
        factory = new ContractFactory(artifact.abi, artifact.bytecode);
        const deploymentRequest = await factory.getDeployTransaction(...args);
        if (!deploymentRequest.data) throw new Error("Could not build FT init code");
        initCode = deploymentRequest.data;
      });

      after(function () {
        anvil?.kill();
      });

      it("forks the real chain with the deterministic chain config", async function () {
        expect(BigInt(await provider.send("eth_chainId", []))).to.equal(BigInt(chain.chainId));
        expect(config, "missing utils/constants.ts entry").to.not.equal(undefined);
        expect(config.name).to.equal(chain.name);
        expect(config.deterministic).to.equal(true);

        const endpoint = await hre.ethers.getContractAt("ILayerZeroEndpointV2", config.endpointV2);
        expect(await endpoint.connect(provider).eid()).to.equal(BigInt(chain.eid));
      });

      it(`deployer ${FT_DETERMINISTIC_DEPLOYER} is unused and CREATE at nonce 0 gives ${FT_DETERMINISTIC_ADDRESS}`, async function () {
        expect(await provider.getTransactionCount(FT_DETERMINISTIC_DEPLOYER, "latest")).to.equal(FT_DETERMINISTIC_NONCE);
        expect(await provider.getTransactionCount(FT_DETERMINISTIC_DEPLOYER, "pending")).to.equal(FT_DETERMINISTIC_NONCE);
        expect(getCreateAddress({ from: FT_DETERMINISTIC_DEPLOYER, nonce: FT_DETERMINISTIC_NONCE })).to.equal(
          FT_DETERMINISTIC_ADDRESS
        );
        expect(await provider.getCode(FT_DETERMINISTIC_ADDRESS)).to.equal("0x");
      });

      it("deploy config (incl. .env role overrides) uses the canonical roles", async function () {
        expect(args[3].toLowerCase(), "delegate: unset FT_DELEGATE in .env").to.equal(FT_CANONICAL_DELEGATE);
        expect(args[4].toLowerCase(), "configurator: unset FT_CONFIGURATOR in .env").to.equal(FT_CANONICAL_CONFIGURATOR);
        await assertDeterministicDeployment(provider, FT_DETERMINISTIC_DEPLOYER, args, initCode);
      });

      it("deploy pre-checks reject any other deployer", async function () {
        const other = "0x000000000000000000000000000000000000dEaD";
        const error = await assertDeterministicDeployment(provider, other, args, initCode).catch((e: Error) => e);
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.match(/Deployer is/);
      });

      it("deploy pre-checks reject changed init code", async function () {
        const error = await assertDeterministicDeployment(
          provider,
          FT_DETERMINISTIC_DEPLOYER,
          args,
          initCode + "00"
        ).catch((e: Error) => e);
        expect(error).to.be.instanceOf(Error);
        expect((error as Error).message).to.match(/FT init code hash/);
      });

      it("deploy pre-checks reject a target address that already has a nonce or code", async function () {
        const snapshot = await provider.send("evm_snapshot", []);
        try {
          await provider.send("anvil_setNonce", [FT_DETERMINISTIC_ADDRESS, "0x1"]);
          // Fresh provider: ethers caches identical in-flight requests for ~250ms (the previous test made them)
          const fresh = new JsonRpcProvider(forkUrl, undefined, { staticNetwork: true });
          const error = await assertDeterministicDeployment(fresh, FT_DETERMINISTIC_DEPLOYER, args, initCode).catch((e: Error) => e);
          expect(error).to.be.instanceOf(Error);
          expect((error as Error).message).to.match(/already used/);
        } finally {
          await provider.send("evm_revert", [snapshot]);
        }
        expect(await provider.getTransactionCount(FT_DETERMINISTIC_ADDRESS)).to.equal(0);
      });

      it("init code is byte-identical to the live Sonic FT deployment (same endpoint and args)", async function () {
        expect(config.endpointV2.toLowerCase()).to.equal(SONIC_DEPLOYMENT.args[2].toLowerCase());
        const sonic = new JsonRpcProvider(SONIC_RPC);
        const sonicTx = await sonic.getTransaction(SONIC_DEPLOYMENT.transactionHash);
        expect(sonicTx?.from).to.equal(FT_DETERMINISTIC_DEPLOYER);
        expect(sonicTx?.nonce).to.equal(FT_DETERMINISTIC_NONCE);
        const { data } = await factory.getDeployTransaction(...args);
        expect(keccak256(data)).to.equal(keccak256(sonicTx!.data));
      });

      it(`impersonated deployer deploys FT at ${FT_DETERMINISTIC_ADDRESS} with the expected state`, async function () {
        await provider.send("anvil_impersonateAccount", [FT_DETERMINISTIC_DEPLOYER]);
        // Funding via setBalance does not touch the nonce, same as a real incoming transfer
        await provider.send("anvil_setBalance", [FT_DETERMINISTIC_DEPLOYER, "0x" + parseEther("100").toString(16)]);
        const deployer = new JsonRpcSigner(provider, FT_DETERMINISTIC_DEPLOYER);

        const ft = (await factory.connect(deployer).deploy(...args, { nonce: FT_DETERMINISTIC_NONCE })) as unknown as FT;
        const receipt = await ft.deploymentTransaction()!.wait();
        expect(receipt?.status).to.equal(1);
        expect(receipt?.contractAddress).to.equal(FT_DETERMINISTIC_ADDRESS);
        expect(await ft.getAddress()).to.equal(FT_DETERMINISTIC_ADDRESS);

        const [name, symbol, endpointAddress, delegate, configurator] = args;
        expect(await ft.name()).to.equal(name);
        expect(await ft.symbol()).to.equal(symbol);
        expect(await ft.decimals()).to.equal(18n);
        expect((await ft.owner()).toLowerCase()).to.equal(delegate.toLowerCase());
        expect((await ft.configurator()).toLowerCase()).to.equal(configurator.toLowerCase());
        expect(await ft.endpoint()).to.equal(endpointAddress);
        expect(await ft.paused()).to.equal(true);
        expect(await ft.totalSupply()).to.equal(0n); // only Sonic (146) mints
        const domain = await ft.eip712Domain();
        expect(domain.chainId).to.equal(BigInt(chain.chainId));
        expect(domain.verifyingContract).to.equal(FT_DETERMINISTIC_ADDRESS);

        const endpoint = new Contract(endpointAddress, ["function delegates(address) view returns (address)"], provider);
        expect((await endpoint.delegates(FT_DETERMINISTIC_ADDRESS)).toLowerCase()).to.equal(
          delegate.toLowerCase()
        );
      });

      it("fork runtime code matches the live Sonic FT and the real chain's own execution", async function () {
        const forkCode = await provider.getCode(FT_DETERMINISTIC_ADDRESS);
        expect(forkCode).to.not.equal("0x");

        const sonicCode = await new JsonRpcProvider(SONIC_RPC).getCode(FT_DETERMINISTIC_ADDRESS);
        expect(keccak256(forkCode)).to.equal(keccak256(sonicCode));

        // Simulate the creation on the live chain (its own client, not anvil's EVM)
        const { data } = await factory.getDeployTransaction(...args);
        const live = new JsonRpcProvider(chain.rpc);
        const liveCode = await live.call({ from: FT_DETERMINISTIC_DEPLOYER, data });
        expect(keccak256(liveCode)).to.equal(keccak256(forkCode));
      });
    });
  }
});

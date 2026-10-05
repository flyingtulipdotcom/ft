import { expect } from "chai";
import { AbiCoder, Interface, ethers } from "ethers";
import { Options } from "@layerzerolabs/lz-v2-utilities";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { LayerZeroMultiChainWire } from "../../tasks/wire";
import { SafeManager } from "../../tasks/SafeManager";
import { CLIUtils } from "../../tasks/BaseManager";
import type { ChainMetadata } from "../../tasks/types";
import metadataSnapshot from "../../utils/lzMetadata.json";

const FT_ADDRESS = "0x5DD1A7A369e8273371d2DBf9d83356057088082c";
const ULN_TYPE = "tuple(uint64 confirmations,uint8 requiredDVNCount,uint8 optionalDVNCount,uint8 optionalDVNThreshold,address[] requiredDVNs,address[] optionalDVNs)";
const coder = AbiCoder.defaultAbiCoder();
const endpointInterface = new Interface([
  "function setSendLibrary(address oapp,uint32 eid,address library)",
  "function setReceiveLibrary(address oapp,uint32 eid,address library,uint256 gracePeriod)",
  "function setConfig(address oapp,address library,tuple(uint32 eid,uint32 configType,bytes config)[] params)",
]);
const ftInterface = new Interface([
  "function setPeer(uint32 eid,bytes32 peer)",
  "function setEnforcedOptions(tuple(uint32 eid,uint16 msgType,bytes options)[] options)",
]);

// Independent expectations from the established production policy in
// scripts/queue_lz_dvn_config.py, rather than the TypeScript policy builder.
const production = {
  ethereum: {
    confirmations: 15,
    executor: "0x173272739bd7aa6e4e214714048a9fe699453059",
    required: ["0x589dedbd617e0cbcb916a9223f4d1300c294236b", "0xa4fe5a5b9a846458a70cd0748228aed3bf65c2cd"],
    optional: ["0x373a6e5c0c4e89e24819f00aa37ea370917aaff4", "0x380275805876ff19055ea900cdb2b46a94ecf20d", "0xa59ba433ac34d2927232918ef5b2eaafcf130ba5"],
  },
  sonic: {
    confirmations: 20,
    executor: "0x4208d6e27538189bb48e603d6123a94b8abe0a0b",
    required: ["0x282b3386571f7f794450d5789911a9804fa346b4", "0xb2c7832aa8dda878de6f949485f927e9e532e92c"],
    optional: ["0x05aaefdf9db6e0f7d27fa3b6ee099edb33da029e", "0x54dd79f5ce72b51fcbbcb170dd01e32034323565", "0xde79818c75649773fc462e9d3134b23b81741481"],
  },
  bsc: {
    confirmations: 20,
    executor: "0x3ebd570ed38b1b3b4bc886999fcf507e9d584859",
    required: ["0xfa9ba83c102283958b997adc8b44ed3a3cdb5dda", "0xfd6865c841c2d64565562fcc7e05e619a30615f0"],
    optional: ["0x247624e2143504730aec22912ed41f092498bef2", "0x31f748a368a893bdb5abb67ec95f232507601a73", "0xf0a5c5306adbfd4e3dfd5d4b148b451c411d3878"],
  },
};

function metadata(): Record<string, ChainMetadata> {
  return JSON.parse(JSON.stringify(metadataSnapshot));
}

function manager(): LayerZeroMultiChainWire {
  return new LayerZeroMultiChainWire({ ethers } as unknown as HardhatRuntimeEnvironment);
}

function activeProvider(data: ChainMetadata, name: string): string {
  const entry = Object.entries(data.dvns).find(([, dvn]) =>
    dvn.canonicalName === name && dvn.version === 2 && !dvn.deprecated && !dvn.lzReadCompatible
  );
  if (!entry) throw new Error(`Fixture is missing ${name}`);
  return entry[0];
}

describe("LayerZero wiring transaction policy", function () {
  for (const source of ["ethereum", "sonic", "bsc"] as const) {
    const destination = source === "ethereum" ? "sonic" : "ethereum";

    it(`encodes the production security policy in ${source} endpoint transactions`, async function () {
      const wire = manager();
      const input = metadata();
      // Metadata enumeration order must not affect ULN's ascending-address requirement.
      input[source].dvns = Object.fromEntries(Object.entries(input[source].dvns).reverse());
      wire.buildChainConfigs(input, true, [source, destination]);
      const local = wire.getChainConfig(source);
      const remote = wire.getChainConfig(destination);
      const transactions = await (wire as any).prepareEndpointConfig(
        { getAddress: async () => local.endpointV2Address, interface: endpointInterface },
        { getAddress: async () => FT_ADDRESS }, local, remote
      );

      expect(transactions).to.have.length(4);
      for (const tx of transactions) {
        expect(tx.to.toLowerCase()).to.equal(local.endpointV2Address.toLowerCase());
        expect(tx.value).to.equal("0");
        expect(tx.operation).to.equal(0);
      }
      const calls = transactions.map((tx: { data: string }) => endpointInterface.parseTransaction({ data: tx.data })!);
      expect(calls.map((call: any) => call.name)).to.deep.equal([
        "setSendLibrary", "setConfig", "setReceiveLibrary", "setConfig",
      ]);
      for (const call of calls) expect(call.args[0]).to.equal(FT_ADDRESS);
      expect(calls[0].args[1]).to.equal(BigInt(remote.eid));
      expect(calls[0].args[2].toLowerCase()).to.equal(local.sendLibAddress.toLowerCase());
      expect(calls[2].args[1]).to.equal(BigInt(remote.eid));
      expect(calls[2].args[2].toLowerCase()).to.equal(local.receiveLibAddress.toLowerCase());
      expect(calls[2].args[3]).to.equal(0n);
      expect(calls[1].args[1].toLowerCase()).to.equal(local.sendLibAddress.toLowerCase());
      expect(calls[3].args[1].toLowerCase()).to.equal(local.receiveLibAddress.toLowerCase());

      const send = calls[1].args[2];
      const receive = calls[3].args[2];
      expect(send).to.have.length(2);
      expect(receive).to.have.length(1);
      expect(send[0].configType).to.equal(1n);
      const executor = coder.decode(["tuple(uint32 maxMessageSize,address executor)"], send[0].config)[0];
      expect(executor.maxMessageSize).to.equal(10000n);
      expect(executor.executor.toLowerCase()).to.equal(production[source].executor);

      for (const [entry, confirmations] of [
        [send[1], production[source].confirmations],
        [receive[0], production[destination].confirmations],
      ] as const) {
        expect(entry.eid).to.equal(BigInt(remote.eid));
        expect(entry.configType).to.equal(2n);
        const expected = production[source];
        expect(entry.config).to.equal(coder.encode([ULN_TYPE], [[
          confirmations, 2, 3, 2, expected.required, expected.optional,
        ]]));
        const decoded = coder.decode([ULN_TYPE], entry.config)[0];
        expect(decoded.requiredDVNCount).to.equal(2n);
        expect(decoded.optionalDVNCount).to.equal(3n);
        expect(decoded.optionalDVNThreshold).to.equal(2n);
        expect([...decoded.requiredDVNs].map((address: string) => address.toLowerCase())).to.deep.equal(expected.required);
        expect([...decoded.optionalDVNs].map((address: string) => address.toLowerCase())).to.deep.equal(expected.optional);
      }
    });
  }

  it("keeps testnets at one required DVN and explicitly disables optional DVNs", function () {
    const wire = manager();
    wire.buildChainConfigs(metadata(), true, ["sepolia", "bsc-testnet"]);
    const source = wire.getChainConfig("sepolia");
    const remote = wire.getChainConfig("bsc-testnet");
    const send = (wire as any).buildSendConfig(source, remote)[1];
    const receive = (wire as any).buildReceiveConfig(source, remote)[0];
    for (const [entry, confirmations] of [[send, 15], [receive, 12]] as const) {
      expect(entry.config).to.equal(coder.encode([ULN_TYPE], [[
        confirmations, 1, 255, 0, ["0x8eebf8b423b73bfca51a1db4b7354aa0bfca9193"], [],
      ]]));
    }
  });

  for (const provider of ["LayerZero Labs", "Canary", "Nethermind", "Horizen", "Deutsche Telekom"]) {
    it(`rejects selected-chain metadata missing ${provider} before preparing transactions`, function () {
      const input = metadata();
      delete input.ethereum.dvns[activeProvider(input.ethereum, provider)];
      expect(() => manager().buildChainConfigs(input, true, ["ethereum"]))
        .to.throw(new RegExp(provider));
    });
  }

  for (const provider of ["Canary", "Nethermind"]) {
    it(`rejects ambiguous active ${provider} providers`, function () {
      const input = metadata();
      input.ethereum.dvns["0x0000000000000000000000000000000000000001"] = {
        ...input.ethereum.dvns[activeProvider(input.ethereum, provider)],
      };
      expect(() => manager().buildChainConfigs(input, true, ["ethereum"]))
        .to.throw(new RegExp(provider));
    });
  }

  it("ignores deprecated, read-only, and V1 provider entries", function () {
    const input = metadata();
    const active = input.ethereum.dvns[activeProvider(input.ethereum, "Nethermind")];
    input.ethereum.dvns["0x0000000000000000000000000000000000000001"] = { ...active, deprecated: true };
    input.ethereum.dvns["0x0000000000000000000000000000000000000002"] = { ...active, lzReadCompatible: true };
    input.ethereum.dvns["0x0000000000000000000000000000000000000003"] = { ...active, version: 1 };
    const wire = manager();
    wire.buildChainConfigs(input, true, ["ethereum"]);
    expect(wire.getChainConfig("ethereum").optionalDvnAddresses.map((address) => address.toLowerCase()))
      .to.deep.equal(production.ethereum.optional);
  });

  it("ignores incomplete metadata outside the requested chain selection", function () {
    const input = metadata();
    input.sonic.dvns = {};
    const wire = manager();
    expect(() => wire.buildChainConfigs(input, true, ["ethereum"])).not.to.throw();
    expect(wire.getChainConfig("ethereum").optionalDvnThreshold).to.equal(2);
    expect(() => wire.getChainConfig("sonic")).to.throw();
  });

  it("allows peer-only configuration without a DVN policy", function () {
    const input = metadata();
    input.ethereum.dvns = {};
    const wire = manager();
    expect(() => wire.buildChainConfigs(input, false, ["ethereum"])).not.to.throw();
    expect(wire.getChainConfig("ethereum").ftTokenAddress).to.equal(FT_ADDRESS);
  });

  it("rejects endpoint configuration built from peer-only metadata", async function () {
    const wire = manager();
    wire.buildChainConfigs(metadata(), false, ["ethereum", "sonic"]);
    const local = wire.getChainConfig("ethereum");
    const remote = wire.getChainConfig("sonic");
    const error = await (wire as any).prepareEndpointConfig(
      { getAddress: async () => local.endpointV2Address, interface: endpointInterface },
      { getAddress: async () => FT_ADDRESS }, local, remote
    ).then(() => undefined, (failure: unknown) => failure);
    expect(error).to.be.instanceOf(Error);
    expect((error as Error).message).to.match(/DVN/i);
  });

  for (const useSafe of [false, true]) {
    it(`previews endpoint and peer calldata without signing in ${useSafe ? "Safe" : "direct"} mode`, async function () {
      const source = metadata().ethereum.deployments.find((deployment) => deployment.version === 2)!;
      const forbidden = async () => { throw new Error("Dry run attempted signing or submission"); };
      const readOnlyProvider = { getSigner: forbidden, sendTransaction: forbidden };
      const endpoint = {
        interface: endpointInterface,
        getAddress: async () => source.endpointV2.address,
        defaultSendLibrary: async () => source.sendUln302.address,
        defaultReceiveLibrary: async () => source.receiveUln302.address,
      };
      const ft = { interface: ftInterface, getAddress: async () => FT_ADDRESS };
      const hre = {
        network: { name: "ethereum" },
        getChainId: async () => "1",
        deployments: { get: async () => ({ address: FT_ADDRESS }) },
        artifacts: {
          readArtifact: async (name: string) => {
            if (name === "FT") return { abi: ftInterface.fragments };
            if (name === "ILayerZeroEndpointV2") return { abi: endpointInterface.fragments };
            throw new Error(`Unexpected artifact lookup: ${name}`);
          },
        },
        ethers: {
          ...ethers,
          provider: readOnlyProvider,
          getSigners: forbidden,
          getSigner: forbidden,
          getContractAt: forbidden,
          Contract: class {
            constructor(address: string, _abi: unknown, runner: unknown) {
              expect(runner).to.equal(readOnlyProvider);
              if (address === FT_ADDRESS) return ft;
              if (address === source.endpointV2.address) return endpoint;
              throw new Error(`Unexpected contract address: ${address}`);
            }
          },
        },
      } as unknown as HardhatRuntimeEnvironment;

      const originalInitialize = SafeManager.prototype.initialize;
      const originalPropose = SafeManager.prototype.proposeSafeBatchTransaction;
      const originalLog = console.log;
      const output: string[] = [];
      SafeManager.prototype.initialize = forbidden;
      SafeManager.prototype.proposeSafeBatchTransaction = forbidden;
      console.log = (...args: unknown[]) => { output.push(args.map(String).join(" ")); };
      try {
        await CLIUtils.printTaskHeader("Wiring preview", ["sonic"], useSafe, hre, {}, true);
        const wire = new LayerZeroMultiChainWire(hre, useSafe);
        wire.buildChainConfigs(metadata(), true, ["ethereum", "sonic"]);
        await wire.wireMultipleChains(["sonic"], true);
      } finally {
        SafeManager.prototype.initialize = originalInitialize;
        SafeManager.prototype.proposeSafeBatchTransaction = originalPropose;
        console.log = originalLog;
      }

      const batches = output.filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
      expect(batches.map((batch) => batch.role)).to.deep.equal(["delegate", "owner"]);
      expect(batches.every((batch) => batch.chain === "ethereum")).to.equal(true);
      expect(batches[0].transactions).to.have.length(4);
      expect(batches[1].transactions).to.have.length(2);
      const send = endpointInterface.parseTransaction({ data: batches[0].transactions[1].data })!;
      expect(send.args[2][1].config).to.equal(coder.encode([ULN_TYPE], [[
        15, 2, 3, 2, production.ethereum.required, production.ethereum.optional,
      ]]));
      const peer = ftInterface.parseTransaction({ data: batches[1].transactions[0].data })!;
      expect(peer.name).to.equal("setPeer");
      expect(peer.args[0]).to.equal(30332n);
      expect(peer.args[1]).to.equal(ethers.zeroPadValue(FT_ADDRESS, 32).toLowerCase());
      const options = ftInterface.parseTransaction({ data: batches[1].transactions[1].data })!;
      expect(options.name).to.equal("setEnforcedOptions");
      expect(options.args[0][0].eid).to.equal(30332n);
      expect(options.args[0][0].msgType).to.equal(1n);
      const receive = Options.fromOptions(options.args[0][0].options).decodeExecutorLzReceiveOption()!;
      expect(receive.gas).to.equal(80000n);
      expect(receive.value).to.equal(0n);
    });
  }
});

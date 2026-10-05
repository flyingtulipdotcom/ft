import { expect } from "chai";
import { Contract, Interface } from "ethers";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { runDeploymentCheck } from "../../scripts/check-deployment";
import { getChainConfig } from "../../utils/constants";
import productionArtifact from "../../deployments/sonic/FT.json";

const FT_ADDRESS = "0x5DD1A7A369e8273371d2DBf9d83356057088082c";

function checkerRuntime(totalSupply = 0n) {
  const config = getChainConfig(143)!;
  const abi = productionArtifact.abi;
  const contractInterface = new Interface(abi);
  const reads: string[] = [];
  const values: Record<string, unknown[]> = {
    name: ["Flying Tulip"], symbol: ["FT"], decimals: [18],
    configurator: [config.configurator], owner: [config.delegate], endpoint: [config.endpointV2],
    paused: [true], totalSupply: [totalSupply],
    eip712Domain: ["0x0f", "Flying Tulip", "1", 143, FT_ADDRESS, "0x" + "00".repeat(32), []],
  };
  const forbidden = () => { throw new Error("The postcheck must not load compiler artifacts or request a signer"); };
  const hre = {
    network: { name: "monad", config: { isTestnet: false } },
    getChainId: async () => "143",
    artifacts: { readArtifact: forbidden },
    deployments: {
      get: async (name: string) => {
        expect(name).to.equal("FT");
        return { address: FT_ADDRESS, abi };
      },
    },
    ethers: {
      Contract, getContractAt: forbidden, getSigners: forbidden, getSigner: forbidden,
      provider: {
        call: async (transaction: { to: string; data: string }) => {
          expect(transaction.to).to.equal(FT_ADDRESS);
          const parsed = contractInterface.parseTransaction(transaction)!;
          reads.push(parsed.name);
          expect(values).to.have.property(parsed.name);
          return contractInterface.encodeFunctionResult(parsed.name, values[parsed.name]);
        },
        sendTransaction: forbidden,
      },
    },
  } as unknown as HardhatRuntimeEnvironment;
  return { hre, reads };
}

async function quietlyCheck(hre: HardhatRuntimeEnvironment) {
  const log = console.log, error = console.error;
  console.log = () => {};
  console.error = () => {};
  try { return await runDeploymentCheck(hre); }
  finally { console.log = log; console.error = error; }
}

describe("Saved-deployment state checks", function () {
  it("validates a fresh non-mint deployment using only the saved ABI and read-only provider", async function () {
    const { hre, reads } = checkerRuntime();
    expect(await quietlyCheck(hre)).to.equal(true);
    expect(reads).to.have.members([
      "name", "symbol", "decimals", "configurator", "owner", "endpoint", "paused", "totalSupply", "eip712Domain",
    ]);
  });

  it("still rejects unexpected initial supply when compiler artifacts are unavailable", async function () {
    const { hre } = checkerRuntime(1n);
    expect(await quietlyCheck(hre)).to.equal(false);
  });
});

import { expect } from "chai";
import { Interface } from "ethers";
import { deriveSafeBootstrapActions, ExistingSafeState } from "../../scripts/lib/arbitrum-safe-bootstrap";

const OWNER_SAFE = "0x1118e1c057211306a40A4d7006C040dbfE1370Cb";
const DELEGATE_SAFE = "0x22246a9183cE2CE6e2c2a9973F94aEA91435017C";
const SINGLETON = "0xfb1bffC9d739B8D520DaF37dF666da4C687191EA";
const FACTORY = "0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC";
const PROXY_HASH = "0xb89c1b3bdf2cf8827818646bce9a8f6e372885f8c55e5c07acbd307cb133b000";
const B7 = "0xB7B543337539219A5a1326aCB71dBa8Bba408bc8";
const F9 = "0xf9E5aF16243041cE3141284D225CAfC0fC749a10";
const ORIGINAL_DELEGATE = [
  "0x3c42749709BF354B3aE0Db29Fd2dd88089b21B4E",
  "0x09E2B49280f1879172b2C3345d08896921707881",
  "0xD0CA88388d1732594D611535314e9B6745396f5A",
];
const ORIGINAL_OWNER = [ORIGINAL_DELEGATE[0], F9, ...ORIGINAL_DELEGATE.slice(1)];
const TARGETS = {
  [OWNER_SAFE]: { owners: [B7, ...ORIGINAL_OWNER], threshold: 3 },
  [DELEGATE_SAFE]: { owners: [F9, B7, ...ORIGINAL_DELEGATE], threshold: 3 },
};
const safeInterface = new Interface([
  "function setup(address[] owners,uint256 threshold,address to,bytes data,address fallbackHandler,address paymentToken,uint256 payment,address paymentReceiver)",
  "function addOwnerWithThreshold(address owner,uint256 threshold)",
]);
const factoryInterface = new Interface(["function createProxyWithNonce(address singleton,bytes initializer,uint256 saltNonce) returns(address)"]);

function existing(owners: string[], threshold: number): ExistingSafeState {
  return { deployed: true, owners: [...owners], threshold, singleton: SINGLETON, proxyCodeHash: PROXY_HASH };
}

function originals(): Record<string, ExistingSafeState> {
  return {
    [OWNER_SAFE]: existing(ORIGINAL_OWNER, 3),
    [DELEGATE_SAFE]: existing(ORIGINAL_DELEGATE, 2),
  };
}

function completed(): Record<string, ExistingSafeState> {
  return {
    [OWNER_SAFE]: existing(TARGETS[OWNER_SAFE].owners, 3),
    [DELEGATE_SAFE]: existing(TARGETS[DELEGATE_SAFE].owners, 3),
  };
}

function additions(batch: { transactions: Array<{ data: string | null }> }) {
  return batch.transactions.map((tx) => {
    const call = safeInterface.parseTransaction({ data: tx.data! })!;
    expect(call.name).to.equal("addOwnerWithThreshold");
    return { owner: call.args[0], threshold: Number(call.args[1]) };
  });
}

describe("Arbitrum Safe bootstrap recovery", function () {
  it("creates both absent Safes with canonical initial owners before the approved rotations", function () {
    const actions = deriveSafeBootstrapActions({ [OWNER_SAFE]: { deployed: false }, [DELEGATE_SAFE]: { deployed: false } }, TARGETS);
    expect(actions.bootstrapTransactions.map((tx) => tx.safeAddress)).to.deep.equal([OWNER_SAFE, DELEGATE_SAFE]);
    for (const [index, tx] of actions.bootstrapTransactions.entries()) {
      expect(tx.to).to.equal(FACTORY);
      expect(tx.value).to.equal("0");
      const create = factoryInterface.parseTransaction({ data: tx.data })!;
      expect(create.args[0]).to.equal(SINGLETON);
      const setup = safeInterface.parseTransaction({ data: create.args[1] })!;
      expect([...setup.args[0]]).to.deep.equal(index === 0 ? ORIGINAL_OWNER : ORIGINAL_DELEGATE);
      expect(Number(setup.args[1])).to.equal(index === 0 ? 3 : 2);
      expect(setup.args[3]).to.equal("0x");
    }
    expect(additions(actions.rotationBatches[0])).to.deep.equal([{ owner: B7, threshold: 3 }]);
    expect(additions(actions.rotationBatches[1])).to.deep.equal([{ owner: B7, threshold: 2 }, { owner: F9, threshold: 3 }]);
  });

  it("does not recreate Safes that already have the original setup", function () {
    const actions = deriveSafeBootstrapActions(originals(), TARGETS);
    expect(actions.bootstrapTransactions).to.deep.equal([]);
    expect(actions.rotationBatches.map((batch) => batch.meta.createdFromSafeAddress)).to.deep.equal([OWNER_SAFE, DELEGATE_SAFE]);
  });

  for (const present of [OWNER_SAFE, DELEGATE_SAFE]) {
    it(`creates only the missing Safe when ${present} is already deployed`, function () {
      const states = originals();
      const absent = present === OWNER_SAFE ? DELEGATE_SAFE : OWNER_SAFE;
      states[absent] = { deployed: false };
      const actions = deriveSafeBootstrapActions(states, TARGETS);
      expect(actions.bootstrapTransactions.map((tx) => tx.safeAddress)).to.deep.equal([absent]);
      expect(actions.rotationBatches).to.have.length(2);
    });
  }

  it("returns no transactions when both Safes already match Ethereum", function () {
    const actions = deriveSafeBootstrapActions(completed(), TARGETS);
    expect(actions.bootstrapTransactions).to.deep.equal([]);
    expect(actions.rotationBatches).to.deep.equal([]);
  });

  it("resumes the delegate rotation after the first approved owner addition", function () {
    const states = completed();
    states[DELEGATE_SAFE] = existing([B7, ...ORIGINAL_DELEGATE], 2);
    const actions = deriveSafeBootstrapActions(states, TARGETS);
    expect(actions.bootstrapTransactions).to.deep.equal([]);
    expect(actions.rotationBatches).to.have.length(1);
    expect(actions.rotationBatches[0].meta.createdFromSafeAddress).to.equal(DELEGATE_SAFE);
    expect(additions(actions.rotationBatches[0])).to.deep.equal([{ owner: F9, threshold: 3 }]);
  });

  it("rotates only the owner Safe when the delegate is already complete", function () {
    const states = completed();
    states[OWNER_SAFE] = existing(ORIGINAL_OWNER, 3);
    const actions = deriveSafeBootstrapActions(states, TARGETS);
    expect(actions.rotationBatches).to.have.length(1);
    expect(actions.rotationBatches[0].meta.createdFromSafeAddress).to.equal(OWNER_SAFE);
    expect(additions(actions.rotationBatches[0])).to.deep.equal([{ owner: B7, threshold: 3 }]);
  });

  for (const [description, owners, threshold] of [
    ["an unexpected owner", ["0x0000000000000000000000000000000000000001", ...ORIGINAL_DELEGATE], 2],
    ["the wrong original threshold", ORIGINAL_DELEGATE, 3],
    ["the wrong partial threshold", [B7, ...ORIGINAL_DELEGATE], 3],
    ["an out-of-order partial owner addition", [F9, ...ORIGINAL_DELEGATE], 2],
    ["the wrong final threshold", TARGETS[DELEGATE_SAFE].owners, 2],
  ] as const) {
    it(`rejects ${description}`, function () {
      const states = originals();
      states[DELEGATE_SAFE] = existing([...owners], threshold);
      expect(() => deriveSafeBootstrapActions(states, TARGETS)).to.throw(/Unexpected existing Safe owners or threshold/);
    });
  }

  it("rejects matching owner lists behind an unexpected proxy implementation", function () {
    const states = completed();
    states[OWNER_SAFE] = { ...existing(TARGETS[OWNER_SAFE].owners, 3), deployed: true, owners: TARGETS[OWNER_SAFE].owners, threshold: 3,
      proxyCodeHash: `0x${"00".repeat(32)}`, singleton: SINGLETON };
    expect(() => deriveSafeBootstrapActions(states, TARGETS)).to.throw(/unexpected proxy bytecode or singleton/);
  });

  it("rejects the canonical proxy pointing to a different singleton", function () {
    const states = completed();
    states[OWNER_SAFE] = { deployed: true, owners: TARGETS[OWNER_SAFE].owners, threshold: 3, proxyCodeHash: PROXY_HASH,
      singleton: "0x0000000000000000000000000000000000000001" };
    expect(() => deriveSafeBootstrapActions(states, TARGETS)).to.throw(/unexpected proxy bytecode or singleton/);
  });
});

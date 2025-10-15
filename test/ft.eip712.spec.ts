import { expect } from "chai";
import { ethers } from "hardhat";

describe("FT eip712 + permit dynamic domain", () => {
  async function deploy() {
    const [deployer, configurator, spender] = await ethers.getSigners();

    const MockEndpoint = await ethers.getContractFactory("MockEndpoint");
    const endpoint = await MockEndpoint.deploy();

    const ftName = "Foo Token";
    const ftSymbol = "FOO";
    const delegate = deployer.address; // also owner
    const ftConfigurator = configurator.address;
    // allowed list includes 31337 for local hardhat
    const mintChainId = 31337n;

    const FT = await ethers.getContractFactory("FT");
    const ft = await FT.deploy(ftName, ftSymbol, await endpoint.getAddress(), delegate, ftConfigurator, mintChainId);

    return { ft, deployer, configurator, spender, endpoint };
  }

  it("eip712Domain reflects dynamic name and updates DOMAIN_SEPARATOR on rename", async () => {
    const { ft, deployer } = await deploy();

    const [fields1, name1, version1, chainId1, verifying1, salt1, extensions1] = await ft.eip712Domain();
    expect(fields1).to.equal("0x0f");
    expect(version1).to.equal("1");
    const network = await ethers.provider.getNetwork();
    expect(chainId1).to.equal(network.chainId);
    expect(verifying1).to.equal(await ft.getAddress());
    expect(salt1).to.equal(ethers.ZeroHash);
    expect(extensions1.length).to.equal(0);

    const nameBefore = await ft.name();
    expect(name1).to.equal(nameBefore);

    const ds1 = await ft.DOMAIN_SEPARATOR();

    // rename
    await ft.connect(deployer).setName("Bar Token");

    const [_, name2, version2, chainId2, verifying2] = await ft.eip712Domain();
    expect(name2).to.equal("Bar Token");
    expect(version2).to.equal("1");
    expect(chainId2).to.equal(chainId1);
    expect(verifying2).to.equal(verifying1);

    const ds2 = await ft.DOMAIN_SEPARATOR();
    expect(ds2).to.not.equal(ds1);
  });

  it("permit(v,r,s) uses dynamic domain: old signature invalid after name change; new one succeeds", async () => {
    const { ft, deployer, spender } = await deploy();

    const owner = deployer;
    const spenderAddr = spender.address;
    const value = 123n;
    const deadline = (await ethers.provider.getBlock("latest")).timestamp + 3600;
    let nonce = await ft.nonces(owner.address);

    // prepare EIP-712 typed data for current name
    const domain1 = {
      name: await ft.name(),
      version: "1",
      chainId: Number((await ethers.provider.getNetwork()).chainId),
      verifyingContract: await ft.getAddress(),
    };
    const types = {
      Permit: [
        { name: "owner", type: "address" },
        { name: "spender", type: "address" },
        { name: "value", type: "uint256" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    } as const;
    const message = {
      owner: owner.address,
      spender: spenderAddr,
      value,
      nonce,
      deadline,
    };

    const sig1 = await owner.signTypedData(domain1, types, message);
    const { v, r, s } = ethers.Signature.from(sig1);

    // change name BEFORE using signature
    await ft.connect(owner).setName("Bar Token");

    await expect(
      ft.connect(spender).permit(owner.address, spenderAddr, value, deadline, v, r, s)
    ).to.be.revertedWithCustomError(ft, "ERC2612InvalidSigner");

    // sign again with updated domain and same nonce
    const domain2 = {
      ...domain1,
      name: await ft.name(),
    };
    nonce = await ft.nonces(owner.address);
    const sig2 = await owner.signTypedData(domain2, types, { ...message, nonce });
    const sig2Split = ethers.Signature.from(sig2);

    await ft.connect(spender).permit(owner.address, spenderAddr, value, deadline, sig2Split.v, sig2Split.r, sig2Split.s);
    expect(await ft.allowance(owner.address, spenderAddr)).to.equal(value);
  });
});


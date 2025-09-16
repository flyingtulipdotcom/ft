import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { ContractFactory } from "ethers";

import type { ILayerZeroEndpointV2, MyOFTMock } from "../../typechain-types";

describe("FlyingTulip OFT", function () {
  async function deployFixture() {
    const [owner, configurator, alice, bob] = await ethers.getSigners();

    // Deploy the mock endpoint first
    const EndpointV2MockArtifact = await deployments.getArtifact("EndpointV2Mock");
    const EndpointV2Mock = new ContractFactory(EndpointV2MockArtifact.abi, EndpointV2MockArtifact.bytecode, owner);
    const endpointId = 30112; // arbitrary test id
    const endpoint = (await EndpointV2Mock.deploy(endpointId)) as unknown as ILayerZeroEndpointV2;

    const ftOFT = (await ethers.deployContract("FT", [
      "FlyingTulipOFT",
      "FT",
      await endpoint.getAddress(),
      owner.address,
      configurator.address
    ])) as unknown as MyOFTMock;

    // Deploy MyOFTMock using the endpoint address (constructor: name, symbol, endpoint, owner)
    const myOFT = (await ethers.deployContract("MyOFTMock", [
      "FlyingTulipOFT",
      "FT",
      await endpoint.getAddress(),
      owner.address,
      configurator.address
    ])) as unknown as MyOFTMock;

    // Mint some tokens to owner for testing
    const mintAmount = ethers.parseEther("1000000");
    await myOFT.mint(owner.address, mintAmount);

    return { ftOFT, myOFT, owner, configurator, alice, bob, mintAmount };
  }

  describe("Deployment", function () {
    it("should set the right owner", async function () {
      const { myOFT, owner } = await loadFixture(deployFixture);
      expect(await myOFT.owner()).to.equal(owner.address);
    });

    it("should set the right configurator", async function () {
      const { myOFT, configurator } = await loadFixture(deployFixture);
      expect(await myOFT.configurator()).to.equal(configurator.address);
    });

    it("should use the correct sonic chain id for the base token", async function () {
      const { ftOFT, myOFT } = await loadFixture(deployFixture);
      expect(await ftOFT.SONIC_CHAIN_ID()).to.equal(146); // as per FT contract
      expect(await myOFT.SONIC_CHAIN_ID()).to.equal(31337); // as per MyOFTMock contract override
    });
  });

  describe("Transfer from", function () {
    it("should transfer from self", async function () {
      const { myOFT, owner, alice } = await loadFixture(deployFixture);
      await myOFT.approve(owner.address, 100n);
      await myOFT.transferFrom(owner.address, alice.address, 100n);
      expect(await myOFT.balanceOf(alice.address)).to.equal(100n);
    });

    it("should transfer from another", async function () {
      const { myOFT, owner, alice } = await loadFixture(deployFixture);
      await myOFT.approve(alice.address, 100n);
      await myOFT.connect(alice).transferFrom(owner.address, alice.address, 100n);
      expect(await myOFT.balanceOf(alice.address)).to.equal(100n);
    });

    it("should revert if non-approved address tries to transfer", async function () {
      const { myOFT, owner, alice } = await loadFixture(deployFixture);
      await expect(myOFT.connect(alice).transferFrom(owner.address, alice.address, 100n)).to.be.revertedWithCustomError(
        myOFT,
        "ERC20InsufficientAllowance"
      );
    });
  });

  describe("Pausing", function () {
    it("should allow owner/configurator to pause and unpause the contract", async function () {
      const { myOFT, owner, configurator, alice } = await loadFixture(deployFixture);

      // fund configurator
      await myOFT.transfer(configurator.address, 1000n);
      // pause contract
      await myOFT.connect(owner).setPaused(true);
      // alice cannot transfer while paused
      await expect(myOFT.connect(alice).transfer(alice.address, 100n)).to.be.revertedWithCustomError(
        myOFT,
        "EnforcedPause"
      );
      // owner can transfer while paused
      await expect(myOFT.connect(owner).transfer(alice.address, 100n)).to.be.revertedWithCustomError(
        myOFT,
        "EnforcedPause"
      );
      // configurator can transfer while paused
      await myOFT.connect(configurator).transfer(alice.address, 100n);
      await myOFT.connect(configurator).setPaused(false);
      // now alice can transfer again
      await myOFT.connect(alice).transfer(alice.address, 100n);
    });

    it("should only owner or configurator can pause/unpause", async function () {
      const { myOFT, owner, configurator, alice } = await loadFixture(deployFixture);

      // non-owner/non-configurator cannot call setPaused
      await expect(myOFT.connect(alice).setPaused(true)).to.be.reverted;

      // owner/configurator can pause/unpause
      await myOFT.connect(configurator).setPaused(true);
      expect(await myOFT.paused()).to.equal(true);
      await myOFT.connect(owner).setPaused(false);
      expect(await myOFT.paused()).to.equal(false);
    });

    it("should revert when paused", async function () {
      const { myOFT, owner, configurator, alice } = await loadFixture(deployFixture);

      // pause contract
      await myOFT.connect(owner).setPaused(true);

      // normal transfer should revert
      await expect(myOFT.transfer(alice.address, 1n)).to.be.reverted;
    });

    it("should revert when paused, except to/from configurator", async function () {
      const { myOFT, owner, configurator, alice, bob } = await loadFixture(deployFixture);

      await myOFT.mint(alice.address, 10n);

      // pause contract
      await myOFT.connect(owner).setPaused(true);

      await expect(myOFT.connect(alice).transfer(configurator.address, 3n)).to.not.be.reverted;
      await expect(myOFT.connect(configurator).transfer(alice.address, 1n)).to.not.be.reverted;
      await myOFT.connect(configurator).approve(alice.address, 1n);
      await expect(myOFT.connect(alice).transferFrom(configurator.address, bob.address, 1n)).to.not.be.reverted;

      // allow configurator to transfer (authed as the sender)
      await myOFT.connect(alice).approve(configurator.address, 10n);
      await expect(myOFT.connect(configurator).transferFrom(alice.address, bob.address, 1n)).to.not.be.reverted;

      // transfer between non-configurator addresses should revert
      await expect(myOFT.connect(alice).transfer(bob.address, 1n)).to.be.reverted;
      await expect(myOFT.connect(bob).transfer(alice.address, 1n)).to.be.reverted;
      await myOFT.connect(alice).approve(bob.address, 10n);
      await expect(myOFT.connect(bob).transferFrom(alice.address, bob.address, 1n)).to.be.reverted;
    });

    it("should allow endpoint to deliver tokens while paused via lzReceive", async function () {
      const { myOFT, owner } = await loadFixture(deployFixture);

      // pause contract
      await myOFT.connect(owner).setPaused(true);

      // Create a minimal packet to simulate endpoint delivery.
      // We use the endpoint mock artifact from deployments like in fixture.
      const EndpointV2MockArtifact = await deployments.getArtifact("EndpointV2Mock");
      const EndpointV2Mock = new ContractFactory(EndpointV2MockArtifact.abi, EndpointV2MockArtifact.bytecode, owner);
      const endpointId = 30112;
      const endpoint = await EndpointV2Mock.deploy(endpointId);

      // craft a packet similar to tasks utility: version, nonce, srcEid, sender, dstEid, receiver, guid, message
      const nonce = 1;
      const srcEid = 100;
      const dstEid = 200;
      const sender = ethers.ZeroAddress;
      const receiver = ethers.ZeroAddress;
      const guid = ethers.keccak256(ethers.toUtf8Bytes("guid"));

      // message: encode address (to) and amount in SD (shared decimals). Use helper from OFT encoding if available.
      // For simplicity craft a bare message with zeros except amount and to address encoded as 32 bytes.
      const addrNo0x = owner.address.replace(/^0x/, "");
      const toB32 = "0x" + "0".repeat(64 - addrNo0x.length) + addrNo0x;

      const amountSD = 1n; // small amount in shared decimals
      let amountHex = amountSD.toString(16);
      if (amountHex.length % 2 === 1) amountHex = "0" + amountHex;
      const amountSDBytes = "0x" + "0".repeat(16 - amountHex.length) + amountHex; // pad to 8 bytes (16 hex chars)

      const message = ethers.concat([toB32, amountSDBytes]);

      const packet = {
        version: 1,
        nonce: nonce,
        srcEid: srcEid,
        sender: "0x" + "00".repeat(32),
        dstEid: dstEid,
        receiver: "0x" + "00".repeat(32),
        guid: guid,
        message: message
      };

      const extraData = "0x";

      // call endpoint.lzReceive(...) to deliver to the OFT contract
      // cast endpoint to any to call mock method not present in types
      await expect((endpoint as any).lzReceive(packet, myOFT.target, guid, message, extraData)).to.not.be.reverted;
    });

    it("should only configurator to set new configurator address", async function () {
      const { myOFT, configurator, alice } = await loadFixture(deployFixture);

      // non-configurator cannot call transferConfigurator
      await expect(myOFT.connect(alice).transferConfigurator(alice.address)).to.be.reverted;
      // configurator can set new configurator
      await myOFT.connect(configurator).transferConfigurator(alice.address);
      // old configurator cannot set configurator anymore
      await expect(myOFT.connect(configurator).transferConfigurator(configurator.address)).to.be.reverted;
      // new configurator can set configurator
      await myOFT.connect(alice).transferConfigurator(configurator.address);
      expect(await myOFT.configurator()).to.equal(configurator.address);
    });
  });

  describe("Burning", function () {
    it("should allow token holder to burn their tokens", async function () {
      const { myOFT, alice } = await loadFixture(deployFixture);
      await myOFT.transfer(alice.address, 100n);
      await myOFT.connect(alice).burn(40n);
      expect(await myOFT.balanceOf(alice.address)).to.equal(60n);
    });

    it("should allow approved address to burn tokens", async function () {
      const { myOFT, owner, alice } = await loadFixture(deployFixture);
      await myOFT.transfer(alice.address, 100n);
      await myOFT.connect(alice).approve(owner.address, 100n);
      const initialSupply = await myOFT.totalSupply();
      const burnAmount = 40n;
      await expect(myOFT.burnFrom(alice.address, burnAmount))
        .to.emit(myOFT, "Transfer")
        .withArgs(alice.address, ethers.ZeroAddress, burnAmount);
      await myOFT.burn(burnAmount);
      expect(await myOFT.balanceOf(alice.address)).to.equal(60n);
      expect(await myOFT.totalSupply()).to.equal(initialSupply - burnAmount * 2n);
    });

    it("should revert if non-approved address tries to burn", async function () {
      const { myOFT, alice } = await loadFixture(deployFixture);
      await myOFT.transfer(alice, 100);
      await expect(myOFT.burnFrom(alice, 40)).to.be.revertedWithCustomError(myOFT, "ERC20InsufficientAllowance");
    });

    it("should revert if burning more than balance", async function () {
      const { myOFT, alice } = await loadFixture(deployFixture);
      await expect(myOFT.connect(alice).burn(150n)).to.be.revertedWithCustomError(myOFT, "ERC20InsufficientBalance");
    });
  });

  describe("Owner", function () {
    it("should allow owner to change name", async function () {
      const { myOFT, owner } = await loadFixture(deployFixture);
      expect(await myOFT.name()).to.equal("FlyingTulipOFT");

      expect(await myOFT.connect(owner).setName("NewName"))
        .to.emit(myOFT, "NameChanged")
        .withArgs("NewName");

      expect(await myOFT.name()).to.equal("NewName");
    });

    it("should allow owner to change symbol", async function () {
      const { myOFT, owner } = await loadFixture(deployFixture);
      expect(await myOFT.symbol()).to.equal("FT");

      expect(await myOFT.connect(owner).setSymbol("NN"))
        .to.emit(myOFT, "SymbolChanged")
        .withArgs("NN");

      expect(await myOFT.symbol()).to.equal("NN");
    });

    it("should revert if non-owner tries to change name", async function () {
      const { myOFT, alice } = await loadFixture(deployFixture);
      await expect(myOFT.connect(alice).setName("HackerName")).to.be.reverted;
    });

    it("should revert if non-owner tries to change symbol", async function () {
      const { myOFT, alice } = await loadFixture(deployFixture);
      await expect(myOFT.connect(alice).setSymbol("HN")).to.be.reverted;
    });

    it("should allow the owner to transfer ownership", async function () {
      const { myOFT, owner, alice } = await loadFixture(deployFixture);
      expect(await myOFT.owner()).to.equal(owner.address);
      await myOFT.connect(owner).transferOwnership(alice.address);
      expect(await myOFT.owner()).to.equal(alice.address);
    });

    it("should revert if non-owner tries to transfer ownership", async function () {
      const { myOFT, alice } = await loadFixture(deployFixture);
      await expect(myOFT.connect(alice).transferOwnership(alice.address)).to.be.reverted;
    });
  });
});

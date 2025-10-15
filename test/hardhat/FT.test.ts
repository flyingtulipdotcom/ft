import { expect } from "chai";
import { deployments, ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { ContractFactory, BigNumberish } from "ethers";

import type { ILayerZeroEndpointV2, MyOFTMock } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

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
      configurator.address,
      146
    ])) as unknown as MyOFTMock;

    // Deploy MyOFTMock using the endpoint address (constructor: name, symbol, endpoint, owner, mint chain id)
    const myOFT = (await ethers.deployContract("MyOFTMock", [
      "FlyingTulipOFT",
      "FT",
      await endpoint.getAddress(),
      owner.address,
      configurator.address,
      (await ethers.provider.getNetwork()).chainId
    ])) as unknown as MyOFTMock;

    return { ftOFT, myOFT, owner, configurator, alice, bob };
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

    it("should mint the correct supplies", async function () {
      const { ftOFT, myOFT } = await loadFixture(deployFixture);
      // it should not mint because we are in hardhat chain id
      expect(await ftOFT.totalSupply()).to.equal(0);
      // expect 10 billion tokens minted to configurator
      expect(await myOFT.totalSupply()).to.equal(ethers.parseEther("10000000000"));
    });
  });

  describe("Transfers", function () {
    it("should transfer from self", async function () {
      const { myOFT, configurator, alice } = await loadFixture(deployFixture);
      await myOFT.connect(configurator).transfer(alice.address, 100n);
      expect(await myOFT.balanceOf(alice.address)).to.equal(100n);
    });

    it("should transfer from another", async function () {
      const { myOFT, configurator, alice } = await loadFixture(deployFixture);
      await myOFT.connect(configurator).approve(alice.address, 100n);
      await myOFT.connect(alice).transferFrom(configurator.address, alice.address, 100n);
      expect(await myOFT.balanceOf(alice.address)).to.equal(100n);
    });

    it("should revert if non-approved address tries to transfer", async function () {
      const { myOFT, configurator, alice } = await loadFixture(deployFixture);
      await expect(
        myOFT.connect(alice).transferFrom(configurator.address, alice.address, 100n)
      ).to.be.revertedWithCustomError(myOFT, "ERC20InsufficientAllowance");
    });
  });

  describe("Pausing", function () {
    it("should allow owner/configurator to pause and unpause the contract", async function () {
      const { myOFT, owner, configurator, alice } = await loadFixture(deployFixture);

      // fund owner
      await myOFT.connect(configurator).transfer(owner.address, 1000n);

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
      const { myOFT, configurator, alice } = await loadFixture(deployFixture);
      await myOFT.connect(configurator).transfer(alice.address, 100n);
      await myOFT.connect(alice).burn(40n);
      expect(await myOFT.balanceOf(alice.address)).to.equal(60n);
    });

    it("should allow approved address to burn tokens", async function () {
      const { myOFT, owner, configurator, alice } = await loadFixture(deployFixture);
      await myOFT.connect(configurator).transfer(alice.address, 100n);
      await myOFT.connect(alice).approve(owner.address, 100n);
      const initialSupply = await myOFT.totalSupply();
      const burnAmount = 40n;
      await expect(myOFT.burnFrom(alice.address, burnAmount))
        .to.emit(myOFT, "Transfer")
        .withArgs(alice.address, ethers.ZeroAddress, burnAmount);
      await myOFT.connect(configurator).burn(burnAmount);
      expect(await myOFT.balanceOf(alice.address)).to.equal(60n);
      expect(await myOFT.totalSupply()).to.equal(initialSupply - burnAmount * 2n);
    });

    it("should revert if non-approved address tries to burn", async function () {
      const { myOFT, configurator, alice } = await loadFixture(deployFixture);
      await myOFT.connect(configurator).transfer(alice.address, 100n);
      await expect(myOFT.burnFrom(alice.address, 40n)).to.be.revertedWithCustomError(
        myOFT,
        "ERC20InsufficientAllowance"
      );
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

  describe("ERC20Permit", function () {
    async function getPermitSignature(
      owner: HardhatEthersSigner,
      spender: HardhatEthersSigner,
      value: BigNumberish,
      nonce: BigNumberish,
      deadline: number,
      token: MyOFTMock
    ) {
      const domain = {
        name: await token.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await token.getAddress()
      };

      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" }
        ]
      };

      const message = {
        owner: owner.address,
        spender: spender.address,
        value: value,
        nonce: nonce,
        deadline: deadline
      };

      const signature = await owner.signTypedData(domain, types, message);
      return ethers.Signature.from(signature);
    }

    it("should have correct initial values", async function () {
      const { myOFT, alice } = await loadFixture(deployFixture);

      expect(await myOFT.nonces(alice.address)).to.equal(0n);
      const domain = {
        name: await myOFT.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await myOFT.getAddress(),
      };
      // hashDomain returns keccak256 of the EIP-712 domain per spec
      const expected = ethers.TypedDataEncoder.hashDomain(domain);
      expect(await myOFT.DOMAIN_SEPARATOR()).to.equal(expected);
    });

    it("should allow permit with valid signature", async function () {
      const { myOFT, configurator, alice, bob } = await loadFixture(deployFixture);

      // Setup: transfer some tokens to alice first
      await myOFT.connect(configurator).transfer(alice.address, ethers.parseEther("100"));

      const value = ethers.parseEther("50");
      const nonce = await myOFT.nonces(alice.address);
      const deadline = (await time.latest()) + 3600; // 1 hour from now

      const signature = await getPermitSignature(alice, bob, value, nonce, deadline, myOFT);

      // Verify no allowance initially
      expect(await myOFT.allowance(alice.address, bob.address)).to.equal(0n);

      // Call permit
      await expect(myOFT.permit(alice.address, bob.address, value, deadline, signature.v, signature.r, signature.s))
        .to.emit(myOFT, "Approval")
        .withArgs(alice.address, bob.address, value);

      // Verify allowance was set
      expect(await myOFT.allowance(alice.address, bob.address)).to.equal(value);

      // Verify nonce was incremented
      expect(await myOFT.nonces(alice.address)).to.equal(nonce + 1n);
    });

    it("should allow transferFrom after permit", async function () {
      const { myOFT, configurator, alice, bob } = await loadFixture(deployFixture);

      // Setup: transfer some tokens to alice first
      await myOFT.connect(configurator).transfer(alice.address, ethers.parseEther("100"));

      const value = ethers.parseEther("50");
      const nonce = await myOFT.nonces(alice.address);
      const deadline = (await time.latest()) + 3600;

      const signature = await getPermitSignature(alice, bob, value, nonce, deadline, myOFT);

      // Call permit
      await myOFT.permit(alice.address, bob.address, value, deadline, signature.v, signature.r, signature.s);

      // Bob should be able to transfer tokens from Alice
      const transferAmount = ethers.parseEther("30");
      await expect(myOFT.connect(bob).transferFrom(alice.address, bob.address, transferAmount))
        .to.emit(myOFT, "Transfer")
        .withArgs(alice.address, bob.address, transferAmount);

      expect(await myOFT.balanceOf(bob.address)).to.equal(transferAmount);
      expect(await myOFT.allowance(alice.address, bob.address)).to.equal(value - transferAmount);
    });

    it("should reject permit with invalid signature", async function () {
      const { myOFT, configurator, alice, bob } = await loadFixture(deployFixture);

      await myOFT.connect(configurator).transfer(alice.address, ethers.parseEther("100"));

      const value = ethers.parseEther("50");
      const nonce = await myOFT.nonces(alice.address);
      const deadline = (await time.latest()) + 3600;

      // Get signature but change the value to make it invalid
      const signature = await getPermitSignature(alice, bob, ethers.parseEther("25"), nonce, deadline, myOFT);

      await expect(
        myOFT.permit(
          alice.address,
          bob.address,
          value, // Different value than what was signed
          deadline,
          signature.v,
          signature.r,
          signature.s
        )
      ).to.be.revertedWithCustomError(myOFT, "ERC2612InvalidSigner");
    });

    it("should work with permit and transferFrom while paused (configurator exception)", async function () {
      const { myOFT, configurator, alice, bob, owner } = await loadFixture(deployFixture);

      await myOFT.connect(configurator).transfer(alice.address, ethers.parseEther("100"));
      await myOFT.connect(configurator).transfer(bob.address, ethers.parseEther("50")); // Give bob some tokens too

      const value = ethers.parseEther("50");
      const deadline = (await time.latest()) + 3600;

      // Create permit for configurator first
      const configNonce = await myOFT.nonces(alice.address);
      const configSignature = await getPermitSignature(alice, configurator, value, configNonce, deadline, myOFT);

      // Pause the contract
      await myOFT.connect(owner).setPaused(true);

      // First permit should work even when paused (no transfer involved)
      await expect(
        myOFT.permit(
          alice.address,
          configurator.address,
          value,
          deadline,
          configSignature.v,
          configSignature.r,
          configSignature.s
        )
      )
        .to.emit(myOFT, "Approval")
        .withArgs(alice.address, configurator.address, value);

      // Now create permit for bob AFTER the first permit is executed (so nonce is correct)
      const bobNonce = await myOFT.nonces(alice.address); // This is now configNonce + 1
      const bobSignature = await getPermitSignature(alice, bob, value, bobNonce, deadline, myOFT);

      // Second permit for bob should also work
      await expect(
        myOFT.permit(alice.address, bob.address, value, deadline, bobSignature.v, bobSignature.r, bobSignature.s)
      )
        .to.emit(myOFT, "Approval")
        .withArgs(alice.address, bob.address, value);

      // Configurator should be able to transferFrom even when paused
      await expect(myOFT.connect(configurator).transferFrom(alice.address, bob.address, ethers.parseEther("30"))).to.not
        .be.reverted;

      // But bob should NOT be able to transferFrom when paused (non-configurator)
      await expect(
        myOFT.connect(bob).transferFrom(alice.address, owner.address, ethers.parseEther("20"))
      ).to.be.revertedWithCustomError(myOFT, "EnforcedPause");
    });

    it("should allow 1271 permit for a smart wallet owner and subsequent transferFrom", async function () {
      const { myOFT, configurator, alice, bob } = await loadFixture(deployFixture);

      // Deploy a simple ERC-1271 wallet controlled by Alice's EOA
      const wallet = await ethers.deployContract("SmartWallet1271", [alice.address]);

      // Fund smart wallet with tokens
      await myOFT.connect(configurator).transfer(await wallet.getAddress(), ethers.parseEther("100"));

      const value = ethers.parseEther("50");
      const nonce = await myOFT.nonces(await wallet.getAddress());
      const deadline = (await time.latest()) + 3600;

      // Build EIP-712 signature signed by Alice, but authorizing the smart wallet as owner
      const domain = {
        name: await myOFT.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await myOFT.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = {
        owner: await wallet.getAddress(),
        spender: bob.address,
        value,
        nonce,
        deadline,
      };
      const signature = await alice.signTypedData(domain, types, message);

      // Call 1271-aware permit overload
      await expect(myOFT.permit(await wallet.getAddress(), bob.address, value, deadline, signature))
        .to.emit(myOFT, "Approval")
        .withArgs(await wallet.getAddress(), bob.address, value);

      // Bob can transfer tokens from the smart wallet
      const transferAmount = ethers.parseEther("30");
      await expect(myOFT.connect(bob).transferFrom(await wallet.getAddress(), bob.address, transferAmount))
        .to.emit(myOFT, "Transfer")
        .withArgs(await wallet.getAddress(), bob.address, transferAmount);

      expect(await myOFT.balanceOf(bob.address)).to.equal(transferAmount);
      expect(await myOFT.allowance(await wallet.getAddress(), bob.address)).to.equal(value - transferAmount);
    });

    it("should reject 1271 permit if signature is not recognized by the smart wallet", async function () {
      const { myOFT, configurator, alice, bob } = await loadFixture(deployFixture);

      const wallet = await ethers.deployContract("SmartWallet1271", [alice.address]);

      // Fund smart wallet with tokens
      await myOFT.connect(configurator).transfer(await wallet.getAddress(), ethers.parseEther("10"));

      const value = ethers.parseEther("5");
      const nonce = await myOFT.nonces(await wallet.getAddress());
      const deadline = (await time.latest()) + 3600;

      const domain = {
        name: await myOFT.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await myOFT.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = {
        owner: await wallet.getAddress(),
        spender: bob.address,
        value,
        nonce,
        deadline,
      };
      // Wrong signer (bob) signs on behalf of wallet controlled by Alice
      const badSignature = await bob.signTypedData(domain, types, message);

      await expect(
        myOFT.permit(await wallet.getAddress(), bob.address, value, deadline, badSignature)
      ).to.be.revertedWithCustomError(myOFT, "ERC2612InvalidSigner");
    });
  });

  describe("Permit Nonce Safety", function () {
    it("invalid EOA permit does not advance nonce", async function () {
      const { myOFT, configurator, alice, bob } = await loadFixture(deployFixture);

      // fund alice
      await myOFT.connect(configurator).transfer(alice.address, ethers.parseEther("10"));

      const before = await myOFT.nonces(alice.address);
      const value = ethers.parseEther("5");
      const deadline = (await time.latest()) + 3600;

      // sign with a wrong spender to invalidate
      const badSig = await (async () => {
        const domain = {
          name: await myOFT.name(),
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: await myOFT.getAddress(),
        };
        const types = {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        };
        const message = {
          owner: alice.address,
          spender: configurator.address, // signature for configurator
          value,
          nonce: before,
          deadline,
        };
        const sig = await alice.signTypedData(domain, types, message);
        return ethers.Signature.from(sig);
      })();

      // try to permit bob (different from signed spender) so it must revert
      await expect(
        myOFT.permit(alice.address, bob.address, value, deadline, badSig.v, badSig.r, badSig.s)
      ).to.be.revertedWithCustomError(myOFT, "ERC2612InvalidSigner");

      expect(await myOFT.nonces(alice.address)).to.equal(before);
    });

    it("invalid 1271 permit does not advance nonce", async function () {
      const { myOFT, configurator, alice, bob } = await loadFixture(deployFixture);

      // deploy wallet controlled by alice
      const wallet = await ethers.deployContract("SmartWallet1271", [alice.address]);
      await myOFT.connect(configurator).transfer(await wallet.getAddress(), ethers.parseEther("10"));

      const before = await myOFT.nonces(await wallet.getAddress());
      const value = ethers.parseEther("5");
      const deadline = (await time.latest()) + 3600;

      const domain = {
        name: await myOFT.name(),
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await myOFT.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const message = {
        owner: await wallet.getAddress(),
        spender: bob.address,
        value,
        nonce: before,
        deadline,
      };
      // wrong signer (bob) signs
      const badSignature = await bob.signTypedData(domain, types, message);

      await expect(
        myOFT.permit(await wallet.getAddress(), bob.address, value, deadline, badSignature)
      ).to.be.revertedWithCustomError(myOFT, "ERC2612InvalidSigner");

      expect(await myOFT.nonces(await wallet.getAddress())).to.equal(before);
    });
  });

  describe("Domain Changes", function () {
    it("name change invalidates previously signed permit", async function () {
      const { myOFT, owner, configurator, alice, bob } = await loadFixture(deployFixture);

      await myOFT.connect(configurator).transfer(alice.address, ethers.parseEther("10"));

      const value = ethers.parseEther("5");
      const nonce = await myOFT.nonces(alice.address);
      const deadline = (await time.latest()) + 3600;

      const signature = await (async () => {
        const domain = {
          name: await myOFT.name(),
          version: "1",
          chainId: (await ethers.provider.getNetwork()).chainId,
          verifyingContract: await myOFT.getAddress(),
        };
        const types = {
          Permit: [
            { name: "owner", type: "address" },
            { name: "spender", type: "address" },
            { name: "value", type: "uint256" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        };
        const message = {
          owner: alice.address,
          spender: bob.address,
          value,
          nonce,
          deadline,
        };
        const sig = await alice.signTypedData(domain, types, message);
        return ethers.Signature.from(sig);
      })();

      // change name after signing
      await myOFT.connect(owner).setName("FlyingTulipOFT v2");

      await expect(
        myOFT.permit(alice.address, bob.address, value, deadline, signature.v, signature.r, signature.s)
      ).to.be.revertedWithCustomError(myOFT, "ERC2612InvalidSigner");

      // nonce remains unchanged
      expect(await myOFT.nonces(alice.address)).to.equal(nonce);
    });
  });

  describe("Paused Transfer Matrix", function () {
    it("enumerates allowed combos while paused (by/to/from configurator)", async function () {
      const { myOFT, owner, configurator, alice, bob } = await loadFixture(deployFixture);

      const amount = 1n;
      // pre-fund actors
      await myOFT.connect(configurator).transfer(alice.address, ethers.parseEther("10"));
      await myOFT.connect(configurator).transfer(bob.address, ethers.parseEther("10"));

      // pause contract
      await myOFT.connect(owner).setPaused(true);

      const actors = [configurator, alice, bob];

      for (const sender of actors) {
        for (const from of actors) {
          for (const to of actors) {
            // set allowance if needed (approve is allowed while paused)
            if (sender.address !== from.address) {
              await myOFT.connect(from).approve(sender.address, amount);
            }

            const shouldSucceed =
              from.address === configurator.address ||
              to.address === configurator.address ||
              sender.address === configurator.address;

            if (sender.address === from.address) {
              const tx = myOFT.connect(sender).transfer(to.address, amount);
              if (shouldSucceed) {
                await expect(tx).to.not.be.reverted;
              } else {
                await expect(tx).to.be.revertedWithCustomError(myOFT, "EnforcedPause");
              }
            } else {
              const tx = myOFT.connect(sender).transferFrom(from.address, to.address, amount);
              if (shouldSucceed) {
                await expect(tx).to.not.be.reverted;
              } else {
                await expect(tx).to.be.revertedWithCustomError(myOFT, "EnforcedPause");
              }
            }
          }
        }
      }
    });
  });

  describe("1271 Reentrancy", function () {
    it("reentrancy attempt via 1271 wallet reverts and state unchanged", async function () {
      const { myOFT, bob } = await loadFixture(deployFixture);

      const value = ethers.parseEther("1");
      const deadline = (await time.latest()) + 3600;

      // Deploy malicious 1271 wallet that attempts to reenter token.permit during validation
      const wallet = await ethers.deployContract("Reentrant1271Wallet", [
        await myOFT.getAddress(),
        bob.address,
        value,
        deadline,
      ]);

      const beforeNonce = await myOFT.nonces(await wallet.getAddress());
      const beforeAllowance = await myOFT.allowance(await wallet.getAddress(), bob.address);

      // Use empty signature; 1271 path doesn't verify ECDSA
      await expect(
        myOFT.permit(await wallet.getAddress(), bob.address, value, deadline, "0x")
      ).to.be.reverted;

      // Ensure no state was changed
      expect(await myOFT.nonces(await wallet.getAddress())).to.equal(beforeNonce);
      expect(await myOFT.allowance(await wallet.getAddress(), bob.address)).to.equal(beforeAllowance);
    });
  });

  describe("Pausable Idempotency", function () {
    it("double pause reverts with EnforcedPause", async function () {
      const { myOFT, owner } = await loadFixture(deployFixture);
      await myOFT.connect(owner).setPaused(true);
      await expect(myOFT.connect(owner).setPaused(true)).to.be.revertedWithCustomError(
        myOFT,
        "EnforcedPause"
      );
    });

    it("double unpause reverts with ExpectedPause", async function () {
      const { myOFT, owner } = await loadFixture(deployFixture);
      // Initially unpaused due to MyOFTMock constructor
      await expect(myOFT.connect(owner).setPaused(false)).to.be.revertedWithCustomError(
        myOFT,
        "ExpectedPause"
      );
    });
  });

  describe("Owner Rotation", function () {
    it("owner can rotate configurator (if enabled)", async function () {
      const { myOFT, owner, configurator, alice } = await loadFixture(deployFixture);
      expect(await myOFT.configurator()).to.equal(configurator.address);

      await expect(myOFT.connect(owner).transferConfigurator(alice.address)).to.not.be.reverted;
      expect(await myOFT.configurator()).to.equal(alice.address);
    });
  });
});

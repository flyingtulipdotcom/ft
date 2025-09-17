import { expect } from 'chai'
import { deployments, ethers } from 'hardhat'
import { loadFixture } from '@nomicfoundation/hardhat-network-helpers'
import { ContractFactory } from 'ethers'

import type { ILayerZeroEndpointV2, MyOFTMock } from '../../typechain-types'

describe('FlyingTulip OFT', function () {
  async function deployFixture() {
    const [owner, alice, bob] = await ethers.getSigners()

    // Deploy the mock endpoint first
    const EndpointV2MockArtifact = await deployments.getArtifact('EndpointV2Mock')
    const EndpointV2Mock = new ContractFactory(EndpointV2MockArtifact.abi, EndpointV2MockArtifact.bytecode, owner)
    const endpointId = 30112 // arbitrary test id
    const endpoint = (await EndpointV2Mock.deploy(endpointId)) as unknown as ILayerZeroEndpointV2

    // Deploy MyOFTMock using the endpoint address (constructor: name, symbol, endpoint, owner)
    const myOFT = (await ethers.deployContract('MyOFTMock', [
      'FlyingTulipOFT',
      'FT',
      await endpoint.getAddress(),
      owner.address,
    ])) as unknown as MyOFTMock

    // Mint some tokens to owner for testing
    const mintAmount = ethers.parseEther('1000000')
    await myOFT.mint(owner.address, mintAmount)

    return { myOFT, owner, alice, bob, mintAmount }
  }

  describe('Transfer from', function () {
    it('From self', async function () {
      const { myOFT, owner, alice } = await loadFixture(deployFixture)
      await myOFT.approve(owner.address, 100n)
      await myOFT.transferFrom(owner.address, alice.address, 100n)
      expect(await myOFT.balanceOf(alice.address)).to.equal(100n)
    })

    it('From another', async function () {
      const { myOFT, owner, alice } = await loadFixture(deployFixture)
      await myOFT.approve(alice.address, 100n)
      await myOFT.connect(alice).transferFrom(owner.address, alice.address, 100n)
      expect(await myOFT.balanceOf(alice.address)).to.equal(100n)
    })

    it('Should revert if non-approved address tries to transfer', async function () {
      const { myOFT, owner, alice } = await loadFixture(deployFixture)
      await expect(myOFT.connect(alice).transferFrom(owner.address, alice.address, 100n)).to.be.revertedWithCustomError(
        myOFT,
        'ERC20InsufficientAllowance'
      )
    })
  })

  describe('Burning', function () {
    it('Should allow token holder to burn their tokens', async function () {
      const { myOFT, alice } = await loadFixture(deployFixture)
      await myOFT.transfer(alice.address, 100n)
      await myOFT.connect(alice).burn(40n)
      expect(await myOFT.balanceOf(alice.address)).to.equal(60n)
    })

    it('Should revert if burning more than balance', async function () {
      const { myOFT, alice } = await loadFixture(deployFixture)
      await expect(myOFT.connect(alice).burn(150n)).to.be.revertedWithCustomError(myOFT, 'ERC20InsufficientBalance')
    })
  })
})

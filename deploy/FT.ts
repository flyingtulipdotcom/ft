import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'
import { getChainConfig, TOKEN_CONTRACT_NAME } from '../utils/constants';

const deploy: DeployFunction = async (hre) => {

    const { getNamedAccounts, deployments } = hre

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)

    const chainId = await hre.getChainId()

    const chainConfig = getChainConfig(chainId);
    const ftConfigurator = chainConfig?.configurator;
    const endpointV2Address = chainConfig?.endpointV2;

    const isTestnet = (hre.network.config as any).isTestnet ?? false;
    const mintChainId = isTestnet ? 11155111 : 146; // Sepolia : Sonic

    const name = "Flying Tulip";
    const symbol = "FT";
    const delegate = deployer;

    const { address } = await deploy(TOKEN_CONTRACT_NAME, {
        from: deployer,
        args: [
            name,
            symbol,
            endpointV2Address,
            delegate, // update it later in setDelegate task
            ftConfigurator,
            mintChainId
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`Deployed contract: ${TOKEN_CONTRACT_NAME}, network: ${hre.network.name}, address: ${address}`)

    // Sleep for 5 seconds to allow Etherscan to sync
    await new Promise((resolve) => setTimeout(resolve, 5000));

  // Verify it
  try {
    await run("verify:verify", {
      address,
      constructorArguments: [name, symbol, endpointV2Address, delegate, ftConfigurator, mintChainId]
    });
    console.log("Verification successful");
  } catch (error) {
    console.error("Verification failed:", error);
  }
}

deploy.tags = [TOKEN_CONTRACT_NAME]

export default deploy

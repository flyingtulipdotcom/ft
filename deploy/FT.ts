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

    const { address } = await deploy(TOKEN_CONTRACT_NAME, {
        from: deployer,
        args: [
            'Flying Tulip', // name
            'FT', // symbol
            endpointV2Address,
            deployer, // use deployer for the delegate for now and update it later in setDelegate task
            ftConfigurator,
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`Deployed contract: ${TOKEN_CONTRACT_NAME}, network: ${hre.network.name}, address: ${address}`)
}

deploy.tags = [TOKEN_CONTRACT_NAME]

export default deploy

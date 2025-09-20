import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'
import { ENDPOINT_V2_ADDRESSES, FT_CONFIGURATOR_ADDRESSES } from '../utils/constants';

const contractName = 'FT'

const deploy: DeployFunction = async (hre) => {

    const { getNamedAccounts, deployments } = hre

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)

    const chainId = await hre.getChainId()

    const ftConfigurator = FT_CONFIGURATOR_ADDRESSES[chainId];
    const endpointV2Address = ENDPOINT_V2_ADDRESSES[chainId]

    const { address } = await deploy(contractName, {
        from: deployer,
        args: [
            'Flying Tulip', // name
            'FT', // symbol
            endpointV2Address,
            deployer, // delegate, use deployer for now and update it later
            ftConfigurator,
        ],
        log: true,
        skipIfAlreadyDeployed: false,
    })

    console.log(`Deployed contract: ${contractName}, network: ${hre.network.name}, address: ${address}`)

    // TODO: Update delegate and configurator after later
}

deploy.tags = [contractName]

export default deploy

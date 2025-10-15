import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'
import { getChainConfig } from '../utils/constants';

const deploy: DeployFunction = async (hre) => {

    const { getNamedAccounts, deployments, ethers } = hre

    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    assert(deployer, 'Missing named deployer account')

    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)

    const chainId = await hre.getChainId()

    // Enforce Sonic mainnet only
    if (chainId !== '146') {
        throw new Error(`This deploy script is restricted to Sonic mainnet (146). Current: ${chainId}`)
    }

    const chainConfig = getChainConfig(chainId);
    if (!chainConfig?.endpointV2) {
        throw new Error(`Missing LayerZero endpointV2 address for chain ${chainId}`)
    }

    const endpointV2Address = chainConfig.endpointV2;

    // Test token config
    const name = "Flying Tulip Test";
    const symbol = "FTT";

    // Make deployer both owner (delegate) and configurator so full mint goes to deployer
    const delegate = deployer;
    const ftConfigurator = deployer;

    // Mint only on Sonic
    const mintChainId = 146;

    const DEPLOYMENT_NAME = 'FTT'
    const ARTIFACT_NAME = 'FT'

    const { address } = await deploy(DEPLOYMENT_NAME, {
        contract: ARTIFACT_NAME,
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

    console.log(`Deployed contract: ${DEPLOYMENT_NAME} (artifact ${ARTIFACT_NAME}), network: ${hre.network.name}, address: ${address}`)

    // Ensure token is unpaused
    const ftt = await ethers.getContractAt(ARTIFACT_NAME, address)
    if (await ftt.paused()) {
        console.log('Token is paused; unpausing...')
        await (await ftt.setPaused(false)).wait()
    } else {
        console.log('Token already unpaused')
    }
}

deploy.tags = ['FTT']

export default deploy

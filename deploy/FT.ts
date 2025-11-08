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

    // Q-1: Validate that chain config exists and has required fields
    if (!chainConfig) {
        throw new Error(`No configuration found for chain ID ${chainId}. Please add chain config to utils/constants.ts`);
    }

    const ftConfigurator = chainConfig.configurator;
    const endpointV2Address = chainConfig.endpointV2;

    if (!ftConfigurator) {
        throw new Error(`Configurator address not defined for chain ${chainConfig.name} (ID: ${chainId})`);
    }

    if (!endpointV2Address) {
        throw new Error(`LayerZero Endpoint V2 address not defined for chain ${chainConfig.name} (ID: ${chainId})`);
    }

    console.log(`Chain Config: ${chainConfig.name}`);
    console.log(`Configurator: ${ftConfigurator}`);
    console.log(`Endpoint V2: ${endpointV2Address}`);

    // Check for Etherscan API key
    if (!process.env.ETHERSCAN_API_KEY) {
        throw new Error('ETHERSCAN_API_KEY not set in .env file. Contract verification requires an API key.');
    }

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

  // I-1: Verify contract on Etherscan/block explorer
  try {
    console.log("Starting contract verification...");
    await hre.run("verify:verify", {
      address,
      constructorArguments: [name, symbol, endpointV2Address, delegate, ftConfigurator, mintChainId]
    });
    console.log("✅ Verification successful");
  } catch (error) {
    console.error("❌ Verification failed:", error);
    console.log("You can verify manually later using:");
    console.log(`npx hardhat verify --network ${hre.network.name} ${address} "${name}" "${symbol}" ${endpointV2Address} ${delegate} ${ftConfigurator} ${mintChainId}`);
  }

  // Transfer ownership to final owner
  const finalOwner = chainConfig.finalOwner;
  console.log(`\nTransferring ownership to final owner: ${finalOwner}`);

  const ft = await hre.ethers.getContractAt(TOKEN_CONTRACT_NAME, address);
  const transferTx = await ft.transferOwnership(finalOwner);
  await transferTx.wait(2); // Wait for 2 confirmations
  console.log(`✅ Ownership transferred to ${finalOwner}`);

  // Run post-deployment state check
  console.log(`\n${'='.repeat(60)}`);
  console.log('Running post-deployment state check...');
  console.log('='.repeat(60));

  const { runDeploymentCheck } = await import('../scripts/check-deployment');
  const checksPass = await runDeploymentCheck(hre);

  if (!checksPass) {
    throw new Error('Post-deployment checks failed! Please review the deployment.');
  }

  console.log('\n✅ Deployment complete and all checks passed!');
}

deploy.tags = [TOKEN_CONTRACT_NAME]

export default deploy

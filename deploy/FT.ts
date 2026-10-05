import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'
import { getChainConfig, TOKEN_CONTRACT_NAME, FT_DETERMINISTIC_ADDRESS, FT_DETERMINISTIC_NONCE } from '../utils/constants';
import {
    assertDeterministicDeployment,
    FT_CANONICAL_INIT_CODE_HASH,
    getFTConstructorArgs
} from '../utils/deterministic';
import { getSigner } from '../utils/getSigner';
import { FT } from '../typechain-types';

const deploy: DeployFunction = async (hre) => {

    const { deployments } = hre

    // Get signer (handles keystore, private key, or mnemonic)
    const signer = await getSigner(hre);
    const deployer = signer.address;

    assert(deployer, 'Missing deployer account - check your KEYSTORE_PATH, PRIVATE_KEY, or MNEMONIC in .env')

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
    const delegate = chainConfig.delegate;
    const finalOwner = chainConfig.finalOwner;

    if (!ftConfigurator) {
        throw new Error(`Configurator address not defined for chain ${chainConfig.name} (ID: ${chainId})`);
    }

    if (!endpointV2Address) {
        throw new Error(`LayerZero Endpoint V2 address not defined for chain ${chainConfig.name} (ID: ${chainId})`);
    }

    if (!delegate) {
        throw new Error(`Delegate address not defined for chain ${chainConfig.name} (ID: ${chainId})`);
    }

    if (!finalOwner) {
        throw new Error(`Final owner not defined for chain ${chainConfig.name} (ID: ${chainId})`);
    }

    console.log(`Chain Config: ${chainConfig.name}`);
    console.log(`Configurator: ${ftConfigurator} owner of the initial mint if network is sonic`);
    console.log(`Endpoint V2: ${endpointV2Address}`);
    console.log(`Delegate: ${delegate}`);
    console.log(`Final Owner: ${finalOwner}`);
    // Host only: provider URLs often embed an API key
    const rpcUrl = (hre.network.config as any).url;
    console.log(`RPC: ${rpcUrl ? new URL(rpcUrl).host : 'n/a'}`);

    const isTestnet = (hre.network.config as any).isTestnet ?? false;
    const args = getFTConstructorArgs(chainConfig, isTestnet);
    const [name, symbol, , , , mintChainId] = args;
    const FTFactory = await hre.ethers.getContractFactory(TOKEN_CONTRACT_NAME, signer);
    const deploymentRequest = await FTFactory.getDeployTransaction(...args);
    if (!deploymentRequest.data) {
        throw new Error('Could not build FT init code');
    }
    const initCode = deploymentRequest.data;

    if (chainConfig.deterministic) {
        console.log(`Expected FT address: ${FT_DETERMINISTIC_ADDRESS} (CREATE, nonce ${FT_DETERMINISTIC_NONCE})`);
        console.log(`Expected FT init code hash: ${FT_CANONICAL_INIT_CODE_HASH}`);
        await assertDeterministicDeployment(hre.ethers.provider, deployer, args, initCode);
        console.log('✅ Deterministic deployment pre-checks passed');
    }

    // Ask for confirmation before proceeding
    console.log('\n⚠️  Please review the configuration above.');
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const confirmed = await new Promise<boolean>((resolve) => {
        rl.question('\nDo you want to proceed with deployment? (yes/no): ', (answer: string) => {
            rl.close();
            resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
        });
    });

    if (!confirmed) {
        console.log('Deployment cancelled by user.');
        process.exit(0);
    }

    console.log('\n✅ Proceeding with deployment...\n');

    // Check for Etherscan API key
    if (!process.env.ETHERSCAN_API_KEY) {
        throw new Error('ETHERSCAN_API_KEY not set in .env file. Contract verification requires an API key.');
    }

    if (chainConfig.deterministic) {
        // Re-check right before sending: the nonce must not have moved while waiting for confirmation
        await assertDeterministicDeployment(hre.ethers.provider, deployer, args, initCode);
    }

    // Use ethers directly for deployment to support keystore
    console.log(`\nDeploying ${TOKEN_CONTRACT_NAME}...`);

    // Pin the nonce so a deterministic deploy can never land at a different address
    const overrides = chainConfig.deterministic ? { nonce: FT_DETERMINISTIC_NONCE } : {};
    const ft = await FTFactory.deploy(...args, overrides) as unknown as FT;

    console.log(`Deployment transaction: ${ft.deploymentTransaction()?.hash}`);
    await ft.waitForDeployment();
    const address = await ft.getAddress();

    if (chainConfig.deterministic && address.toLowerCase() !== FT_DETERMINISTIC_ADDRESS.toLowerCase()) {
        throw new Error(`FT deployed at ${address}, expected ${FT_DETERMINISTIC_ADDRESS}`);
    }

    // Save deployment for hardhat-deploy compatibility and future reference
    const artifact = await hre.artifacts.readArtifact(TOKEN_CONTRACT_NAME);
    await deployments.save(TOKEN_CONTRACT_NAME, {
        address: address,
        abi: artifact.abi,
        bytecode: artifact.bytecode,
        deployedBytecode: artifact.deployedBytecode,
        args,
        transactionHash: ft.deploymentTransaction()?.hash,
    });

    console.log(`Deployed contract: ${TOKEN_CONTRACT_NAME}, network: ${hre.network.name}, address: ${address}`)

    // Wait for more confirmations before verification
    console.log('\nWaiting for 5 block confirmations before verification...');
    await ft.deploymentTransaction()?.wait(5); // Wait for 5 confirmations
    console.log('Block confirmations received');

    // Additional delay to allow Etherscan to index
    console.log('Waiting for Etherscan to index the contract...');
    await new Promise((resolve) => setTimeout(resolve, 15000)); // 15 seconds

  // I-1: Verify contract on Etherscan/block explorer
  try {
    console.log("Starting contract verification...");
    await hre.run("verify:verify", {
      address,
      constructorArguments: args
    });
    console.log("✅ Verification successful");
  } catch (error) {
    console.error("❌ Verification failed:", error);
    console.log("You can verify manually later using:");
    console.log(`npx hardhat verify --network ${hre.network.name} ${address} "${name}" "${symbol}" ${endpointV2Address} ${delegate} ${ftConfigurator} ${mintChainId}`);
  }

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

import assert from 'assert'

import { type DeployFunction } from 'hardhat-deploy/types'
import { getChainConfig, TOKEN_CONTRACT_NAME } from '../utils/constants';
import { getSigner } from '../utils/getSigner';
import { FT } from '../typechain-types';
import {
    assertPinnedDeploymentReady,
    buildPinnedFTDeployment,
    FT_DEPLOYER,
} from '../scripts/lib/ft-deployment';
import { assertLocalAnvilFork } from '../scripts/lib/rollout-fork';
import { JsonRpcProvider, type Signer } from 'ethers';

const deploy: DeployFunction = async (hre) => {

    const { deployments } = hre

    const chainId = await hre.getChainId()
    const isTestnet = (hre.network.config as any).isTestnet ?? false;
    const deploymentMode = process.env.FT_DEPLOYMENT_MODE;

    // A dry run must prove that the provider is a pinned localhost Anvil fork
    // before a keystore is opened, including on testnets.
    if (deploymentMode === 'dry-run') {
        const dryRunRpcUrl = (hre.network.config as any).url as string | undefined;
        if (!dryRunRpcUrl) throw new Error('Dry-run network requires an explicit RPC URL');
        const safetyProvider = new JsonRpcProvider(
            dryRunRpcUrl,
            Number(chainId),
            { staticNetwork: true, cacheTimeout: -1 },
        );
        try {
            await assertLocalAnvilFork(safetyProvider, Number(chainId));
        } finally {
            safetyProvider.destroy();
        }
    } else if (!isTestnet) {
        // Mainnet deployment is default-deny and the opt-in is bound to the
        // selected network, preventing a copied command from targeting another
        // configured chain by mistake.
        if (deploymentMode !== `live:${hre.network.name}`) {
            throw new Error(
                `Mainnet FT deployment is locked. Use ft:dry-run-deploy for a rehearsal, or set FT_DEPLOYMENT_MODE=live:${hre.network.name} for an intentional broadcast.`,
            );
        }
        if (!process.env.KEYSTORE_PATH) {
            throw new Error('Live mainnet FT deployment requires KEYSTORE_PATH; mnemonic/private-key fallback is disabled.');
        }
    }

    let signer: Signer;
    if (deploymentMode === 'dry-run') {
        if (process.env.FT_DRY_RUN_VALIDATE_KEYSTORE === '1') {
            // Validate decryption and the address, but never use the real key to
            // sign a dry-run transaction. The transaction is produced by
            // Anvil's explicitly impersonated account instead.
            const keystoreSigner = await getSigner(hre);
            if (keystoreSigner.address !== FT_DEPLOYER) {
                throw new Error(`Keystore address ${keystoreSigner.address} does not match FT deployer ${FT_DEPLOYER}`);
            }
            console.log('Dry-run keystore validated; the real key will not sign any transaction.');
        }
        signer = await hre.ethers.provider.getSigner(FT_DEPLOYER);
    } else {
        // Live deployments use the configured keystore (or dev-only fallback).
        signer = await getSigner(hre);
    }
    const deployer = await signer.getAddress();

    assert(deployer, 'Missing deployer account - check your KEYSTORE_PATH, PRIVATE_KEY, or MNEMONIC in .env')

    console.log(`Network: ${hre.network.name}`)
    console.log(`Deployer: ${deployer}`)

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

    const mintChainId = isTestnet ? 11155111 : 146;
    const name = "Flying Tulip";
    const symbol = "FT";
    const pinnedConfig = {
        chainId: Number(chainId), endpoint: endpointV2Address,
        eid: (hre.network.config as any).eid as number | undefined,
        delegate, configurator: ftConfigurator,
    };
    const pinnedPlan = isTestnet ? undefined : buildPinnedFTDeployment(pinnedConfig);
    if (pinnedPlan) {
        await assertPinnedDeploymentReady(hre.ethers.provider, pinnedConfig, deployer);
        console.log(`Pinned production artifact: ${pinnedPlan.artifact}`);
        console.log(`Expected CREATE address: ${pinnedPlan.expectedAddress} (nonce 0)`);
        console.log(`Creation bytecode hash: ${pinnedPlan.bytecodeHash}`);
        console.log(`Init code hash: ${pinnedPlan.initCodeHash}`);
        console.log(`Expected runtime hash: ${pinnedPlan.runtimeExpectedHash}`);
    }

    // Ask for confirmation before proceeding. Auto-confirmation is accepted
    // only inside a provider-verified local dry run, never for live mode.
    console.log('\n⚠️  Please review the configuration above.');
    let confirmed = deploymentMode === 'dry-run' && process.env.FT_DRY_RUN_AUTO_CONFIRM === 'yes';
    if (!confirmed) {
        const readline = require('readline');
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        confirmed = await new Promise<boolean>((resolve) => {
            rl.question('\nDo you want to proceed with deployment? (yes/no): ', (answer: string) => {
                rl.close();
                resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
            });
        });
    } else {
        console.log('Dry-run deployment confirmation supplied by ft:dry-run-deploy.');
    }

    if (!confirmed) {
        console.log('Deployment cancelled by user.');
        process.exit(0);
    }

    console.log('\n✅ Proceeding with deployment...\n');

    // Check for Etherscan API key
    if (isTestnet && !process.env.ETHERSCAN_API_KEY) {
        throw new Error('ETHERSCAN_API_KEY not set in .env file. Contract verification requires an API key.');
    }

    // Use ethers directly for deployment to support keystore
    console.log(`\nDeploying ${TOKEN_CONTRACT_NAME}...`);

    const FTFactory = pinnedPlan
        ? new hre.ethers.ContractFactory(pinnedPlan.abi, pinnedPlan.bytecode, signer)
        : await hre.ethers.getContractFactory(TOKEN_CONTRACT_NAME, signer);
    const args = pinnedPlan ? [...pinnedPlan.args] : [name, symbol, endpointV2Address, delegate, ftConfigurator, mintChainId];
    if (pinnedPlan) {
        const unsigned = await FTFactory.getDeployTransaction(...args);
        if (unsigned.data !== pinnedPlan.data) throw new Error('Pinned FT init code changed before submission');
        // Repeat after the confirmation prompt. Never consume an already-used or pending nonce.
        await assertPinnedDeploymentReady(hre.ethers.provider, pinnedConfig, deployer);
    }
    const ft = await FTFactory.deploy(...args, ...(pinnedPlan ? [{ nonce: 0 }] : [])) as unknown as FT;

    console.log(`Deployment transaction: ${ft.deploymentTransaction()?.hash}`);
    await ft.waitForDeployment();
    const address = await ft.getAddress();
    if (pinnedPlan) {
        if (address !== pinnedPlan.expectedAddress) throw new Error(`Unexpected FT deployment address ${address}`);
        const runtimeHash = hre.ethers.keccak256(await hre.ethers.provider.getCode(address));
        if (runtimeHash !== pinnedPlan.runtimeExpectedHash) throw new Error(`Unexpected FT runtime hash ${runtimeHash}`);
    }

    // Save deployment for hardhat-deploy compatibility and future reference
    // Mainnet records must survive even if the unrelated local compiler artifacts are absent.
    const compiledArtifact = pinnedPlan
        ? await hre.artifacts.readArtifact(TOKEN_CONTRACT_NAME).catch(() => undefined)
        : await hre.artifacts.readArtifact(TOKEN_CONTRACT_NAME);
    const artifact = pinnedPlan || compiledArtifact!;
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

    const canVerifyCurrentBuild = !pinnedPlan || compiledArtifact?.bytecode === pinnedPlan.bytecode;
    if (canVerifyCurrentBuild && process.env.ETHERSCAN_API_KEY) {
      // Additional delay to allow Etherscan to index
      console.log('Waiting for Etherscan to index the contract...');
      await new Promise((resolve) => setTimeout(resolve, 15000));

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
    } else {
      console.log('Explorer verification was not attempted. Use the original production compiler input matching the pinned bytecode and the recorded constructor arguments; this is separate from the runtime hash check.');
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

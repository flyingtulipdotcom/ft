// Get the environment configuration from .env file
//
// To make use of automatic environment setup:
// - Duplicate .env.example file and name it .env
// - Fill in the environment variables
import 'dotenv/config'

import 'hardhat-deploy'
import 'hardhat-contract-sizer'
import 'hardhat-gas-reporter'
import 'hardhat-storage-layout'
import 'hardhat-abi-exporter'
import '@nomicfoundation/hardhat-ethers'
import '@typechain/hardhat'
import '@nomicfoundation/hardhat-chai-matchers'
import '@nomicfoundation/hardhat-toolbox'
import 'solidity-coverage'
import { HardhatUserConfig, HttpNetworkAccountsUserConfig } from 'hardhat/types'
import { EndpointId } from '@layerzerolabs/lz-definitions'

// Set your preferred authentication method
//
// If you prefer using a mnemonic, set a MNEMONIC environment variable
// to a valid mnemonic
const MNEMONIC = process.env.MNEMONIC

// If you prefer to be authenticated using a private key, set a PRIVATE_KEY environment variable
const PRIVATE_KEY = process.env.PRIVATE_KEY

const accounts: HttpNetworkAccountsUserConfig | undefined = MNEMONIC
    ? { mnemonic: MNEMONIC }
    : PRIVATE_KEY
      ? [PRIVATE_KEY]
      : undefined

if (accounts == null) {
    console.warn(
        'Could not find MNEMONIC or PRIVATE_KEY environment variables. It will not be possible to execute transactions in your example.'
    )
}

const config: HardhatUserConfig = {
    paths: {
        cache: 'cache/hardhat',
    },
    solidity: {
        compilers: [
            {
                version: '0.8.30',
                settings: {
                    evmVersion: 'cancun',
                    optimizer: {
                        enabled: true,
                        runs: 200,
                    },
                    viaIR: true,
                },
            },
        ],
    },
    external: {
        contracts: [
            {
                // Specify the exact path
                artifacts: 'node_modules/@layerzerolabs/test-devtools-evm-hardhat/artifacts',
                deploy: 'node_modules/@layerzerolabs/test-devtools-evm-hardhat/deploy',
            },
        ],
        deployments: {
            hardhat: ['node_modules/@layerzerolabs/test-devtools-evm-hardhat/deployments/hardhat'],
        },
    },
    networks: {
        'sonic-mainnet': {
            eid: EndpointId.SONIC_V2_MAINNET,
            url: process.env.RPC_URL_SONIC || 'https://rpc.soniclabs.com',
            accounts,
        },
        'bsc-mainnet': {
            eid: EndpointId.BSC_V2_MAINNET,
            url: process.env.RPC_URL_BSC || 'https://bsc.drpc.org',
            accounts,
        },
        'ethereum-mainnet': {
            eid: EndpointId.ETHEREUM_V2_MAINNET,
            url: process.env.RPC_URL_ETHEREUM || 'https://INSERT-RPC',
            accounts,
        },
        'avalanche-mainnet': {
            eid: EndpointId.AVALANCHE_V2_MAINNET,
            url: process.env.RPC_URL_AVALANCHE || 'https://api.avax.network/ext/bc/C/rpc',
            accounts,
        },
        hardhat: {
            // Need this for testing because TestHelperOz5.sol is exceeding the compiled contract size limit
            allowUnlimitedContractSize: true,
        },
    },
    namedAccounts: {
        deployer: {
            default: 0, // wallet address of index[0], of the mnemonic in .env
        },
    },
    contractSizer: {
        alphaSort: true,
        runOnCompile: true,
        disambiguatePaths: false,
        except: ['test', '@openzeppelin', '@layerzerolabs'],
    },
    gasReporter: {
        enabled: false,
        showMethodSig: true,
    },
    abiExporter: {
        path: './data/abi',
        runOnCompile: false,
        clear: true,
        flat: true,
        spacing: 2,
        format: 'json',
        except: ['/interfaces', '/test', '@layerzerolabs', '@openzeppelin'],
    },
    typechain: {
        target: 'ethers-v6', // Target ethers v6
        alwaysGenerateOverloads: false,
        discriminateTypes: false,
        dontOverrideCompile: false,
    },
}

export default config

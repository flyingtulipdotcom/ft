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
import '@nomicfoundation/hardhat-chai-matchers'
import '@nomicfoundation/hardhat-toolbox'
import 'solidity-coverage'
import '@typechain/hardhat'
import "./tasks"
import { HardhatUserConfig, HttpNetworkAccountsUserConfig } from 'hardhat/types'
import { EndpointId } from '@layerzerolabs/lz-definitions'

declare module 'hardhat/types/config' {
  interface HttpNetworkUserConfig {
    eid?: EndpointId;
    isTestnet?: boolean;
  }
}

// Set your preferred authentication method
//
// Priority: KEYSTORE_PATH > MNEMONIC > PRIVATE_KEY
//
// Option 1 (Recommended for Production): Use an encrypted keystore file
// Set KEYSTORE_PATH to the path of your keystore file (e.g., ~/.foundry/keystores/keystore-file)
// You will be prompted for password at runtime
const KEYSTORE_PATH = process.env.KEYSTORE_PATH

// Option 2 (ONLY for Testing, NOT RECOMMENDED FOR PRODUCTION): Use a mnemonic
const MNEMONIC = process.env.MNEMONIC

// Option 3 (ONLY for Testing, NOT RECOMMENDED FOR PRODUCTION): Use a private key
const PRIVATE_KEY = process.env.PRIVATE_KEY

// Load keystore synchronously if provided, otherwise fall back to mnemonic or private key
let accounts: HttpNetworkAccountsUserConfig | undefined = undefined

if (KEYSTORE_PATH) {
    // For keystore, we need to load it at runtime in tasks/scripts
    // But for hardhat-deploy compatibility, we can use a custom provider
    // Leave accounts undefined and handle in deploy script
    console.log('Using keystore authentication. Password will be requested when needed.')
} else if (MNEMONIC) {
    accounts = { mnemonic: MNEMONIC }
} else if (PRIVATE_KEY) {
    accounts = [PRIVATE_KEY]
}

if (accounts == null && !KEYSTORE_PATH) {
    console.warn(
        'Could not find KEYSTORE_PATH, MNEMONIC, or PRIVATE_KEY environment variables. It will not be possible to execute transactions.'
    )
}

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || '';
const SAFE_API_KEY = process.env.SAFE_API_KEY || '';

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
                        runs: 9999999,
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
        hardhat: {
            // Need this for testing because some exceed the compiled contract size limit
            allowUnlimitedContractSize: true,
        },
        'sonic': {
            eid: EndpointId.SONIC_V2_MAINNET,
            url: process.env.RPC_URL_SONIC || 'https://rpc.soniclabs.com',
            isTestnet: false,
            accounts,
        },
        'bsc': {
            eid: EndpointId.BSC_V2_MAINNET,
            url: process.env.RPC_URL_BSC || 'https://binance.llamarpc.com',
            isTestnet: false,
            accounts,
        },
        'ethereum': {
            eid: EndpointId.ETHEREUM_V2_MAINNET,
            url: process.env.RPC_URL_ETHEREUM || 'https://ethereum-rpc.publicnode.com',
            isTestnet: false,
            accounts,
        },
        'avalanche': {
            eid: EndpointId.AVALANCHE_V2_MAINNET,
            url: process.env.RPC_URL_AVALANCHE || 'https://api.avax.network/ext/bc/C/rpc',
            isTestnet: false,
            accounts,
        },
        'base': {
            eid: EndpointId.BASE_V2_MAINNET,
            url: process.env.RPC_URL_BASE || 'https://base-rpc.publicnode.com',
            isTestnet: false,
            accounts,
        },
        'bsc-testnet': {
            eid: EndpointId.BSC_V2_TESTNET,
            url: process.env.RPC_URL_BSC_TESTNET || 'https://bsc-testnet.drpc.org',
            isTestnet: true,
            accounts,
        },
        'sepolia': {
            eid: EndpointId.ETHEREUM_V2_TESTNET,
            url: process.env.RPC_URL_ETHEREUM_TESTNET || 'https://sepolia.gateway.tenderly.co',
            isTestnet: true,
            accounts,
        },
        'fuji': {
            eid: EndpointId.AVALANCHE_V2_TESTNET,
            url: process.env.RPC_URL_AVALANCHE_TESTNET || 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
            isTestnet: true,
            accounts,
        },
        'base-sepolia': {
            eid: EndpointId.BASE_V2_TESTNET,
            url: process.env.RPC_URL_BASE_TESTNET || 'https://sepolia.base.org',
            isTestnet: true,
            accounts,
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
        customChains: [
        {
            network: "sonic",
            chainId: 146,
            urls: {
                apiURL: "https://api.etherscan.io/v2/api",
                browserURL: "https://sonicscan.org"
            }
        },
        ],
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

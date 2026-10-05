import { BytesLike, getCreateAddress, keccak256, Provider } from 'ethers'
import {
    ChainConfig,
    FT_DETERMINISTIC_ADDRESS,
    FT_DETERMINISTIC_DEPLOYER,
    FT_DETERMINISTIC_NONCE,
} from './constants'

export const FT_NAME = 'Flying Tulip'
export const FT_SYMBOL = 'FT'
export const MAINNET_MINT_CHAIN_ID = 146 // Sonic
export const TESTNET_MINT_CHAIN_ID = 11155111 // Sepolia

// Roles every live mainnet FT (0x5DD1...082c) was constructed with. Deterministic deployments must
// reuse them so the token is configured identically on every chain (ownership moves to the
// final owner multisig after deployment).
export const FT_CANONICAL_DELEGATE = '0x22246a9183ce2ce6e2c2a9973f94aea91435017c'
export const FT_CANONICAL_CONFIGURATOR = '0x22246a9183ce2ce6e2c2a9973f94aea91435017c'
// Exact FT creation payload (compiled bytecode + constructor args) used for the live Sonic FT.
// Monad and Robinhood use the same EndpointV2 and constructor args, so their init code must match.
export const FT_CANONICAL_INIT_CODE_HASH = '0xaeb36c5db598274a6ab78158fb1799a2b40aaab55a27b6ff28597429d46260dd'

export type FTConstructorArgs = [string, string, string, string, string, number]

export function getFTConstructorArgs(chainConfig: ChainConfig, isTestnet: boolean): FTConstructorArgs {
    const mintChainId = isTestnet ? TESTNET_MINT_CHAIN_ID : MAINNET_MINT_CHAIN_ID
    return [FT_NAME, FT_SYMBOL, chainConfig.endpointV2, chainConfig.delegate, chainConfig.configurator, mintChainId]
}

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * Throws unless deploying now will put FT at FT_DETERMINISTIC_ADDRESS with the canonical
 * constructor args: right deployer, nonce untouched (latest and pending), nothing at the target yet.
 */
export async function assertDeterministicDeployment(
    provider: Provider,
    deployer: string,
    args: FTConstructorArgs,
    initCode: BytesLike
): Promise<void> {
    const errors: string[] = []

    if (!sameAddress(deployer, FT_DETERMINISTIC_DEPLOYER)) {
        errors.push(`Deployer is ${deployer}, expected ${FT_DETERMINISTIC_DEPLOYER} (check KEYSTORE_PATH)`)
    }

    const [latestNonce, pendingNonce] = await Promise.all([
        provider.getTransactionCount(FT_DETERMINISTIC_DEPLOYER, 'latest'),
        provider.getTransactionCount(FT_DETERMINISTIC_DEPLOYER, 'pending'),
    ])
    if (latestNonce !== FT_DETERMINISTIC_NONCE || pendingNonce !== FT_DETERMINISTIC_NONCE) {
        errors.push(
            `Deployer nonce is ${latestNonce} (pending ${pendingNonce}), expected ${FT_DETERMINISTIC_NONCE}. ` +
                `The FT address on this chain can no longer be ${FT_DETERMINISTIC_ADDRESS}`
        )
    }

    const predicted = getCreateAddress({ from: FT_DETERMINISTIC_DEPLOYER, nonce: FT_DETERMINISTIC_NONCE })
    if (!sameAddress(predicted, FT_DETERMINISTIC_ADDRESS)) {
        errors.push(`CREATE address ${predicted} does not match ${FT_DETERMINISTIC_ADDRESS}`)
    }

    const initCodeHash = keccak256(initCode)
    if (initCodeHash !== FT_CANONICAL_INIT_CODE_HASH) {
        errors.push(
            `FT init code hash is ${initCodeHash}, expected ${FT_CANONICAL_INIT_CODE_HASH}. ` +
                `The compiled bytecode or constructor arguments differ from the reviewed Sonic deployment`
        )
    }

    // CREATE also fails if the target already has a nonce (EIP-684)
    const [targetCode, targetNonce] = await Promise.all([
        provider.getCode(FT_DETERMINISTIC_ADDRESS),
        provider.getTransactionCount(FT_DETERMINISTIC_ADDRESS, 'latest'),
    ])
    if (targetCode !== '0x' || targetNonce !== 0) {
        errors.push(`Target ${FT_DETERMINISTIC_ADDRESS} already used (code ${targetCode.length > 2 ? 'present' : 'empty'}, nonce ${targetNonce})`)
    }

    const [name, symbol, endpoint, delegate, configurator, mintChainId] = args
    if ((await provider.getCode(endpoint)) === '0x') {
        errors.push(`No LayerZero EndpointV2 code at ${endpoint}`)
    }
    if (name !== FT_NAME || symbol !== FT_SYMBOL) {
        errors.push(`Name/symbol ${name}/${symbol}, expected ${FT_NAME}/${FT_SYMBOL}`)
    }
    if (!sameAddress(delegate, FT_CANONICAL_DELEGATE)) {
        errors.push(`Delegate ${delegate}, expected ${FT_CANONICAL_DELEGATE} (unset FT_DELEGATE in .env)`)
    }
    if (!sameAddress(configurator, FT_CANONICAL_CONFIGURATOR)) {
        errors.push(`Configurator ${configurator}, expected ${FT_CANONICAL_CONFIGURATOR} (unset FT_CONFIGURATOR in .env)`)
    }
    if (mintChainId !== MAINNET_MINT_CHAIN_ID) {
        errors.push(`Mint chain id ${mintChainId}, expected ${MAINNET_MINT_CHAIN_ID}`)
    }

    if (errors.length > 0) {
        throw new Error(`Deterministic deployment pre-checks failed:\n - ${errors.join('\n - ')}`)
    }
}

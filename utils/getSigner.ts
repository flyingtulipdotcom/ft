import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { loadKeystorePrivateKey } from './keystore'
import { Wallet } from 'ethers'

/**
 * Get the signer for transactions, supporting keystore, mnemonic, or private key
 * Priority: KEYSTORE_PATH > MNEMONIC > PRIVATE_KEY
 */
export async function getSigner(hre: HardhatRuntimeEnvironment): Promise<Wallet> {
    const KEYSTORE_PATH = process.env.KEYSTORE_PATH

    // Priority 1: Keystore (recommended)
    if (KEYSTORE_PATH) {
        try {
            const privateKey = await loadKeystorePrivateKey(KEYSTORE_PATH)
            const wallet = new Wallet(privateKey, hre.ethers.provider)
            console.log(`Using keystore signer: ${wallet.address}`)
            return wallet
        } catch (error) {
            console.error('Failed to load keystore:', error instanceof Error ? error.message : error)
            console.warn('Falling back to default signer...')
        }
    }

    // Priority 2 & 3: Mnemonic or Private Key (via Hardhat config)
    const [signer] = await hre.ethers.getSigners()
    console.log(`Using signer: ${signer.address}`)
    return signer as unknown as Wallet
}

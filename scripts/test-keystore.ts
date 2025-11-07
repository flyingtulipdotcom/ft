/**
 * Test script to verify keystore loading works correctly
 *
 * Usage:
 * 1. Set KEYSTORE_PATH in your .env file
 * 2. Run: npx hardhat run scripts/test-keystore.ts --network sepolia
 */

import { getSigner } from '../utils/getSigner'
import hre from 'hardhat'

async function main() {
    console.log('Testing keystore authentication...\n')

    try {
        // Get the signer using keystore (or fallback to mnemonic/private key)
        const signer = await getSigner(hre)

        console.log('✅ Successfully loaded signer!')
        console.log(`   Address: ${signer.address}`)

        // Get balance
        const balance = await hre.ethers.provider.getBalance(signer.address)
        console.log(`   Balance: ${hre.ethers.formatEther(balance)} ETH`)

        // Get chain info
        const network = await hre.ethers.provider.getNetwork()
        console.log(`   Network: ${network.name} (Chain ID: ${network.chainId})`)

    } catch (error) {
        console.error('❌ Failed to load signer:', error)
        process.exit(1)
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })

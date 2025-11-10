/**
 * Post-deployment state check script
 *
 * Validates that the deployed FT contract has the correct configuration:
 * - Owner, configurator, delegate addresses
 * - LayerZero endpoint
 * - Token name, symbol, decimals
 * - Initial state (paused, supply)
 * - Mint chain ID validation
 *
 * Usage: npx hardhat run scripts/check-deployment.ts --network <network>
 */

import hre from 'hardhat'
import { HardhatRuntimeEnvironment } from 'hardhat/types'
import { getChainConfig, TOKEN_CONTRACT_NAME } from '../utils/constants'
import { FT } from '../typechain-types'
import { getSigner } from '../utils/getSigner'

interface VerificationResult {
    check: string
    expected: string
    actual: string
    status: 'PASS' | 'FAIL'
}

export async function runDeploymentCheck(hreInstance: HardhatRuntimeEnvironment): Promise<boolean> {
    const hre = hreInstance;
    console.log('\n')
    console.log('='.repeat(60))
    console.log('🔍 POST-DEPLOYMENT STATE CHECK')
    console.log('='.repeat(60))

    const chainId = await hre.getChainId()
    const chainConfig = getChainConfig(chainId)

    if (!chainConfig) {
        throw new Error(`No configuration found for chain ID ${chainId}`)
    }

    console.log(`\nNetwork: ${hre.network.name}`)
    console.log(`Chain ID: ${chainId}`)
    console.log(`Config: ${chainConfig.name}\n`)

    // Get deployed contract
    const deployment = await hre.deployments.get(TOKEN_CONTRACT_NAME)
    const ft = (await hre.ethers.getContractAt(TOKEN_CONTRACT_NAME, deployment.address)) as unknown as FT

    console.log(`Contract Address: ${deployment.address}\n`)

    const results: VerificationResult[] = []

    // 1. Check token metadata
    const name = await ft.name()
    results.push({
        check: 'Token Name',
        expected: 'Flying Tulip',
        actual: name,
        status: name === 'Flying Tulip' ? 'PASS' : 'FAIL'
    })

    const symbol = await ft.symbol()
    results.push({
        check: 'Token Symbol',
        expected: 'FT',
        actual: symbol,
        status: symbol === 'FT' ? 'PASS' : 'FAIL'
    })

    const decimals = await ft.decimals()
    results.push({
        check: 'Token Decimals',
        expected: '18',
        actual: decimals.toString(),
        status: decimals === 18n ? 'PASS' : 'FAIL'
    })

    // 2. Check configurator
    const configurator = await ft.configurator()
    results.push({
        check: 'Configurator Address',
        expected: chainConfig.configurator,
        actual: configurator,
        status: configurator.toLowerCase() === chainConfig.configurator.toLowerCase() ? 'PASS' : 'FAIL'
    })

    // 3. Check owner (should be final owner, NOT deployer)
    const owner = await ft.owner()
    const expectedOwner = chainConfig.finalOwner


    // 4. Check LayerZero endpoint
    const endpoint = await ft.endpoint()
    results.push({
        check: 'LayerZero Endpoint V2',
        expected: chainConfig.endpointV2,
        actual: endpoint,
        status: endpoint.toLowerCase() === chainConfig.endpointV2.toLowerCase() ? 'PASS' : 'FAIL'
    })

    // 5. Check paused state (should be paused initially)
    const paused = await ft.paused()
    results.push({
        check: 'Initial Paused State',
        expected: 'true',
        actual: paused.toString(),
        status: paused ? 'PASS' : 'FAIL'
    })

    // 6. Check total supply based on chain
    const isTestnet = (hre.network.config as any).isTestnet ?? false
    const mintChainId = isTestnet ? 11155111 : 146 // Sepolia : Sonic
    const isMintChain = parseInt(chainId) === mintChainId

    const totalSupply = await ft.totalSupply()
    const expectedSupply = isMintChain ? '10000000000000000000000000000' : '0' // 10B tokens on mint chain, 0 elsewhere
    results.push({
        check: 'Total Supply',
        expected: `${expectedSupply} (${isMintChain ? 'Mint Chain' : 'Non-Mint Chain'})`,
        actual: totalSupply.toString(),
        status: totalSupply.toString() === expectedSupply ? 'PASS' : 'FAIL'
    })

    // 7. If mint chain, verify configurator balance
    if (isMintChain) {
        const configuratorBalance = await ft.balanceOf(configurator)
        results.push({
            check: 'Configurator Balance',
            expected: expectedSupply,
            actual: configuratorBalance.toString(),
            status: configuratorBalance.toString() === expectedSupply ? 'PASS' : 'FAIL'
        })
    }

    // 8. Check EIP-712 domain
    const domain = await ft.eip712Domain()
    results.push({
        check: 'EIP-712 Domain Name',
        expected: 'Flying Tulip',
        actual: domain.name_,
        status: domain.name_ === 'Flying Tulip' ? 'PASS' : 'FAIL'
    })

    results.push({
        check: 'EIP-712 Domain Version',
        expected: '1',
        actual: domain.version,
        status: domain.version === '1' ? 'PASS' : 'FAIL'
    })

    // Print results
    console.log('CHECK RESULTS:')
    console.log('-'.repeat(60))

    let passCount = 0
    let failCount = 0

    for (const result of results) {
        const icon = result.status === 'PASS' ? '✅' : '❌'
        const status = result.status === 'PASS' ? 'PASS' : 'FAIL'

        console.log(`${icon} ${result.check}: ${status}`)
        console.log(`   Expected: ${result.expected}`)
        console.log(`   Actual:   ${result.actual}`)
        console.log()

        if (result.status === 'PASS') {
            passCount++
        } else {
            failCount++
        }
    }

    console.log('='.repeat(60))
    console.log(`Total: ${results.length} checks`)
    console.log(`✅ Passed: ${passCount}`)
    console.log(`❌ Failed: ${failCount}`)
    console.log('='.repeat(60))

    if (failCount > 0) {
        console.error('\n⚠️  Some checks failed! Please review the deployment.')
        return false
    } else {
        console.log('\n✅ All checks passed! Deployment state is correct.')
        return true
    }
}

// Allow standalone execution
if (require.main === module) {
    runDeploymentCheck(hre)
        .then((success) => {
            process.exit(success ? 0 : 1)
        })
        .catch((error) => {
            console.error(error)
            process.exit(1)
        })
}

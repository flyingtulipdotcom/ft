import { ChildProcess, spawn, spawnSync } from 'child_process'
import { createServer } from 'net'
import { JsonRpcProvider } from 'ethers'

// Extra anvil flags per chain id
const ANVIL_ARGS: Record<number, string[]> = {
    143: ['--network', 'monad'],
}

export type AnvilFork = { anvil: ChildProcess; provider: JsonRpcProvider; url: string }

export function assertAnvilInstalled(): void {
    if (spawnSync('anvil', ['--version']).status !== 0) {
        throw new Error('anvil not found: install Foundry (https://getfoundry.sh)')
    }
}

async function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer()
        server.unref()
        server.on('error', reject)
        server.listen(0, () => {
            const { port } = server.address() as { port: number }
            server.close(() => resolve(port))
        })
    })
}

/**
 * Fork a live chain with anvil. Unlike the Hardhat network, an anvil fork keeps the real chain id,
 * so block.chainid and chain-id based config lookups behave as in production.
 */
export async function startAnvilFork(forkUrl: string, chainId: number): Promise<AnvilFork> {
    assertAnvilInstalled()
    const port = await freePort()
    const args = ['--fork-url', forkUrl, '--port', String(port), '--silent', ...(ANVIL_ARGS[chainId] ?? [])]
    const anvil = spawn('anvil', args, { stdio: 'ignore' })
    const url = `http://127.0.0.1:${port}`
    for (let i = 0; i < 120; i++) {
        try {
            // Raw request so ethers does not log network-detection retries while anvil boots
            await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
            })
            const provider = new JsonRpcProvider(url, undefined, { staticNetwork: true })
            // Arbitrum Orbit headers (Robinhood) carry no excessBlobGas, so anvil cannot execute on the
            // forked block under Cancun; mine one local block to get a header anvil built itself
            await provider.send('evm_mine', [])
            return { anvil, provider, url }
        } catch {
            await new Promise((r) => setTimeout(r, 500))
        }
    }
    anvil.kill()
    throw new Error(`anvil fork of ${forkUrl} did not start`)
}

import { Wallet } from 'ethers'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'

/**
 * Load a wallet from an encrypted keystore file
 * @param keystorePath Path to the keystore file
 * @param password Optional password (if not provided, will prompt)
 * @returns Private key string
 */
export async function loadKeystorePrivateKey(
    keystorePath: string,
    password?: string
): Promise<string> {
    // Resolve the path (handles ~ and relative paths)
    const resolvedPath = keystorePath.startsWith('~')
        ? path.join(process.env.HOME || '', keystorePath.slice(1))
        : path.resolve(keystorePath)

    // Check if file exists
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Keystore file not found: ${resolvedPath}`)
    }

    // Read the keystore file
    const keystoreJson = fs.readFileSync(resolvedPath, 'utf8')

    // Get password if not provided
    let keystorePassword = password
    if (!keystorePassword) {
        keystorePassword = await promptPassword()
    }

    // Decrypt the keystore
    try {
        const wallet = await Wallet.fromEncryptedJson(keystoreJson, keystorePassword)
        return wallet.privateKey
    } catch (error) {
        throw new Error('Failed to decrypt keystore. Invalid password or corrupted file.')
    }
}

/**
 * Prompt for password from stdin (hidden input)
 * Supports both typing and pasting from password managers
 */
async function promptPassword(): Promise<string> {
    return new Promise((resolve, reject) => {
        const stdin = process.stdin
        const stdout = process.stdout

        stdout.write('Enter keystore password: ')

        let password = ''
        let isRawMode = false

        // Enable raw mode to hide input
        if (stdin.isTTY) {
            stdin.setRawMode(true)
            isRawMode = true
        }

        stdin.resume()
        stdin.setEncoding('utf8')

        const cleanup = () => {
            stdin.removeListener('data', onData)
            if (isRawMode && stdin.isTTY) {
                stdin.setRawMode(false)
            }
            stdin.pause()
        }

        const onData = (chunk: string) => {
            // Process the entire chunk (handles paste from password managers)
            for (let i = 0; i < chunk.length; i++) {
                const char = chunk[i]
                const code = char.charCodeAt(0)

                // Handle Enter (newline or carriage return)
                if (code === 13 || code === 10) {
                    stdout.write('\n')
                    cleanup()
                    resolve(password)
                    return
                }
                // Handle Ctrl+C
                else if (code === 3) {
                    stdout.write('\n')
                    cleanup()
                    reject(new Error('Password input cancelled'))
                    return
                }
                // Handle Backspace/Delete
                else if (code === 127 || code === 8) {
                    if (password.length > 0) {
                        password = password.slice(0, -1)
                        stdout.write('\b \b')
                    }
                }
                // Handle printable characters (space to ~)
                else if (code >= 32 && code <= 126) {
                    password += char
                    stdout.write('*')
                }
            }
        }

        stdin.on('data', onData)
    })
}

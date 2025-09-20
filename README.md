<p align="center">
 <a href="https://docs.layerzero.network/" style="color: #a77dff">LayerZero Docs</a>
</p>

<h1 align="center">Flying Tulip EVM OFT</h1>

## Setup

- Copy `.env.example` into a new `.env`
- Set up your deployer address/account via the `.env`

  - You can specify either `MNEMONIC` or `PRIVATE_KEY`:

    ```
    MNEMONIC="test test test test test test test test test test test junk"
    or...
    PRIVATE_KEY="0xabc...def"
    ```

- Fund this deployer address/account with the native tokens of the chains you want to deploy to

## Build

### Compiling your contracts

```bash
pnpm compile
```

## Deploy

If you're adding another EVM chain, first, add it to the `hardhat.config.ts`. Adding non-EVM chains do not require modifying the `hardhat.config.ts`.  
To deploy the OFT contracts to your desired blockchains, run the following command:  

```bash
npx hardhat deploy --tags FT --network sonic-mainnet
```
Wire up all the chains you want cross-chain communication for
```bash
npx hardhat lz:ft:wire --dst-eid 30106 --send-confirmations 1 --receive-confirmations 1 --network sonic-mainnet
```
Send 1 OFT from **Sonic** to **Avalanche**:
```bash
npx hardhat lz:ft:send --dst-eid 30106 --to 0xa801864d0D24686B15682261aa05D4e1e6e5BD94 --amount 1000000000000000000 --network sonic-mainnet
```
Update delegate after setting up the appropriate peer connections
```bash
npx hardhat lz:ft:set-delegate --account 0xa801864d0D24686B15682261aa05D4e1e6e5BD94 --network sonic-mainnet
```
> You can get the address of your OFT on Sonic  from the file at `./deployments/sonic-mainnet/FT.json`

# Appendix

## Running Tests

```bash
pnpm test
```

## Using Multisigs

The wiring task supports the usage of Safe Multisigs.

To use a Safe multisig as the signer for these transactions, add the following to each network in your `hardhat.config.ts` and add the `--safe` flag to `lz:ft:wire --safe`:

```typescript
// hardhat.config.ts

networks: {
  // Include configurations for other networks as needed
  fuji: {
    /* ... */
    // Network-specific settings
    safeConfig: {
      safeUrl: 'http://something', // URL of the Safe API, not the Safe itself
      safeAddress: 'address'
    }
  }
}
```

### Troubleshooting

Refer to [Debugging Messages](https://docs.layerzero.network/v2/developers/evm/troubleshooting/debugging-messages) or [Error Codes & Handling](https://docs.layerzero.network/v2/developers/evm/troubleshooting/error-messages).

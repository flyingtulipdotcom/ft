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

### Installing deps

```bash
pnpm install
```

### Compiling your contracts

```bash
pnpm compile
```

## Deploy

If you're adding another EVM chain, first, add it to the `hardhat.config.ts`. Adding non-EVM chains do not require modifying the `hardhat.config.ts`.  
To deploy the OFT contracts to your desired blockchains, run the following command:  

Supported mainnet chains include:  
Ethereum (ethereum), BSC (bsc), Avalanche (avalanche), Sonic (sonic) and Base (base)  

Support testnet chains include:  
Ethereum Sepolia (sepolia), BSC testnet (bsc-testnet), Avalanche (fuji) and Base Sepolia (base-sepolia)  

```bash
npx hardhat deploy --tags FT --network sonic
```
Wire up all the chains you want cross-chain communication for mainnets
```bash
npx hardhat lz:ft:wire --chains ethereum,sonic,avalanche,bsc,base --network sonic
```
Wire up all the chains you want cross-chain communication for testnets
```bash
npx hardhat lz:ft:wire --chains sepolia,fuji,bsc-testnet,base-sepolia --network base-sepolia
```
Send 1 OFT from **Sonic** to **Avalanche**:
```bash
npx hardhat lz:ft:send --dst-eid 30106 --to 0xa801864d0D24686B15682261aa05D4e1e6e5BD94 --amount 1000000000000000000 --network sonic
```
Updating the delegate afterwards
```bash
npx hardhat lz:ft:set-delegate --account 0x3419E83fe5583028e056b1aa5E62601D80799572 --network sonic
```
> You can get the address of your OFT on Sonic  from the file at `./deployments/sonic/FT.json`

# For a new chain
1 - Add details to the CHAINS variable in utils/constants.ts
2 - Update support chains above in README.md
3 - Wire them up to all needed chains

# Appendix

## Reference list of endpoint ids (eid)

| Network        | Endpoint ID |
|----------------|-------------|
| Sonic          | 30332       |
| Base           | 30184       |
| Avalanche      | 30106       |
| BSC            | 30102       |
| Ethereum       | 30101       |
| Base Sepolia   | 40245       |
| Fuji           | 40106       |
| BSC Testnet    | 40102       |
| Sepolia        | 40161       |

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

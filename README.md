<p align="center">
 <a href="https://docs.layerzero.network/" style="color: #a77dff">LayerZero Docs</a>
</p>

<h1 align="center">Flying Tulip EVM OFT</h1>

## Setup

- Copy `.env.example` into a new `.env`
- Set up your deployer address/account via the `.env`

  - **Option 1 (Recommended for Production)**: Use an encrypted keystore file
    ```
    KEYSTORE_PATH="~/.foundry/keystores/keystore-file"
    ```
    You will be prompted for your password at runtime.

  - **Option 2 (ONLY for Testing, NOT RECOMMENDED FOR PRODUCTION)**: Use a mnemonic
    ```
    MNEMONIC="test test test test test test test test test test test junk"
    ```

  - **Option 3 (ONLY for Testing, NOT RECOMMENDED FOR PRODUCTION)**: Use a private key
    ```
    PRIVATE_KEY="0xabc...def"
    ```

- Optionally add ETHERSCAN_API_KEY using a V2 key to verify the contracts

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

> **Note:** If `pnpm compile` fails with TypeChain-related errors (e.g., cannot find module from `typechain-types`), run:
> ```bash
> pnpm hardhat compile --force
> ```
> This will generate the TypeChain types needed by the task files.

## Deploy

If you're adding another EVM chain, first, add it to the `hardhat.config.ts`. Adding non-EVM chains do not require modifying this file.  

Supported mainnet chains:  
| Network          | Name          |
|------------------|---------------|
| Sonic            | ethereum      |
| Base             | bsc           |
| Avalanche        | avalanche     |
| BSC              | sonic         |
| Ethereum         | base          |

Supported testnet chains:  
| Network          | Name          |
|------------------|---------------|
| BSC              | bsc-testnet   |
| Avalanche        | fuji          |
| Base             | base-sepolia  |
| Ethereum         | sepolia       |

To deploy the OFT contracts to your desired blockchains, run the following command:  
```bash
npx hardhat deploy --tags FT --network sonic
```
Wire up all the chains you want cross-chain communication for mainnets. Remove --safe to use deployer private key for setting peers and enforced options
```bash
npx hardhat ft:wire --chains ethereum,sonic,avalanche,bsc,base --network sonic --safe
```
Wire up all the chains you want cross-chain communication for testnets
```bash
npx hardhat ft:wire --chains sepolia,fuji,bsc-testnet,base-sepolia --network base-sepolia
```
Send 1 OFT from **Sonic** to **Avalanche**:
```bash
npx hardhat ft:send --dst-eid 30106 --to 0xa801864d0D24686B15682261aa05D4e1e6e5BD94 --amount 1000000000000000000 --network sonic
```
Updating the delegate afterwards
```bash
npx hardhat lz:ft:set-delegate --account 0x22246a9183ce2ce6e2c2a9973f94aea91435017c --network sonic
```
> You can get the address of your OFT on Sonic  from the file at `./deployments/sonic/FT.json`

# For a new chain
1 - Add details to the CHAINS variable in utils/constants.ts
2 - Update support chains above in README.md
3 - Call `ft:wire` on the new chain to hook up all other chains. 
4 - Call `ft:wire` on all other networks to wire the new chain up to it for a full mesh

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

## Token Behavior & Controls

- Pause semantics
  - `setPaused(bool)` is callable by the owner or the configurator.
  - Double pause reverts with `EnforcedPause`; double unpause reverts with `ExpectedPause`.
  - While paused, transfers are blocked except when:
    - The caller is the LayerZero `endpoint` (cross-chain delivery), or
    - The caller is the `configurator`, or
    - Either `from` or `to` equals the `configurator` address.
  - Approvals and ERC-2612 permits are allowed while paused. Combined with the
    configurator caller exception, the configurator can use `transferFrom` during
    a pause if allowances exist. This is intentional for operational recovery.

- Configurator role
  - May pause/unpause via `setPaused`.
  - Is exempted from pause restrictions as described above.
  - Can be rotated by the owner or the current configurator via `transferConfigurator(newConfigurator)`.

- ERC-2612 + ERC-1271 Permit
  - Supports EOA signatures and smart contract wallets via ERC-1271.
  - Domain separator is computed dynamically using the current token name; name
    changes invalidate previously signed permits by design.
  - The ERC-1271 validation path is invoked via a static call. A malicious
    ERC-1271 wallet attempting to reenter `permit` will cause the outer call to
    revert; nonces and allowances remain unchanged.

- Initial mint chain gating
  - Initial supply is minted only when `block.chainid` equals the configured
    `mintChainId`. Deployments enforce an allowlist of chain IDs for safety.

## Using Multisigs

The peering task supports the usage of Safe Multisigs.

To use a Safe multisig as the signer for these transactions, add the following to each network in your `hardhat.config.ts` and add the `--safe` flag to `ft:peer-options --safe`:

Specify `PRIVATE_KEY_PROPOSER`, `SAFE_ADDRESS` & `SAFE_API_KEY` env variables

## Security Model

- Roles
  - Owner: governance authority. Can change name/symbol, pause/unpause, and rotate the configurator via `transferConfigurator`.
  - Configurator: operational role. Can pause/unpause and is exempted from pause restrictions (see Token Behavior & Controls). Can be rotated by the Owner or the current Configurator.
  - LayerZero Endpoint: can deliver cross-chain transfers while paused.

- Pause behavior
  - Transfers are blocked while paused except for endpoint delivery and interactions to/from or by the configurator. Approvals and ERC-2612 permits are still allowed. This permits operational recovery flows using `transferFrom` with allowances.
  - Double pause/unpause reverts (`EnforcedPause` / `ExpectedPause`).

- Permit and nonces
  - Supports ERC-2612 (EOA) and ERC-1271 (smart wallets). Domain separator is computed from the current token name; renaming invalidates prior permits.
  - 1271 validation is performed via a static call. Reentrant attempts from a 1271 wallet revert and do not change state; nonces/allowances are unaffected.

- Mint gating
  - Initial supply mints only on the configured `mintChainId`. Other chains deploy with zero initial supply.

- Operational recommendations
  - Use separate multisigs for Owner and Configurator with distinct signers. Consider timelocks or off-chain policies for Owner actions.
  - Monitor `Paused`, `Unpaused`, and `ConfiguratorChanged` events. Treat configurator keys as sensitive; rotate promptly if compromised.
  - If stricter freeze semantics are required (e.g., block configurator-initiated third-party `transferFrom` during pause), adjust pause logic in the token accordingly.

### Troubleshooting

Refer to [Debugging Messages](https://docs.layerzero.network/v2/developers/evm/troubleshooting/debugging-messages) or [Error Codes & Handling](https://docs.layerzero.network/v2/developers/evm/troubleshooting/error-messages).

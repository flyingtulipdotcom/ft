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
| Sonic            | sonic         |
| Base             | base          |
| Avalanche        | avalanche     |
| BSC              | bsc           |
| Ethereum         | ethereum      |
| Monad            | monad         |
| Robinhood        | robinhood     |
| Arc              | arc           |
| Arbitrum         | arbitrum      |

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

Mainnet wiring requires **LayerZero Labs and Canary, plus any two of three
optional providers**. Routes involving **Arc or Robinhood** use **P2P, Horizen,
and Nethermind**; all other routes retain **Deutsche Telekom, Horizen, and
Nethermind**. This selection applies at both ends and in both directions.
The five providers use their local addresses on each
chain. Both send and receive configurations encode `requiredDVNCount=2`,
`optionalDVNCount=3`, and `optionalDVNThreshold=2`; send confirmations refer to
the local source, and receive confirmations refer to the remote source.

Preview the generated endpoint and peer/options batches before proposing them:

```bash
npx hardhat ft:wire --chains ethereum,sonic,avalanche,bsc,base --network sonic --safe --dry-run
```

This reads the selected network and prints the exact calldata using the same
builders as normal wiring. It does not initialize a Safe, request a signer,
sign, propose, or send transactions. It is a calldata preview, not a fork
execution or cross-chain delivery test. The summary includes both DVN groups
and the optional threshold. Run the task separately on each source chain.
Existing matching explicit library pins are skipped to avoid `LZ_SameValue`.
Matching inherited defaults are explicitly pinned. The native task still emits
config and peer/options calls; the fork rollout below also removes unchanged
explicit config, peer and options writes.

Every selected chain must have exactly one active V2 messaging deployment for
each required provider in `utils/lzMetadata.json`. Missing, deprecated,
read-only, or ambiguous DVNs cause wiring to stop before submission; the task
never reduces the policy automatically. A new network missing one of the five
providers cannot reproduce this policy until a supported configuration is
explicitly agreed and implemented. Only selected source/destination metadata
is validated. Testnets retain their existing single LayerZero Labs DVN policy
with optional DVNs explicitly disabled.

External fork dry-run scripts must use these updated wiring builders and check
both DVN arrays and the threshold. A report that prints only a DVN count of `2`
does not demonstrate the complete mainnet policy.

### Rehearse the nine-network rollout and export Safe JSON

Requires Anvil on `PATH` (or `ANVIL_BINARY`) and working public RPCs. These
commands request no signing key and submit no transactions to public RPCs:

```bash
npx hardhat run --no-compile scripts/check-rollout-dvns.ts
npx hardhat run --no-compile scripts/rollout-ft.ts
```

The checker verifies all five selected DVNs on all 72 directed routes using
read-only worker fee quotes. The rollout validates that evidence against the
current metadata and policy, forks each chain at a recorded block, and uses
the same transaction builders as `ft:wire`. After wiring, it also calls
`FT.quoteSend` for one FT on every route, including DVN, executor, treasury and
enforced-option pricing. These quotes do not transfer tokens. RPC overrides are
`RPC_URL_ETHEREUM`, `RPC_URL_SONIC`, `RPC_URL_BSC`, `RPC_URL_AVALANCHE`,
`RPC_URL_BASE`, `RPC_URL_MONAD`, `RPC_URL_ROBINHOOD`, `RPC_URL_ARC`, and
`RPC_URL_ARBITRUM`. `FT_ROLLOUT_OUTPUT` selects the report directory;
`FT_ROLLOUT_CHAINS` can restrict the otherwise nine-network mesh.
To retry a transient RPC failure, set `FT_ROLLOUT_OUTPUT` to that run's directory
and `FT_ROLLOUT_RESUME=1`. Successful source results are retained only after
checking exported-file hashes, role configuration and every route against the
current builders. `FT_ROLLOUT_RETRY_SOURCES=sonic,arbitrum`, for example, forces
those sources to run again. Retained results keep their original fork blocks.

Each chain directory contains a before/after report and unsigned Safe
Transaction Builder JSON, grouped by signing authority:

1. `01-delegate-endpoints.safe.json`: libraries, DVNs, confirmations, executor.
2. `02-delegate-ownership.safe.json`: on new chains, transfer the constructor's
   ownership from the delegate Safe to the owner Safe.
3. `03-owner-peers.safe.json`: peers and 80,000-gas enforced receive options.
4. `04-optional-activation.safe.json`: separately reviewed unpause on new chains.

On a fresh rerun after FT deployment, expansion contracts still owned by the
constructor delegate receive an ownership-transfer batch. Already completed
ownership transfers are skipped; paused expansion contracts retain a separate
optional activation batch.

Complete deployment and endpoint configuration on **every** network before
executing the owner peer batches on the four new chains first, then the five
existing chains. The manifest lists prerequisites and
simulation results. Missing governance Safes block execution; a successful
fork funded locally does not mean the production deployer is funded.

Arbitrum additionally includes `00a-safe-deployments.unsigned.json`: up to two
ordinary factory calls that replay missing canonical Safe CREATE2 deployments.
Send those from a funded EOA **other than the FT deployer**, preserving the
FT deployer's nonce zero. Then import both `00b-governance-*.safe.json` files
into their respective newly created Safes. These add the missing owners and
set both Safes to Ethereum's captured current **3-of-5** membership, before
the FT endpoint/ownership/peer batches. The original setup must be deployed
first because changing its initializer changes the CREATE2 Safe address.
The bootstrap plan records original setup data, salts, provenance, infrastructure
code hashes, the Ethereum membership snapshot and simulated execution results.
Fresh reruns validate existing Safe proxy/singleton code and approved ownership
states, then generate only remaining creations and owner additions. A completed
3-of-5 setup requires no further bootstrap transactions. Unexpected ownership
states stop the rollout for review.

Safe simulation calls the existing Safe implementation's `execTransaction`
through a verified MultiSendCallOnly deployment, using threshold approvals
from impersonated owners on localhost. It verifies `ExecutionSuccess`, nonce
advancement and final raw/effective LayerZero state. It exercises installed
guards but does not prove access to real signing keys. Independent forks and
worker quotes do not reproduce off-chain attestations or cross-chain delivery.
Re-run against fresh state before signing; Safe JSON contains calls, not
signatures or a fixed live Safe nonce.

### Preserve the production CREATE deployment

Mainnet `deploy/FT.ts` now uses the production creation bytecode pinned in
`deployments/sonic/FT.json`, with creation hash
`0x4831f2deca983f6bd018ca3ba43d98317ad8855cfbdfbe98a74366c542ffb3d3`.
It requires deployer `0x44820497f8FE95A258A9522f0De2c04ab2bC3da3`, confirmed
and pending nonce **0**, and an empty target address. Ordinary CREATE then
produces `0x5DD1A7A369e8273371d2DBf9d83356057088082c` on each chain.
The latest/pending nonce guards run again immediately before submission.

Same deployer and nonce determine the address independently of bytecode.
Exact bytecode is checked separately: Monad, Arc and Robinhood use Sonic's
endpoint and match its init code and runtime; Arbitrum uses Ethereum's endpoint
and matches its init code and runtime. The two endpoint groups have different
embedded endpoint addresses. Every mainnet deployment keeps `mintChainId=146`,
so the four new networks start with zero supply and paused transfers.
The current local compiler output differs from the pinned artifact; recompiling
is not sufficient for exact reproduction. Explorer verification needs the
original matching production compiler input.

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
| Monad          | 30390       |
| Robinhood      | 30416       |
| Arc            | 30417       |
| Arbitrum       | 30110       |
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

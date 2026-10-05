# Deployment Checklist

Quick reference checklist for deploying FT token to production.

## Pre-Deployment

- [ ] Create encrypted keystore: `cast wallet new ~/.foundry/keystores`
- [ ] Fund deployer address on ALL chains (Sonic, Ethereum, BSC, Avalanche, Base)
- [ ] Copy `.env.example` to `.env`
- [ ] Set `KEYSTORE_PATH=~/.foundry/keystores/<file>`
- [ ] Set `ETHERSCAN_API_KEY=<key>`
- [ ] Set `FT_CONFIGURATOR=<multisig-address>` role to have control of initial mint if network is sonic
- [ ] Set `FINAL_OWNER=<multisig-address>`
- [ ] Run `pnpm compile`
- [ ] Run `pnpm test`

## Deploy Sonic (Mint Chain)

```bash
npx hardhat deploy --tags FT --network sonic
```

**Auto-verification checklist:**
- ✅ Contract deployed
- ✅ Etherscan verified
- ✅ Ownership transferred to final owner
- ✅ All state checks passed

**Expected:**
- Total supply: 10,000,000,000 FT
- Owner: Final owner (multisig)
- Contract: Paused

## Deploy Other Chains

```bash
npx hardhat deploy --tags FT --network ethereum
npx hardhat deploy --tags FT --network bsc
npx hardhat deploy --tags FT --network avalanche
npx hardhat deploy --tags FT --network base
```

**Expected per chain:**
- Total supply: 0 FT
- Owner: Final owner (multisig)
- Contract: Paused

## Wire Cross-Chain

From each chain, wire to all chains:

```bash
# From Sonic
npx hardhat ft:wire --chains ethereum,sonic,avalanche,bsc,base --network sonic --safe

# From Ethereum
npx hardhat ft:wire --chains ethereum,sonic,avalanche,bsc,base --network ethereum --safe

# From BSC
npx hardhat ft:wire --chains ethereum,sonic,avalanche,bsc,base --network bsc --safe

# From Avalanche
npx hardhat ft:wire --chains ethereum,sonic,avalanche,bsc,base --network avalanche --safe

# From Base
npx hardhat ft:wire --chains ethereum,sonic,avalanche,bsc,base --network base --safe
```

**Expected per chain:**
- ✅ Send library set
- ✅ Send config set
- ✅ Receive library set
- ✅ Receive config set
- ✅ Set peer and enforced options

## Final Verification

Run manual check on each chain if needed:

```bash
npx hardhat run scripts/check-deployment.ts --network sonic
npx hardhat run scripts/check-deployment.ts --network ethereum
npx hardhat run scripts/check-deployment.ts --network bsc
npx hardhat run scripts/check-deployment.ts --network avalanche
npx hardhat run scripts/check-deployment.ts --network base
```

**Must all pass:**
- ✅ Token Name: Flying Tulip
- ✅ Token Symbol: FT
- ✅ Decimals: 18
- ✅ Configurator: Correct address
- ✅ Owner (Final Owner): Multisig address
- ✅ Owner Not Deployer: Different ✓
- ✅ LayerZero Endpoint V2: Correct
- ✅ Paused: true
- ✅ Total Supply: Global sum equals 10B cap (distribution varies across chains)
- ✅ EIP-712 Domain: Correct

## Mesh Safety Audit (Recommended)

After wiring (and any time you update peers/options or endpoint ULN config), run the cross-chain audit:

```bash
# Uses RPC URLs from hardhat.config.ts (override via RPC_URL_* env vars for reliability)
npx hardhat run scripts/audit-prod.ts --network hardhat
```

This specifically targets the “wrong peer / miswired ULN” class of incidents by verifying:
- `peers[eid]` points to the correct FT contract on every destination chain
- Enforced options are set for `SEND` (lzReceive gas)
- Send/receive libraries + ULN confirmations/DVNs are correctly configured for every path
- Global supply across the mesh has not exceeded the initial mint (detects unauthorized minting)

## Emergency Halt (Runbook)

Pause is **not** a full cross-chain kill switch for this token: LayerZero inbound delivery can still credit tokens while paused (the endpoint is exempted in `FT._update`).

In an incident, pause **and** unset peers (set to `bytes32(0)`) to stop accepting inbound messages from remote chains.

```bash
# Example (Ethereum). Repeat on each chain you want to freeze.
# Requires SAFE_OWNER_ADDRESS / SAFE_API_KEY / PRIVATE_KEY_PROPOSER when using --safe.
npx hardhat ft:emergency-halt --chains ethereum,avalanche,base,bsc,sonic --safe --network ethereum
```

## Emergency Reactivation Snapshot

Snapshot date: `2026-04-18`

If bridging was disabled by **unsetting peers only**, local ERC20 transfers remain live and you only need to restore the peer mappings.

If bridging was disabled by **pause + unset peers**, restore the peers first and only then queue `setPaused(false)` on chains you intentionally paused for the incident.

Current live restore values:

- Mainnet FT address on all 5 production chains: `0x5DD1A7A369e8273371d2DBf9d83356057088082c`
- Peer value to restore on active mainnet paths:
  `0x0000000000000000000000005dd1a7a369e8273371d2dbf9d83356057088082c`
- Mainnet EIDs:
  `ethereum=30101`, `bsc=30102`, `avalanche=30106`, `base=30184`, `sonic=30332`
- Current enforced option for `SEND` on active mainnet paths:
  `0x00030100110100000000000000000000000000013880`
- Live paused-state snapshot when this was recorded:
  `ethereum=false`, `avalanche=true`, `base=false`, `bsc=false`, `sonic=false`

Recommended restore path:

```bash
# Restores peers + enforced options from repo metadata.
# Repeat once per chain.
npx hardhat ft:peer-options --chains ethereum,avalanche,base,bsc,sonic --safe --network ethereum
npx hardhat ft:peer-options --chains ethereum,avalanche,base,bsc,sonic --safe --network avalanche
npx hardhat ft:peer-options --chains ethereum,avalanche,base,bsc,sonic --safe --network base
npx hardhat ft:peer-options --chains ethereum,avalanche,base,bsc,sonic --safe --network bsc
npx hardhat ft:peer-options --chains ethereum,avalanche,base,bsc,sonic --safe --network sonic
```

If you restore manually in Safe, set `peers[eid]` back to the peer value above for these remote EIDs:

- On `ethereum`: `30102`, `30106`, `30184`, `30332`
- On `avalanche`: `30101`, `30102`, `30184`, `30332`
- On `base`: `30101`, `30102`, `30106`, `30332`
- On `bsc`: `30101`, `30106`, `30184`, `30332`
- On `sonic`: `30101`, `30102`, `30106`, `30184`

If you need to verify a chain before re-enabling:

```bash
npx hardhat run scripts/audit-prod.ts --network hardhat
```

Before reactivation, inspect for any suspicious pending verified packets and nilify/burn them if needed. Do not re-enable peers blindly after an incident.

## Verify on Block Explorers

Check each chain's block explorer:

| Chain | Explorer |
|-------|----------|
| Sonic | https://sonicscan.org |
| Ethereum | https://etherscan.io |
| BSC | https://bscscan.com |
| Avalanche | https://snowtrace.io |
| Base | https://basescan.org |

**Verify:**
- [ ] Source code verified
- [ ] Contract address saved
- [ ] Constructor args correct
- [ ] Owner is multisig

## Record Addresses

Save all deployed addresses:

```bash
# Sonic
cat deployments/sonic/FT.json | jq '.address'

# Ethereum
cat deployments/ethereum/FT.json | jq '.address'

# BSC
cat deployments/bsc/FT.json | jq '.address'

# Avalanche
cat deployments/avalanche/FT.json | jq '.address'

# Base
cat deployments/base/FT.json | jq '.address'
```

## ✅ Deployment Complete

All contracts deployed, verified, ownership transferred, and cross-chain wired.

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
npx hardhat lz:ft:wire --chains ethereum,sonic,avalanche,bsc,base --network sonic

# From Ethereum
npx hardhat lz:ft:wire --chains ethereum,sonic,avalanche,bsc,base --network ethereum

# From BSC
npx hardhat lz:ft:wire --chains ethereum,sonic,avalanche,bsc,base --network bsc

# From Avalanche
npx hardhat lz:ft:wire --chains ethereum,sonic,avalanche,bsc,base --network avalanche

# From Base
npx hardhat lz:ft:wire --chains ethereum,sonic,avalanche,bsc,base --network base
```

**Expected per chain:**
- ✅ Send library set
- ✅ Send config set
- ✅ Receive library set
- ✅ Receive config set
- ✅ Peer set
- ✅ Enforced options set

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
- ✅ Total Supply: Correct (10B on Sonic, 0 elsewhere)
- ✅ EIP-712 Domain: Correct

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

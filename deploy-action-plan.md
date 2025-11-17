  Production Deployment Action Plan for Flying Tulip (FT) OFT

  Based on my comprehensive analysis of your repository, here's a detailed action plan to prepare for production deployment with security
   hardening and OFT infrastructure requirements.

  Current Status Summary

  Your project is already deployed on 5 mainnets (Ethereum, BSC, Avalanche, Sonic, Base) and appears production-ready. However, there are
   several critical improvements needed before wider production use.

  ---
  📋 ACTION PLAN

  Phase 1: Critical Security & Code Fixes (Priority: HIGH)

  1.1 Fix Deployment Script Validation ⚠️ CRITICAL

  - Issue: Deployment script allows undefined configurator/endpoint (Audit Q-1 - Medium)
  - File: deploy/FT.ts:20-40
  - Action: Add validation to fail fast if chain config is missing
  - Impact: Prevents deploying broken contracts to new chains

  1.2 Fix Hardhat Verification Call ⚠️ MODERATE

  - Issue: run() function not imported (Audit I-1)
  - File: deploy/FT.ts:52
  - Action: Already fixed in latest commit (ac76eb7 - hre.run for verify)
  - Status: ✅ COMPLETE (verify in code)

  1.3 Environment-Based Role Configuration ⚠️ MODERATE

  - Issue: Hard-coded delegate/configurator addresses (Audit I-2)
  - File: utils/constants.ts:11-12
  - Action: Move to environment variables or deployment config
  - Impact: Enables secure key rotation and per-chain configurators

  1.4 Fix Node Version Mismatch 🔧 LOW

  - Issue: .nvmrc specifies v18.18.0, package.json requires >=20.19.4
  - File: .nvmrc
  - Action: Update to match package.json requirement

  ---
  Phase 2: Security Hardening (Priority: HIGH)

  2.1 Multi-Signature Wallet Setup 🔐 CRITICAL

  - Current: Single EOA controls owner, configurator, delegate roles
  - Recommendation: Deploy Gnosis Safe or similar multisig on all chains
  - Action Items:
    - Deploy multisig contracts (3-of-5 or 4-of-7 recommended)
    - Transfer ownership to multisig
    - Transfer configurator role to multisig
    - Document signing procedures
    - Test emergency pause procedures

  2.2 Timelock Implementation 🔐 MODERATE

  - Purpose: Add delay for critical operations (setName, setSymbol, ownership transfer)
  - Options:
    - OpenZeppelin TimelockController
    - Compound-style Timelock
  - Delay: 24-48 hours recommended

  2.3 Access Control Audit 🔍 MODERATE

  - Review: Configurator broad pause bypass authority (Audit Q-2)
  - Action: Document and communicate configurator powers clearly
  - Consider: Separate pause-bypass role from fund movement capability

  ---
  Phase 3: OFT Infrastructure & LayerZero Configuration (Priority: HIGH)

  3.1 Verify DVN Configuration ✅ REQUIRED

  - Test Networks: Verify DVN setup on testnets first
  - Commands:
  # Check send/receive library config for each chain
  npx hardhat lz:oapp:config:get:sendlibrary --network sonic
  npx hardhat lz:oapp:config:get:receivelibrary --network sonic
  - Expected DVNs:
    - Mainnet: LayerZero Labs + Stargate (2 DVNs)
    - Testnet: LayerZero Labs (1 DVN)

  3.2 Wire All Chain Pairs ✅ REQUIRED

  - Current Status: Some chains deployed but may need re-wiring
  - Action: Execute comprehensive wiring across all chain pairs
  - Commands:
  # Dry run first (if available)
  npx hardhat lz:ft:wire --chains ethereum,bsc,avalanche,sonic,base --network sonic --dry-run

  # Execute wiring
  npx hardhat lz:ft:wire --chains ethereum,bsc,avalanche,sonic,base --network sonic
  - Verify: Test cross-chain transfers in both directions for each pair

  3.3 Set Proper Delegates 🔧 REQUIRED

  - Current: Deployer address is delegate
  - Target: Production delegate address (0x22246a9183ce2ce6e2c2a9973f94aea91435017c)
  - Command:
  npx hardhat lz:ft:set-delegate --account 0x22246a9183ce2ce6e2c2a9973f94aea91435017c --network <each-chain>

  3.4 Gas Limit Configuration 🔧 MODERATE

  - Current: 200,000 gas for LZ receive (in tasks/sendFT.ts)
  - Action: Test actual gas usage across chains and adjust if needed
  - Monitor: Cross-chain delivery failures due to insufficient gas

  ---
  Phase 4: Testing & Validation (Priority: HIGH)

  4.1 Comprehensive Testnet Validation ✅ REQUIRED

  - Networks: Sepolia, BSC Testnet, Fuji, Base Sepolia
  - Test Matrix:
    - Deploy contracts on all testnets
    - Wire all chain pairs
    - Cross-chain transfers (all pair combinations)
    - Pause/unpause functionality
    - Configurator bypass during pause
    - ERC-2612 permits (EOA + smart wallets)
    - Burning functionality
    - Edge cases: insufficient gas, reverted transfers
    - Name/symbol change (test permit invalidation)

  4.2 Mainnet Dry Run Tests 🧪 REQUIRED

  - Approach: Use Tenderly, Hardhat forking, or similar simulation
  - Test Scenarios:
    - Small test transfers between chains
    - Emergency pause scenario
    - Configurator role rotation
    - Gas estimation for cross-chain sends

  4.3 Security Audit (External) 🔐 RECOMMENDED

  - Status: Internal audit complete (AUDIT.md)
  - Recommendation: Professional audit from:
    - Trail of Bits
    - OpenZeppelin
    - Consensys Diligence
    - Certora (formal verification)
  - Cost: $15k-50k depending on scope

  ---
  Phase 5: Documentation & Operational Procedures (Priority: MODERATE)

  5.1 Deployment Runbook 📖 REQUIRED

  - Contents:
    - Pre-deployment checklist
    - Environment setup steps
    - Gas estimation for each chain
    - Verification commands
    - Rollback procedures
    - Post-deployment verification

  5.2 Emergency Response Procedures 🚨 REQUIRED

  - Document:
    - Pause trigger criteria
    - Emergency contact tree
    - Multisig signing procedures (if implemented)
    - Communication templates (users, partners, LayerZero)
    - Recovery procedures

  5.3 Integration Documentation 📖 RECOMMENDED

  - Audience: dApps, wallets, aggregators
  - Include:
    - Permit invalidation on name change (Audit I-3)
    - Pause behavior details
    - Cross-chain transfer examples
    - ABI and contract addresses
    - Security model explanation

  5.4 Monitoring & Alerting Setup 📊 RECOMMENDED

  - Tools: Tenderly, Defender, Alchemy, custom scripts
  - Alerts:
    - Large transfers (>threshold)
    - Pause events
    - Failed cross-chain deliveries
    - Unusual gas consumption
    - Ownership/role changes

  ---
  Phase 6: Production Deployment (Priority: EXECUTION)

  6.1 Pre-Deployment Checklist ✅

  - All Phase 1-2 code fixes merged
  - Testnet validation 100% complete (Phase 4.1)
  - Multisig deployed and tested
  - Emergency procedures documented
  - Team training complete
  - Communication plan ready
  - Sufficient funds for gas on all chains

  6.2 Deployment Sequence 🚀

  1. Deploy new contracts (if fixes require redeployment):
  # For each mainnet
  npx hardhat deploy --tags FT --network <chain> --reset
  2. Verify contracts:
  # Automatic during deployment, or manual:
  npx hardhat verify --network <chain> <address> <constructor-args>
  3. Configure LayerZero:
  # Wire all chains
  npx hardhat lz:ft:wire --chains ethereum,bsc,avalanche,sonic,base --network sonic

  # Set delegates
  npx hardhat lz:ft:set-delegate --account <multisig> --network <each-chain>
  4. Transfer ownership (if multisig implemented):
    - Call transferOwnership(multisigAddress) on each chain
    - Confirm acceptance from multisig
  5. Transfer configurator:
    - Call transferConfigurator(newConfiguratorAddress) if needed

  6.3 Post-Deployment Validation ✅

  - Verify contract deployment addresses
  - Test small cross-chain transfer
  - Verify DVN configuration
  - Check delegate settings
  - Monitor for 24-48 hours
  - Publish addresses and documentation

  ---
  Phase 7: Ongoing Operations (Priority: CONTINUOUS)

  7.1 Regular Security Reviews 🔄

  - Monthly access control reviews
  - Quarterly dependency updates
  - Annual security audits

  7.2 Monitoring & Maintenance 🔄

  - Daily monitoring of alerts
  - Weekly cross-chain transfer tests
  - Monthly key rotation assessment
  - LayerZero protocol updates tracking

  7.3 Incident Response 🚨

  - Maintain 24/7 on-call rotation
  - Regular emergency drill exercises
  - Post-incident reviews

  ---
  🎯 Quick Start: Testnet Dry Run

  Here's a practical sequence you can execute today to dry-run the deployment:

  # 1. Setup environment
  cp .env.example .env
  # Edit .env with testnet keys

  # 2. Deploy to all testnets
  npx hardhat deploy --tags FT --network sepolia
  npx hardhat deploy --tags FT --network bsc-testnet
  npx hardhat deploy --tags FT --network fuji
  npx hardhat deploy --tags FT --network base-sepolia

  # 3. Wire testnets together
  npx hardhat lz:ft:wire --chains sepolia,bsc-testnet,fuji,base-sepolia --network sepolia

  # 4. Test cross-chain send
  npx hardhat lz:ft:send \
    --dst-eid 40102 \
    --to <your-address> \
    --amount 1000000000000000000 \
    --network sepolia

  # 5. Verify receipt on BSC Testnet
  # Check balance, events, etc.

  # 6. Test pause functionality
  # Write a test script to pause, attempt transfer, unpause

  # 7. Test permit functionality
  # Write a script to sign and execute permits

  ---
  📊 Risk Assessment Matrix

  | Risk                                | Likelihood | Impact   | Mitigation                    | Priority |
  |-------------------------------------|------------|----------|-------------------------------|----------|
  | Undefined configurator on new chain | Medium     | High     | Fix deployment validation     | P0       |
  | Single key compromise               | Medium     | Critical | Implement multisig            | P0       |
  | Cross-chain delivery failure        | Low        | High     | Test thoroughly, monitor      | P1       |
  | Permit invalidation confusion       | Medium     | Low      | Document clearly              | P2       |
  | DVN misconfiguration                | Low        | High     | Verify before launch          | P0       |
  | Configurator abuse during pause     | Low        | Medium   | Document, consider split role | P2       |

  ---
  💰 Estimated Costs

  | Item                            | Cost Range     |
  |---------------------------------|----------------|
  | Gas for redeployment (5 chains) | $500-2,000     |
  | External security audit         | $15,000-50,000 |
  | Monitoring tools (annual)       | $1,000-5,000   |
  | Multisig deployment             | $50-200        |
  | Total                           | $16,550-57,200 |

  ---
  📝 Summary Checklist

  Critical (Must Do Before Production):
  - Fix deployment script validation (Phase 1.1)
  - Implement multisig for all admin roles (Phase 2.1)
  - Complete testnet dry run (Phase 4.1)
  - Wire all mainnet chain pairs (Phase 3.2)
  - Document emergency procedures (Phase 5.2)

  Recommended (Should Do):
  - Environment-based role config (Phase 1.3)
  - External security audit (Phase 4.3)
  - Timelock implementation (Phase 2.2)
  - Monitoring & alerting setup (Phase 5.4)

  Optional (Nice to Have):
  - Integration documentation (Phase 5.3)
  - Formal verification (Certora)
  - Bug bounty program

  ---
  Would you like me to help you get started with any specific phase? I can:

  1. Fix the critical deployment script issues now (Phase 1.1, 1.3, 1.4)
  2. Create a comprehensive testnet dry-run script (Phase 4.1)
  3. Generate deployment runbook templates (Phase 5.1)
  4. Set up monitoring scripts (Phase 5.4)
  5. Create emergency response documentation (Phase 5.2)
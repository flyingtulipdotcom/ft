# Flying Tulip FT Audit Report

## Scope
- `contracts/FT.sol`
- Supporting interfaces and mocks under `contracts/interfaces` and `contracts/mocks`
- Deployment script `deploy/FT.ts`
- Hardhat tasks in `tasks/`
- Chain metadata utilities in `utils/constants.ts`
- Hardhat configuration and associated tooling

## Methodology
The review combined manual inspection of the Solidity and TypeScript code, dependency analysis of imported LayerZero/OFT packages, and a review of the Hardhat deployment and task scripts. Unit tests were attempted locally using `pnpm test`; execution failed because the environment cannot download Solidity compiler binaries from the public network, so results could not be observed.

## Findings Summary
| ID | Title | Severity | Status |
| --- | --- | --- | --- |
| Q-1 | Deployment script allows undefined configurator/endpoint addresses | Medium | Acknowledged |
| Q-2 | Configurator retains broad control during pauses | Low | Informational |
| I-1 | Verification step may throw due to missing `run` binding in deployment script | Info | Acknowledged |
| I-2 | Hard-coded role addresses require operational rotation plan | Info | Acknowledged |
| I-3 | Permit signature reuse invalidation on name change should be documented for integrators | Info | Acknowledged |

## Detailed Findings

### Q-1. Deployment script allows undefined configurator/endpoint addresses (Medium)
**Description.** `deploy/FT.ts` pulls network metadata from `getChainConfig`, but it never enforces that the call actually returns configuration for the active chain. When no entry exists, both `ftConfigurator` and `endpointV2Address` remain `undefined`, yet they are forwarded to the Solidity constructor. This will either revert on-chain (`_transferConfigurator` rejects the zero address) or, worse, encode to zero, preventing the contract from operating correctly on newly added chains.【F:deploy/FT.ts†L20-L40】

**Recommendation.** Assert that `chainConfig`, `ftConfigurator`, and `endpointV2Address` are defined before deploying. Failing fast with a descriptive error protects against silent misconfiguration when onboarding a new network.

### Q-2. Configurator retains broad control during pauses (Low)
**Description.** While the contract pauses transfers for ordinary users, the `_update` override whitelists the configurator as both caller and counterparty. This means the configurator can continue moving tokens between arbitrary addresses (subject to allowances when acting as `msg.sender`) even while the system is paused.【F:contracts/FT.sol†L313-L351】 This is intentional for recovery workflows but materially weakens the freeze guarantee.

**Recommendation.** Confirm stakeholders are comfortable with this level of configurator authority. If a stricter freeze is required, remove the `sender == ftConfigurator` branch or gate it behind an additional flag.

### I-1. Verification step may throw due to missing `run` binding in deployment script (Informational)
**Description.** The deployment script calls `run("verify:verify", …)` after deploying, but no `run` symbol is imported or destructured from the Hardhat runtime. In TypeScript this will raise a `ReferenceError`, preventing automatic Etherscan verification.【F:deploy/FT.ts†L50-L59】

**Recommendation.** Either destructure `const { run } = hre;` near the top of the function or switch to `await hre.run(...)` to rely on the injected runtime helper.

### I-2. Hard-coded role addresses require operational rotation plan (Informational)
**Description.** `utils/constants.ts` hard-codes both the delegate and configurator addresses for every chain to the same constant. Operationally, this concentrates power in a single key, and rotating to new signers requires a code change followed by redeploy or configuration updates.【F:utils/constants.ts†L11-L94】

**Recommendation.** Maintain an off-chain process (or upgrade path) for rotating these addresses. Consider sourcing them from environment variables or deployment files instead of constants.

### I-3. Permit signature reuse invalidation on name change should be documented for integrators (Informational)
**Description.** The token recomputes the EIP-712 domain separator dynamically from the mutable name value, which is correct for security but invalidates any previously signed permits when the owner renames the token.【F:contracts/FT.sol†L174-L310】 Integrators relying on cached permits must be aware of this behavior to avoid UX regressions.

**Recommendation.** Communicate this explicitly in external documentation and coordinate name/symbol changes carefully.

## Additional Observations
- The Solidity contract generally follows OpenZeppelin best practices, with explicit custom errors and a well-documented pause policy.【F:contracts/FT.sol†L12-L351】
- Hardhat tests comprehensively cover pausing, configurator rotation, burning, and both ERC-2612 permit flows, which is a strong signal of correctness.【F:test/hardhat/FT.test.ts†L1-L214】

## Testing Notes
- `pnpm test` (fails – Hardhat cannot download compiler binaries in this sandboxed environment).【27e512†L1-L33】


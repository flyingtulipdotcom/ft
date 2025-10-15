// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @dev Minimal interface to call the FT 1271-aware permit overload
interface IFTPermit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        bytes calldata signature
    ) external;
}

/// @dev Malicious ERC-1271 wallet that attempts to reenter the token's `permit`
///      from within `isValidSignature`. Because `IERC1271.isValidSignature` is
///      invoked via STATICCALL by the token, any state-changing reentrant call
///      will fail and cause the outer `permit` to revert. This contract always
///      reverts from `isValidSignature` after attempting reentrancy.
contract Reentrant1271Wallet is IERC1271 {
    address public immutable token;
    address public immutable spender;
    uint256 public immutable value;
    uint256 public immutable deadline;

    constructor(address _token, address _spender, uint256 _value, uint256 _deadline) {
        token = _token;
        spender = _spender;
        value = _value;
        deadline = _deadline;
    }

    function isValidSignature(bytes32, bytes memory signature) external view returns (bytes4) {
        // Attempt to reenter token.permit(...) within a static context.
        // This cannot succeed due to STATICCALL restrictions and should revert
        // the entire outer call. We perform a low-level call to bypass the
        // compiler's view restrictions; at runtime it will still be static.
        bytes memory data = abi.encodeWithSelector(
            IFTPermit.permit.selector,
            address(this),
            spender,
            value,
            deadline,
            signature
        );
        // Low-level call; this will fail under STATICCALL when callee tries to modify state
        // Ignore the return; revert regardless to ensure the outer call bubbles up.
        // solhint-disable-next-line no-inline-assembly
        address tokenAddr = token;
        assembly {
            let success := staticcall(gas(), tokenAddr, add(data, 32), mload(data), 0, 0)
            success := 0 // silence warnings
        }
        revert("REENTRANCY_ATTEMPT");
    }
}

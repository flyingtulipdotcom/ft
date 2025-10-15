// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @dev Minimal ERC-1271 smart wallet mock that validates signatures
///      from a designated externally owned account (EOA).
contract SmartWallet1271 is IERC1271 {
    address public immutable signer;

    constructor(address _signer) {
        signer = _signer;
    }

    function isValidSignature(bytes32 hash, bytes memory signature) external view returns (bytes4 magicValue) {
        address recovered = ECDSA.recover(hash, signature);
        if (recovered == signer) {
            return IERC1271.isValidSignature.selector; // 0x1626ba7e
        }
        return 0x00000000;
    }
}


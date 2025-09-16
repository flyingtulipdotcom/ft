// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { FT } from "../FT.sol";

// @dev WARNING: This is for testing purposes only
contract MyOFTMock is FT {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate,
        address _pauser
    ) FT(_name, _symbol, _lzEndpoint, _delegate, _pauser) {
        // pauses in the parent so we can unpause here
        _unpause();
    }

    /// @dev override to set Sonic chain id to local hardhat chainid
    function _getSonicChainId() internal pure override returns (uint16) {
        return 31337;
    }

    function mint(address _to, uint256 _amount) public {
        _mint(_to, _amount);
    }
}

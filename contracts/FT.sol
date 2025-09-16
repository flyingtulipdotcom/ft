// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";


// TODO add burn
contract FT is OFT {
    constructor(
        string memory _name,
        string memory _symbol,
        address _lzEndpoint,
        address _delegate
    ) OFT(_name, _symbol, _lzEndpoint, _delegate) Ownable(_delegate) {
        _mint(_delegate, 10000000000e18);
    }

    function burn(uint amount) external {
        _burn(_msgSender(), amount);
    }

    /**
     * @dev Burns tokens from a specified account (requires approval)
     * @param account Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnFrom(address account, uint256 amount) public {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }
}

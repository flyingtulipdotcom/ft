// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IFT } from "./interfaces/IFT.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

contract FT is IFT, OFT, ERC20Permit, Pausable {
    /**
     * @notice Emitted when the token name is changed
     * @param newName New name for the token
     */
    event NameChanged(string newName);

    /**
     * @notice Emitted when the token symbol is changed
     * @param newSymbol New symbol for the token
     */
    event SymbolChanged(string newSymbol);

    /**
     * @notice Emitted when the configurator address is changed
     * @param newConfigurator New configurator address
     */
    event ConfiguratorChanged(address newConfigurator);

    /// @param sender The address of the sender who is not authorized
    error OnlyConfigurator(address sender);

    /// @param sender The address of the sender who is not authorized
    error OnlyOwnerOrConfigurator(address sender);

    error ZeroAddress();

    /**
     * @dev Modifier to make a function callable only by the configurator.
     */
    modifier onlyConfigurator() {
        address sender = _msgSender();
        require(_configurator == sender, OnlyConfigurator(sender));
        _;
    }

    /**
     * @dev Modifier to make a function callable only by the owner or the configurator.
     */
    modifier onlyOwnerOrConfigurator() {
        address sender = _msgSender();
        require(owner() == sender || _configurator == sender, OnlyOwnerOrConfigurator(sender));
        _;
    }

    uint16 public immutable SONIC_CHAIN_ID; // Sonic mainnet chain id

    string private _symbol;
    string private _name;
    address private _configurator;

    /**
     * @param ftName Name of the token
     * @param ftSymbol Symbol of the token
     * @param lzEndpoint LayerZero endpoint address
     * @param delegate LayerZero delegate address
     * @param ftConfigurator Configurator address
     */
    constructor(
        string memory ftName,
        string memory ftSymbol,
        address lzEndpoint,
        address delegate,
        address ftConfigurator
    ) OFT(ftName, ftSymbol, lzEndpoint, delegate) ERC20Permit(ftName) Ownable(delegate) {
        _setName(ftName);
        _setSymbol(ftSymbol);
        _transferConfigurator(ftConfigurator);

        SONIC_CHAIN_ID = _getSonicChainId();
        if (block.chainid == SONIC_CHAIN_ID) {
            // mint before pausing
            _mint(ftConfigurator, 10_000_000_000e18);
        }
        _pause();
    }

    /**
     * @dev Returns the Sonic chain ID
     */
    function _getSonicChainId() internal pure virtual returns (uint16) {
        return 146;
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view override returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the name.
     */
    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the configurator address
     * @return address of the configurator
     */
    function configurator() external view returns (address) {
        return _configurator;
    }

    /**
     * @dev Burns tokens from the sender's balance
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external override {
        _burn(_msgSender(), amount);
    }

    /**
     * @dev Burns tokens from a specified account (requires approval)
     * @param account Address to burn tokens from
     * @param amount Amount of tokens to burn
     */
    function burnFrom(address account, uint256 amount) external override {
        _spendAllowance(account, _msgSender(), amount);
        _burn(account, amount);
    }

    /**
     * @notice Pauses or unpauses the contract, only owner or configurator can call
     * @param isPaused true to pause, false to unpause
     */
    function setPaused(bool isPaused) external onlyOwnerOrConfigurator {
        // emits events from Pausable
        isPaused ? _pause() : _unpause();
    }

    /**
     * @notice Sets a new configurator address
     * @param newConfigurator New configurator address
     */
    function transferConfigurator(address newConfigurator) external onlyConfigurator {
        _transferConfigurator(newConfigurator);
    }

    function _transferConfigurator(address newConfigurator) private {
        require(newConfigurator != address(0x0), ZeroAddress());

        _configurator = newConfigurator;
        emit ConfiguratorChanged(newConfigurator);
    }

    /**
     * @notice Sets a new name for the token, only owner can call
     * @param newName New name for the token
     */
    function setName(string memory newName) external onlyOwner {
        _setName(newName);
    }

    function _setName(string memory newName) private {
        _name = newName;
        emit NameChanged(newName);
    }

    /**
     * @notice Sets a new symbol for the token, only owner can call
     * @param newSymbol New symbol for the token
     */
    function setSymbol(string memory newSymbol) external onlyOwner {
        _setSymbol(newSymbol);
    }

    function _setSymbol(string memory newSymbol) private {
        _symbol = newSymbol;
        emit SymbolChanged(newSymbol);
    }

    /**
     * @dev Blocks transfers when paused, except for the endpoint and the configurator
     * @dev See {ERC20-_update}.
     * @param from Sender address
     * @param to Recipient address
     * @param value Amount of tokens
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override {
        if (!paused()) {
            super._update(from, to, value);
            return;
        }

        address ftConfigurator = _configurator;
        if (from == ftConfigurator || to == ftConfigurator) {
            super._update(from, to, value);
            return;
        }

        address sender = _msgSender();
        if (sender == address(endpoint) || sender == ftConfigurator) {
            super._update(from, to, value);
            return;
        }

        revert EnforcedPause();
    }
}

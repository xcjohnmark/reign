// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

contract ReignPool {
    // State variables
    address public owner;
    bool public epochEnded;
    uint256 public totalDeposits; // Tracks total locked principal

    // Mappings
    mapping(address => uint256) public userDeposits; // User address => locked principal
    mapping(address => uint256) public withdrawableProfit; // User address => accumulated profit

    // Constants (using 18 decimals)
    uint256 public constant MIN_DEPOSIT_LIMIT = 125 * 10**15; // 0.125 OKB
    uint256 public constant MIN_WITHDRAWAL_LIMIT = 625 * 10**14; // 0.0625 OKB ($5 equivalent)

    // Events
    event Deposited(address indexed user, uint256 principal, uint256 fee);
    event ProfitWithdrawn(address indexed user, uint256 amount);
    event PrincipalWithdrawn(address indexed user, uint256 amount);
    event MatchdaySettled(uint256 totalUsers);
    event EpochEnded();
    event OwnerChanged(address indexed oldOwner, address indexed newOwner);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    /**
     * @notice Allows a user to deposit native OKB (20% non-refundable entry fee + 80% refundable principal)
     */
    function deposit() external payable {
        require(userDeposits[msg.sender] == 0, "User already registered");
        require(!epochEnded, "Epoch already ended");
        require(msg.value >= MIN_DEPOSIT_LIMIT, "Below minimum deposit limit");

        uint256 fee = (msg.value * 20) / 100;
        uint256 principal = msg.value - fee;

        userDeposits[msg.sender] = principal;
        totalDeposits += principal;

        emit Deposited(msg.sender, principal, fee);
    }

    /**
     * @notice Batch settle matchday rewards and fees for users (Admin only)
     * @param users Array of user addresses
     * @param profitsOrLosses Array of net profit/loss values in 18 decimals (positive for profit, negative for loss)
     */
    function settleMatchday(
        address[] calldata users,
        int256[] calldata profitsOrLosses
    ) external onlyOwner {
        require(users.length == profitsOrLosses.length, "Array length mismatch");

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];
            int256 netChange = profitsOrLosses[i];

            if (netChange >= 0) {
                withdrawableProfit[user] += uint256(netChange);
            } else {
                uint256 loss = uint256(-netChange);
                if (withdrawableProfit[user] >= loss) {
                    withdrawableProfit[user] -= loss;
                } else {
                    withdrawableProfit[user] = 0; // Clamped at 0, principal remains safe
                }
            }
        }

        emit MatchdaySettled(users.length);
    }

    /**
     * @notice Allows a user to withdraw their accumulated profit
     * @param amount Amount to withdraw in 18 decimals
     */
    function withdrawProfit(uint256 amount) external {
        require(amount >= MIN_WITHDRAWAL_LIMIT, "Below minimum withdrawal limit");
        require(withdrawableProfit[msg.sender] >= amount, "Insufficient profit balance");

        withdrawableProfit[msg.sender] -= amount;

        (bool success, ) = payable(msg.sender).call{value: amount}("");
        require(success, "Transfer failed");

        emit ProfitWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Allows a user to retrieve their principal once the epoch (tournament) has ended
     */
    function withdrawPrincipal() external {
        require(epochEnded, "Epoch has not ended");
        uint256 principal = userDeposits[msg.sender];
        require(principal > 0, "No principal to withdraw");

        userDeposits[msg.sender] = 0;
        totalDeposits -= principal;

        (bool success, ) = payable(msg.sender).call{value: principal}("");
        require(success, "Transfer failed");

        emit PrincipalWithdrawn(msg.sender, principal);
    }

    /**
     * @notice Signal the end of the tournament epoch, unlocking principal withdrawals (Admin only)
     */
    function endEpoch() external onlyOwner {
        require(!epochEnded, "Epoch already ended");
        epochEnded = true;
        emit EpochEnded();
    }

    /**
     * @notice Change the owner of the contract (Admin only)
     */
    function changeOwner(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner address");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnerChanged(oldOwner, newOwner);
    }
}

import { expect } from "chai";
import { network } from "hardhat";

describe("REIGN Smart Contracts Suite", function () {
  let mockUSDT: any;
  let reignPool: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;
  let ethers: any;

  beforeEach(async function () {
    const connection = await network.getOrCreate();
    ethers = connection.ethers;

    [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy MockUSDT
    mockUSDT = await ethers.deployContract("MockUSDT");
    await mockUSDT.waitForDeployment();

    // Deploy ReignPool with MockUSDT address
    reignPool = await ethers.deployContract("ReignPool", [await mockUSDT.getAddress()]);
    await reignPool.waitForDeployment();

    // Mint and approve tokens for testing
    const hundredUSDT = ethers.parseUnits("100", 18);

    await mockUSDT.faucet(user1.address, hundredUSDT);
    await mockUSDT.connect(user1).approve(await reignPool.getAddress(), hundredUSDT);

    await mockUSDT.faucet(user2.address, hundredUSDT);
    await mockUSDT.connect(user2).approve(await reignPool.getAddress(), hundredUSDT);

    await mockUSDT.faucet(user3.address, hundredUSDT);
    await mockUSDT.connect(user3).approve(await reignPool.getAddress(), hundredUSDT);
  });

  describe("MockUSDT Faucet", function () {
    it("Should allow faucet minting", async function () {
      const balanceBefore = await mockUSDT.balanceOf(user1.address);
      await mockUSDT.faucet(user1.address, ethers.parseUnits("50", 18));
      const balanceAfter = await mockUSDT.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseUnits("50", 18));
    });
  });

  describe("ReignPool Deposits", function () {
    it("Should allow a user to deposit $10 ($2 fee + $8 principal)", async function () {
      const poolAddress = await reignPool.getAddress();
      const userBalanceBefore = await mockUSDT.balanceOf(user1.address);
      const poolBalanceBefore = await mockUSDT.balanceOf(poolAddress);

      // Deposit
      await expect(reignPool.connect(user1).deposit())
        .to.emit(reignPool, "Deposited")
        .withArgs(user1.address, ethers.parseUnits("8", 18), ethers.parseUnits("2", 18));

      const userBalanceAfter = await mockUSDT.balanceOf(user1.address);
      const poolBalanceAfter = await mockUSDT.balanceOf(poolAddress);

      expect(userBalanceBefore - userBalanceAfter).to.equal(ethers.parseUnits("10", 18));
      expect(poolBalanceAfter - poolBalanceBefore).to.equal(ethers.parseUnits("10", 18));

      expect(await reignPool.userDeposits(user1.address)).to.equal(ethers.parseUnits("8", 18));
      expect(await reignPool.totalDeposits()).to.equal(ethers.parseUnits("8", 18));
    });

    it("Should reject double deposits", async function () {
      await reignPool.connect(user1).deposit();
      await expect(reignPool.connect(user1).deposit()).to.be.revertedWith("User already registered");
    });

    it("Should reject deposits after epoch ended", async function () {
      await reignPool.endEpoch();
      await expect(reignPool.connect(user1).deposit()).to.be.revertedWith("Epoch already ended");
    });
  });

  describe("ReignPool Settlement (NRPS Payouts)", function () {
    beforeEach(async function () {
      // Setup deposits
      await reignPool.connect(user1).deposit();
      await reignPool.connect(user2).deposit();
      await reignPool.connect(user3).deposit();
    });

    it("Should allow owner to batch settle matchday with net profits/losses", async function () {
      const users = [user1.address, user2.address, user3.address];
      const profitsOrLosses = [
        ethers.parseUnits("3.5", 18),   // user1 gains $3.5
        ethers.parseUnits("-1.2", 18),  // user2 loses $1.2
        ethers.parseUnits("0", 18),     // user3 flat
      ];

      await expect(reignPool.settleMatchday(users, profitsOrLosses))
        .to.emit(reignPool, "MatchdaySettled")
        .withArgs(3);

      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("3.5", 18));
      expect(await reignPool.withdrawableProfit(user2.address)).to.equal(0); // clamped at 0 since they had no profit
      expect(await reignPool.withdrawableProfit(user3.address)).to.equal(0);
    });

    it("Should handle consecutive profit and loss updates correctly (clamping & recovery)", async function () {
      const users = [user1.address];

      // Matchday 1: User 1 gets +$6 profit
      await reignPool.settleMatchday(users, [ethers.parseUnits("6", 18)]);
      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("6", 18));

      // Matchday 2: User 1 gets -$2 loss
      await reignPool.settleMatchday(users, [ethers.parseUnits("-2", 18)]);
      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("4", 18));

      // Matchday 3: User 1 gets -$5 loss (clamped to 0)
      await reignPool.settleMatchday(users, [ethers.parseUnits("-5", 18)]);
      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(0);

      // Matchday 4: User 1 gets +$1 profit (recovers to 1)
      await reignPool.settleMatchday(users, [ethers.parseUnits("1", 18)]);
      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("1", 18));
    });

    it("Should reject non-owner settlement calls", async function () {
      await expect(
        reignPool.connect(user1).settleMatchday([user1.address], [ethers.parseUnits("1", 18)])
      ).to.be.revertedWith("Only owner can perform this action");
    });
  });

  describe("ReignPool Profit Withdrawals", function () {
    beforeEach(async function () {
      await reignPool.connect(user1).deposit();
      // Grant user1 some profit
      await reignPool.settleMatchday([user1.address], [ethers.parseUnits("10", 18)]);
    });

    it("Should allow user to withdraw profit if above the minimum limit ($5)", async function () {
      const userBalanceBefore = await mockUSDT.balanceOf(user1.address);
      const withdrawalAmount = ethers.parseUnits("6", 18);

      await expect(reignPool.connect(user1).withdrawProfit(withdrawalAmount))
        .to.emit(reignPool, "ProfitWithdrawn")
        .withArgs(user1.address, withdrawalAmount);

      const userBalanceAfter = await mockUSDT.balanceOf(user1.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(withdrawalAmount);

      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("4", 18));
    });

    it("Should reject profit withdrawals below the minimum limit ($5)", async function () {
      const withdrawalAmount = ethers.parseUnits("4.9", 18);
      await expect(
        reignPool.connect(user1).withdrawProfit(withdrawalAmount)
      ).to.be.revertedWith("Below minimum withdrawal limit");
    });

    it("Should reject profit withdrawals exceeding the balance", async function () {
      const withdrawalAmount = ethers.parseUnits("11", 18);
      await expect(
        reignPool.connect(user1).withdrawProfit(withdrawalAmount)
      ).to.be.revertedWith("Insufficient profit balance");
    });
  });

  describe("ReignPool Principal Withdrawals & Epoch end", function () {
    beforeEach(async function () {
      await reignPool.connect(user1).deposit();
    });

    it("Should reject principal withdrawal before epoch ends", async function () {
      await expect(reignPool.connect(user1).withdrawPrincipal()).to.be.revertedWith("Epoch has not ended");
    });

    it("Should allow principal withdrawal after epoch ends", async function () {
      await expect(reignPool.endEpoch())
        .to.emit(reignPool, "EpochEnded");

      const userBalanceBefore = await mockUSDT.balanceOf(user1.address);

      await expect(reignPool.connect(user1).withdrawPrincipal())
        .to.emit(reignPool, "PrincipalWithdrawn")
        .withArgs(user1.address, ethers.parseUnits("8", 18));

      const userBalanceAfter = await mockUSDT.balanceOf(user1.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(ethers.parseUnits("8", 18));

      expect(await reignPool.userDeposits(user1.address)).to.equal(0);
    });

    it("Should reject principal withdrawal if user has no deposit", async function () {
      await reignPool.endEpoch();
      await expect(reignPool.connect(user2).withdrawPrincipal()).to.be.revertedWith("No principal to withdraw");
    });

    it("Should reject ending epoch by non-owner", async function () {
      await expect(reignPool.connect(user1).endEpoch()).to.be.revertedWith("Only owner can perform this action");
    });
  });
});

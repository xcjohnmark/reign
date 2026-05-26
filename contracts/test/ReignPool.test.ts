import { expect } from "chai";
import { network } from "hardhat";

describe("REIGN Smart Contracts Suite", function () {
  let reignPool: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;
  let ethers: any;
  let provider: any;

  beforeEach(async function () {
    const connection = await network.getOrCreate();
    ethers = connection.ethers;
    provider = ethers.provider;

    [owner, user1, user2, user3] = await ethers.getSigners();

    // Deploy ReignPool
    reignPool = await ethers.deployContract("ReignPool");
    await reignPool.waitForDeployment();
  });

  describe("ReignPool Deposits", function () {
    it("Should allow a user to deposit native OKB (20% fee + 80% principal)", async function () {
      const poolAddress = await reignPool.getAddress();
      const depositVal = ethers.parseUnits("1.0", 18); // 1.0 OKB

      const poolBalanceBefore = await provider.getBalance(poolAddress);

      // Deposit
      await expect(reignPool.connect(user1).deposit({ value: depositVal }))
        .to.emit(reignPool, "Deposited")
        .withArgs(user1.address, ethers.parseUnits("0.8", 18), ethers.parseUnits("0.2", 18));

      const poolBalanceAfter = await provider.getBalance(poolAddress);
      expect(poolBalanceAfter - poolBalanceBefore).to.equal(depositVal);

      expect(await reignPool.userDeposits(user1.address)).to.equal(ethers.parseUnits("0.8", 18));
      expect(await reignPool.totalDeposits()).to.equal(ethers.parseUnits("0.8", 18));
    });

    it("Should reject deposits below the minimum limit (0.125 OKB)", async function () {
      const tooLow = ethers.parseUnits("0.12", 18);
      await expect(
        reignPool.connect(user1).deposit({ value: tooLow })
      ).to.be.revertedWith("Below minimum deposit limit");
    });

    it("Should reject double deposits", async function () {
      await reignPool.connect(user1).deposit({ value: ethers.parseUnits("1.0", 18) });
      await expect(
        reignPool.connect(user1).deposit({ value: ethers.parseUnits("1.0", 18) })
      ).to.be.revertedWith("User already registered");
    });

    it("Should reject deposits after epoch ended", async function () {
      await reignPool.endEpoch();
      await expect(
        reignPool.connect(user1).deposit({ value: ethers.parseUnits("1.0", 18) })
      ).to.be.revertedWith("Epoch already ended");
    });
  });

  describe("ReignPool Settlement (NRPS Payouts)", function () {
    beforeEach(async function () {
      // Setup deposits
      await reignPool.connect(user1).deposit({ value: ethers.parseUnits("1.0", 18) }); // locks 0.8
      await reignPool.connect(user2).deposit({ value: ethers.parseUnits("2.0", 18) }); // locks 1.6
      await reignPool.connect(user3).deposit({ value: ethers.parseUnits("0.5", 18) }); // locks 0.4
    });

    it("Should allow owner to batch settle matchday with net profits/losses", async function () {
      const users = [user1.address, user2.address, user3.address];
      const profitsOrLosses = [
        ethers.parseUnits("0.35", 18),
        ethers.parseUnits("-0.12", 18),
        ethers.parseUnits("0", 18),
      ];

      await expect(reignPool.settleMatchday(users, profitsOrLosses))
        .to.emit(reignPool, "MatchdaySettled")
        .withArgs(3);

      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("0.35", 18));
      expect(await reignPool.withdrawableProfit(user2.address)).to.equal(0); // clamped at 0
      expect(await reignPool.withdrawableProfit(user3.address)).to.equal(0);
    });

    it("Should handle consecutive profit and loss updates correctly (clamping & recovery)", async function () {
      const users = [user1.address];

      // Matchday 1: User 1 gets +0.6 profit
      await reignPool.settleMatchday(users, [ethers.parseUnits("0.6", 18)]);
      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("0.6", 18));

      // Matchday 2: User 1 gets -0.2 loss
      await reignPool.settleMatchday(users, [ethers.parseUnits("-0.2", 18)]);
      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("0.4", 18));

      // Matchday 3: User 1 gets -0.5 loss (clamped to 0)
      await reignPool.settleMatchday(users, [ethers.parseUnits("-0.5", 18)]);
      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(0);

      // Matchday 4: User 1 gets +0.1 profit
      await reignPool.settleMatchday(users, [ethers.parseUnits("0.1", 18)]);
      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("0.1", 18));
    });

    it("Should reject non-owner settlement calls", async function () {
      await expect(
        reignPool.connect(user1).settleMatchday([user1.address], [ethers.parseUnits("0.1", 18)])
      ).to.be.revertedWith("Only owner can perform this action");
    });
  });

  describe("ReignPool Profit Withdrawals", function () {
    beforeEach(async function () {
      await reignPool.connect(user1).deposit({ value: ethers.parseUnits("1.0", 18) });
      // Grant user1 some profit (0.1 OKB, which is above the 0.0625 minimum limit)
      await reignPool.settleMatchday([user1.address], [ethers.parseUnits("0.1", 18)]);
    });

    it("Should allow user to withdraw profit if above the minimum limit (0.0625 OKB)", async function () {
      const userBalanceBefore = await provider.getBalance(user1.address);
      const withdrawalAmount = ethers.parseUnits("0.08", 18);

      const tx = await reignPool.connect(user1).withdrawProfit(withdrawalAmount);
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const userBalanceAfter = await provider.getBalance(user1.address);
      expect(userBalanceAfter - userBalanceBefore + gasUsed).to.equal(withdrawalAmount);

      expect(await reignPool.withdrawableProfit(user1.address)).to.equal(ethers.parseUnits("0.02", 18));
    });

    it("Should reject profit withdrawals below the minimum limit (0.0625 OKB)", async function () {
      const withdrawalAmount = ethers.parseUnits("0.06", 18);
      await expect(
        reignPool.connect(user1).withdrawProfit(withdrawalAmount)
      ).to.be.revertedWith("Below minimum withdrawal limit");
    });

    it("Should reject profit withdrawals exceeding the balance", async function () {
      const withdrawalAmount = ethers.parseUnits("0.15", 18);
      await expect(
        reignPool.connect(user1).withdrawProfit(withdrawalAmount)
      ).to.be.revertedWith("Insufficient profit balance");
    });
  });

  describe("ReignPool Principal Withdrawals & Epoch end", function () {
    beforeEach(async function () {
      await reignPool.connect(user1).deposit({ value: ethers.parseUnits("1.0", 18) }); // locks 0.8
    });

    it("Should reject principal withdrawal before epoch ends", async function () {
      await expect(reignPool.connect(user1).withdrawPrincipal()).to.be.revertedWith("Epoch has not ended");
    });

    it("Should allow principal withdrawal after epoch ends", async function () {
      await expect(reignPool.endEpoch())
        .to.emit(reignPool, "EpochEnded");

      const userBalanceBefore = await provider.getBalance(user1.address);

      const tx = await reignPool.connect(user1).withdrawPrincipal();
      const receipt = await tx.wait();
      const gasUsed = receipt.gasUsed * receipt.gasPrice;

      const userBalanceAfter = await provider.getBalance(user1.address);
      expect(userBalanceAfter - userBalanceBefore + gasUsed).to.equal(ethers.parseUnits("0.8", 18));

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

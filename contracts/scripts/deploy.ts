import { network } from "hardhat";

async function main() {
  console.log("Starting deployment...");

  const connection = await network.getOrCreate();
  const { ethers } = connection;
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);

  // Deploy MockUSDT
  console.log("Deploying MockUSDT...");
  const mockUSDT = await ethers.deployContract("MockUSDT");
  await mockUSDT.waitForDeployment();
  const mockUSDTAddress = await mockUSDT.getAddress();
  console.log(`MockUSDT deployed to: ${mockUSDTAddress}`);

  // Deploy ReignPool
  console.log("Deploying ReignPool...");
  const reignPool = await ethers.deployContract("ReignPool", [mockUSDTAddress]);
  await reignPool.waitForDeployment();
  const reignPoolAddress = await reignPool.getAddress();
  console.log(`ReignPool deployed to: ${reignPoolAddress}`);

  console.log("Deployment finished successfully!");
}

main().catch((error) => {
  console.error("Error during deployment:", error);
  process.exitCode = 1;
});

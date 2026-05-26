import { Wallet } from "ethers";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wallet = Wallet.createRandom();

const envContent = `PRIVATE_KEY="${wallet.privateKey}"\n`;
const envPath = path.join(__dirname, "..", ".env");

fs.writeFileSync(envPath, envContent, "utf8");

console.log("==========================================");
console.log("SUCCESS: Generated secure deployer wallet!");
console.log("==========================================");
console.log("New Address:    ", wallet.address);
console.log("Private Key saved to contracts/.env");
console.log("==========================================");

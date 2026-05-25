# REIGN — Web3 Fantasy World Cup on X Layer

REIGN is a Gamified Web3 Fantasy Sports platform themed around the 2026 World Cup, built on OKX's **X Layer L2 network**. 

It implements a **Hybrid Capital Lock + Profit (HCLP)** model ($2 entry fee goes to matchday prize pools, $8 principal is locked and refunded after the tournament) and redistributes rewards dynamically using the **Normalized Relative Performance System (NRPS)** (Softmax-tanh mathematical redistribution of fantasy Z-scores).

---

## 🛠️ Prerequisites
* **Node.js**: `v20.0.0` or higher (tested up to `v25.9.0`)
* **Docker & Docker Compose**: (Optional, for containerized orchestration)
* **Web3 Wallet**: OKX Wallet or MetaMask (Optional, a built-in Mock Sign-In is provided for no-wallet testing)

---

## 🚀 Option 1: Quick Start via Docker Compose (Recommended)
This method spins up both the local Hardhat EVM network node (with automatically compiled and deployed smart contracts) and the Next.js frontend in containerized environments.

1. **Build and start the container stack**:
   ```bash
   docker-compose up --build
   ```
2. **Access the application**:
   * Frontend: Open [http://localhost:3000](http://localhost:3000)
   * Hardhat RPC Node: Access [http://localhost:8545](http://localhost:8545)

3. **Data Persistence**:
   * The tournament game state database (`gameState.json`) is persisted in a named Docker volume (`reign-state`).

---

## 💻 Option 2: Running Locally (Manual Node Setup)

### 1. Set Up and Run the Smart Contracts
1. Navigate to the `contracts` directory and install dependencies:
   ```bash
   cd contracts
   npm install
   ```
2. Spin up a local Hardhat RPC node:
   ```bash
   npx hardhat node
   ```
3. In a separate terminal, deploy the smart contracts to the localhost network:
   ```bash
   cd contracts
   npx hardhat run scripts/deploy.ts --network localhost
   ```
   *The script will output the deployed contract addresses for `MockUSDT` and `ReignPool`.*

### 2. Set Up and Run the Frontend
1. Return to the root directory and install dependencies:
   ```bash
   cd ..
   npm install
   ```
2. Launch the Next.js development server:
   ```bash
   npm run dev
   ```
3. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ⚡ Option 3: Simulated Mock Mode (No RPC Node or Wallet Extension Required)
If you want to immediately test the full gameplay loop without running an EVM node or connecting MetaMask/OKX Wallet:

1. Start the Next.js development server:
   ```bash
   npm run dev
   ```
2. Open [http://localhost:3000](http://localhost:3000) and click **Mock Sign-In** in the top-right corner.
   * This automatically connects you to Hardhat Account #0 (`0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266`).
   * You can mint faucet USDT, lock your $10 stake, save your squad, and simulate all 7 tournament matchdays using the UI. All transactions will be executed against our high-fidelity, simulated Web3 ledger endpoint (`/api/web3`) and persisted in `src/data/gameState.json`.

---

## 🧪 Testing & Verification

We provide three layers of automated tests to verify the contracts, maths, and integration flow.

### 1. Smart Contract Unit Tests (Hardhat)
Validates deposit locks, owner restrictions, profit claims, and principal withdrawals.
```bash
cd contracts
npx hardhat test
```

### 2. Matchday & NRPS Math Verification
Tests competitor generation, FPL point systems, auto-substitutions, and NRPS standard deviations.
```bash
npx tsx verifyPhase3.ts
```

### 3. Full End-to-End System Integration Tests
Performs a simulated user walkthrough: minting USDT, staking, locking squad, simulating all 7 World Cup matchdays, claiming profits, and withdrawing refunded principal.
```bash
npx tsx verifyEndToEnd.ts
```

---

## 🤖 Can an Agent Run and Test the App?
**Yes!** An AI agent can run the app and execute full integration testing easily:

1. **Automated E2E Testing**:
   An agent can execute the full gameplay simulation loop and balance verifications by running:
   ```bash
   npx tsx verifyEndToEnd.ts
   ```
   *This script runs locally in 1 second, executing 100% of game logics and asserts all mock ledger states.*

2. **Automated API Testing (While Dev Server is Running)**:
   An agent can start the development server (`npm run dev`) and test endpoints using HTTP requests:
   * **Mint Faucet**: `POST /api/web3` with `{ "walletAddress": "0x...", "action": "faucet" }`
   * **Deposit Stake**: `POST /api/web3` with `{ "walletAddress": "0x...", "action": "deposit" }`
   * **Lock Squad**: `POST /api/squad` with squad IDs and a mock signature (`0xmock_...`)
   * **Simulate Matchday**: `POST /api/simulator` to advance the tournament.
   * **Check Balances**: `GET /api/web3?wallet=0x...`

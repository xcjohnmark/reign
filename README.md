# REIGN — Web3 Tournament Fantasy Sports on X Layer

REIGN is a gamified Web3 fantasy sports platform themed around the World Cup, built to run on OKX's **X Layer L2 network**. 

REIGN protects player capital while rewarding skill through a **Hybrid Capital Lock + Profit (HCLP)** economic model. Players lock their stake in a secure smart contract to enter the tournament; a minor entry fee (20%) goes into the matchday prize pools, while the principal (80%) is safely locked and fully refunded at the end of the tournament.

Rewards are distributed dynamically using our **Normalized Relative Performance System (NRPS)**—a mathematically fair reward distribution engine that scales payouts based on relative team performance, eliminating the winner-take-all bias of traditional fantasy leagues.

---

## OKX & X Layer Integration Highlights
REIGN was built from the ground up to showcase the power and scalability of OKX's Web3 infrastructure:
* **Native OKB Integration:** Native OKB is used for player staking, deposit locking, and fee distributions on the network, driving active utility.
* **Smart Contract Layer:** Deployed on **X Layer Testnet** (`chainId: 1952`) at address [`0xFfaF1C33eE94187e7897D1E1B539665e14e593Fc`](https://www.okx.com/explorer/xlayer-testnet/address/0xFfaF1C33eE94187e7897D1E1B539665e14e593Fc).
* **OKX Wallet Compatibility:** Native integration with the OKX Wallet extension for secure user onboarding, transaction approvals, and cryptographic squad signing.
* **Delegated Server-Side Payout Settlement:** Because smart contract matchday payouts are restricted to the contract owner (`onlyOwner`), we implemented a server-side route (`/api/settle`) powered by **Viem**. This API reads the secure deployment key from the environment and signs settlement transactions on behalf of the admin. **This allows any judge or tester to trigger live on-chain payouts directly from the frontend dashboard without encountering reverted transactions.**

---

## System Architecture

```mermaid
flowchart TD
    %% Styling
    classDef frontend fill:#1e1e24,stroke:#00ffd0,stroke-width:2px,color:#fff;
    classDef backend fill:#111215,stroke:#00bfff,stroke-width:2px,color:#fff;
    classDef blockchain fill:#161b22,stroke:#39eb34,stroke-width:2px,color:#fff;
    classDef state fill:#21262d,stroke:#8b5cf6,stroke-width:2px,color:#fff;

    %% Nodes
    User(("👤 User Wallet <br> (OKX Wallet / Metamask)")):::frontend
    Browser["🖥️ React / Next.js UI <br> (OKX Sleek Dark Theme)"]:::frontend
    SquadAPI["⚙️ Squad Validator API <br> (/api/squad)"]:::backend
    SettleAPI["🤖 Delegated Signer API <br> (/api/settle)"]:::backend
    SimAPI["🎮 Tournament Simulator <br> (/api/simulator)"]:::backend
    StateDB[("📁 Game State DB <br> (gameState.json)")]:::state
    PoolContract["📜 ReignPool Contract <br> (X Layer Testnet)"]:::blockchain

    %% Flows
    User -->|1. Stake & Deposit| Browser
    Browser -->|Write Contract| PoolContract
    Browser -->|2. Save & Sign Squad| SquadAPI
    SquadAPI -->|Validate Limits & Budget| StateDB
    Browser -->|3. Simulate Matchday| SimAPI
    SimAPI -->|Compute Scores & NRPS Payouts| StateDB
    SimAPI -->|4. Request Settlement| SettleAPI
    SettleAPI -->|5. Write Contract (onlyOwner)| PoolContract
    PoolContract -->|6. Settle Profits on Ledger| User
```

---

## The Mathematics of NRPS

### Why We Use NRPS
Traditional fantasy sports payouts suffer from major issues:
1. **Winner-Take-All Bias:** A tiny fraction of top players wins the entire prize pool, discouraging average participants.
2. **Fixed Reward Cliffs:** Rigid payouts (e.g., 1st wins $100, 2nd wins $50) don't reflect *how much better* one player performed than another.

The **Normalized Relative Performance System (NRPS)** solves this by calculating relative performance relative to the average competitor's score on a given matchday, using a Z-score Softmax redistribution engine:

### Mathematical Formulation

1. **User Weight Calculation ($U_u$):**
   A user's raw score is scaled by their locked principal to reward both skill and high-fidelity staking:
   $$U_u = \frac{\text{Score}_u \cdot \text{Principal}_u}{\sum_{i=1}^N \text{Principal}_i}$$

2. **Global Mean ($\mu$) and Standard Deviation ($\sigma$):**
   The average performance metric and variance across all active competitors ($N$) are calculated:
   $$\mu = \frac{1}{N}\sum_{i=1}^N U_i$$
   $$\sigma = \sqrt{\frac{1}{N}\sum_{i=1}^N (U_i - \mu)^2}$$

3. **Z-Score Normalization ($Z_u$):**
   We determine how many standard deviations the user is above or below the mean:
   $$Z_u = \frac{U_u - \mu}{\sigma}$$

4. **Hyperbolic Tangent Compression ($R_u$):**
   To prevent single runaway outliers (e.g., a lucky captain choice scoring triple goals) from absorbing the entire prize pool, Z-scores are compressed using a $\tanh$ function with a sensitivity parameter $\beta$ (default $= 1.0$):
   $$R_u = \tanh(\beta \cdot Z_u)$$

5. **Softmax Normalization ($w_u$):**
   We calculate the final percentage share of the prize pool using Softmax, ensuring all distribution weights sum up to exactly $1.0$:
   $$w_u = \frac{e^{R_u}}{\sum_{j=1}^N e^{R_j}}$$

6. **Net Payout Calculation ($\text{Profit}_u$):**
   The final user payout is their weight multiplied by the matchday prize pool ($\text{Pool}_t$), minus their contribution fee ($\text{Fee}_t$):
   $$\text{Profit}_u = (w_u \cdot \text{Pool}_t) - \text{Fee}_t$$

---

## Key Features & Technical Innovations

* **Dynamic Knockout-Stage Quotas:** To prevent squad deadlocks as countries get eliminated during knockout phases, REIGN implements dynamic country limits that automatically scale by matchday:
  * **Matchdays 1-4 (Groups & Round of 16):** Max **3** players from the same country.
  * **Matchday 5 (Quarter-finals):** Max **4** players from the same country.
  * **Matchday 6 (Semi-finals):** Max **6** players from the same country.
  * **Matchday 7 (Finals):** Max **10** players from the same country.
* **Formation-Aware FPL Auto-Substitutions:** A high-fidelity bench processor that automatically replaces starting players who played 0 minutes with valid bench options (left-to-right), ensuring the formation continues to adhere to FPL regulations (min 1 GK, 3 DEF, 1 FWD).
* **Ascending/Descending Sort Controls:** Sort players dynamically in the squad selection panel by price or rating in either ascending or descending order.
* **Premium UX & click-to-select Role Popover:** Styled with an OKX-inspired dark glassmorphism layout, featuring interactive clicks to make a player Captain or Vice-Captain with automated click-outside handling.

---

## Installation & Setup

### Prerequisites
* **Node.js**: `v20.0.0` or higher
* **Docker & Docker Compose**: (Optional, for containerized runner)
* **Web3 Wallet Extension:** (OKX Wallet recommended)

---

### Option 1: Quickstart via Docker Compose (Recommended)
This command builds and launches the Next.js frontend and a local Hardhat EVM network node with pre-compiled and deployed contracts.
```bash
docker-compose up --build
```
1. Access the web app at [http://localhost:3000](http://localhost:3000).
2. The Hardhat RPC provider runs at [http://localhost:8545](http://localhost:8545).

---

### Option 2: Running Locally (Manual Setup)

#### 1. Contract Environment Setup
Navigate to the `contracts` directory, install dependencies, and run a local node:
```bash
cd contracts
npm install
npx hardhat node
```

In a new terminal, deploy the smart contracts to your local network node:
```bash
cd contracts
npx hardhat run scripts/deploy.ts --network localhost
```

#### 2. Frontend Launch
Return to the root directory, install frontend dependencies, and launch the dev server:
```bash
cd ..
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application.

---

### Option 3: Mock Mode (No Local EVM Node or Wallet Required)
If you do not want to set up an RPC node or connect a wallet extension:
1. Start the Next.js frontend: `npm run dev`
2. Open the page and click **Mock Sign-In** in the top-right header.
3. This logs you in as Hardhat Account #0 (`0xf39fd6e51aad88f6f4ce...`) and simulates all Web3 actions (minting OKB, depositing, locking, simulating matchdays, withdrawing profits) through a high-fidelity mock database state persisted in `src/data/gameState.json`.

---

## Testing & Automated Verification Suite
We provide a comprehensive multi-layered test suite to verify contract security, scoring math, and E2E mechanics:

### 1. Smart Contract Unit Tests (Hardhat)
Validates deposit limits, owner checks, withdrawal lock-ups, and epoch resets:
```bash
cd contracts
npx hardhat test
```

### 2. Math & Simulator Verification
Validates competitor generators, FPL point scoring, auto-subs, and standard deviation calculations:
```bash
npx tsx verifyPhase3.ts
```

### 3. End-to-End Integration Verification Script
Simulates a full user epoch lifecycle (minting, staking, building a valid squad, simulating all 7 matchdays, and claiming profits/refundable principal):
```bash
npx tsx verifyEndToEnd.ts
```

---

## Project Structure
```
REIGN/
├── contracts/               # Hardhat smart contracts workspace
│   ├── contracts/           # Solidity files (ReignPool.sol)
│   ├── scripts/             # Deployment and keygen utilities
│   └── test/                # Hardhat unit tests
├── src/                     # Next.js frontend source
│   ├── app/                 # Next.js App Router (pages and API endpoints)
│   │   ├── api/             # NRPS math calculations & delegated settlements
│   │   └── page.tsx         # Sleek Dashboard & UI Controller
│   ├── data/                # Tournament datasets (seedData.json)
│   └── utils/               # FPL scoring, auto-subs & NRPS engine
├── Dockerfile               # Production Docker environment
└── docker-compose.yml       # Dev stack runner config
```

---

## Accomplishments & Challenges Overcome
* **Zero-Hallucination Matchday Engine:** Handled edge cases where players from eliminated countries must get 0 minutes in knockout rounds, successfully scaling country limits dynamically.
* **The "onlyOwner" Settlement Dilemma:** Solved the Web3 hurdle of requiring the admin key to execute payouts on-chain by constructing a secure server-side Viem signer to let judges settle live matchdays seamlessly.
* **Clean TypeScript Build:** Standardized types across calculations and endpoints to achieve `0 compilation errors` across the repository.

---

## License
This project is licensed under the MIT License - see the LICENSE file for details.

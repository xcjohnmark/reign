# Implementation Plan: REIGN — Web3 Fantasy World Cup on X Layer

REIGN is a gamified Web3 fantasy sports platform themed around the 2026 World Cup, built on OKX's X Layer L2 network. The application utilizes a **Hybrid Capital Lock + Profit (HCLP)** model (users pay a non-refundable $2 entry fee and lock a refundable $8 principal) and redistributes matchday prize pools via the **Normalized Relative Performance System (NRPS)** (based on relative Z-score rankings and $\tanh$ compression).

This plan outlines the architecture, data models, smart contract design, off-chain calculation engine, premium OKX/X-Layer-inspired UI, and verification plan.

---

## User Review Required

> [!IMPORTANT]
> **Key Decisions Aligned During Interview:**
> * **Tech Stack**: Next.js (frontend + API routes for calculations) + Foundry (Solidity contracts on X Layer).
> * **Mock Data & Simulator**: To enable immediate testing/judging, we are building a deterministic matchday generator/simulator with a pre-populated local database of all 48 World Cup countries (3-4 star players each).
> * **HCLP Contract**: A single `ReignPool` smart contract on X Layer testnet manages deposits, locks principal, collects fees, and processes batch settlements signed by our admin.
> * **Wallet & Authentication**: Wallet-only using RainbowKit/Wagmi (supporting OKX Wallet & MetaMask) with cryptographic signatures verifying squad updates off-chain.
> * **HCLP Economics**: Hybrid model ($2 fee goes directly into the matchday prize pools; $8 principal is locked and returned at the end of the epoch).

---

## Proposed Changes

We will build the application in a unified repository containing both the Next.js app and the Foundry smart contracts.

### Directory Structure
```
REIGN/
├── contracts/               # Foundry smart contracts project
│   ├── src/                 # Solidity smart contracts
│   │   ├── ReignPool.sol    # Core HCLP contract
│   │   └── MockUSDT.sol     # Mock stablecoin for testnet deposits
│   ├── test/                # Smart contract tests
│   └── foundry.toml         # Foundry configuration
├── src/                     # Next.js frontend application
│   ├── app/                 # Next.js App Router (pages and API endpoints)
│   │   ├── api/             # Off-chain calculation APIs (NRPS math, simulations)
│   │   └── page.tsx         # Dashboard and game interfaces
│   ├── components/          # Reusable UI components (OKX/X-Layer theme)
│   ├── context/             # Web3 Provider and Application State
│   ├── data/                # Seed database (48 countries, players, schedules)
│   └── utils/               # Math functions (Z-score, tanh, FPL scoring)
└── package.json             # Frontend dependencies
```

---

### Component 1: Smart Contracts (Foundry)

#### [NEW] [ReignPool.sol](file:///C:/Users/ADMIN/Documents/REIGN/contracts/src/ReignPool.sol)
Handles deposits, locks principal, collects entry fees, processes batch settlements, and manages profit withdrawals.
- **State variables**:
  - `depositToken`: Address of the mock stablecoin (e.g. USDT).
  - `entryFee`: Set to 2 * 10^18 (representing $2).
  - `lockedPrincipal`: Set to 8 * 10^18 (representing $8).
  - `totalDeposits`: Total tokens currently locked in contract.
  - `epochEnded`: Boolean flag to signal when the full tournament ends and principal is unlocked.
  - `withdrawableProfit`: Mapping of user address to profit balance (`mapping(address => uint256)`).
  - `userDeposits`: Mapping of user address to locked principal (`mapping(address => uint256)`).
  - `minWithdrawalLimit`: Minimum threshold for withdrawing profits (e.g. $5).
- **Core functions**:
  - `deposit()`: Locks $8 principal and transfers $2 entry fee to the prize pool.
  - `settleMatchday(address[] users, int256[] profitsOrLosses)`: Allows the admin/multisig to batch update the `withdrawableProfit` ledger based on the NRPS calculation.
  - `withdrawProfit(uint256 amount)`: Allows users to withdraw profit if it exceeds `minWithdrawalLimit`.
  - `withdrawPrincipal()`: Allows users to withdraw their $8 principal once `epochEnded` is true.
  - `endEpoch()`: Owner-only function to unlock all principal deposits at tournament completion.

#### [NEW] [MockUSDT.sol](file:///C:/Users/ADMIN/Documents/REIGN/contracts/src/MockUSDT.sol)
A standard ERC20 contract representing the stablecoin used for staking and payouts on the X Layer testnet. Includes a faucet function so judges can mint mock USDT to test the app.

---

### Component 2: Simulation & Calculation Engine (Next.js API)

#### [NEW] [seedData.json](file:///C:/Users/ADMIN/Documents/REIGN/src/data/seedData.json)
Pre-populated database file containing:
- 48 World Cup countries (grouped by continents/regions).
- 3-4 top star players for each country with details: name, position (GK, DEF, MID, FWD), price, and current team.
- A pre-defined matchday schedule (7 matchdays in total).

#### [NEW] [fplScoring.ts](file:///C:/Users/ADMIN/Documents/REIGN/src/utils/fplScoring.ts)
FPL points calculator. Evaluates match statistics for a player and outputs their score:
- Clean sheets (GK/DEF: +4, MID: +1)
- Goals (GK/DEF: +6, MID: +5, FWD: +4)
- Assists: +3
- Playtime: 1-59 mins (+1), 60+ mins (+2)
- Saves: +1 per 3 saves (GK only)
- Cards: Yellow (-1), Red (-3), Own goal (-2)
- Goals conceded: -1 per 2 conceded (GK/DEF)
- Auto-substitution logic: Evaluates the 15-player squad (11 starters, 4 bench), checking if any starter has 0 mins. Substitutes players left-to-right on the bench while maintaining formation validity (min 1 GK, 3 DEF, 1 FWD).
- Captain/Vice-Captain doubling: If captain plays 0 mins, vice-captain's points are doubled.

#### [NEW] [nrpsEngine.ts](file:///C:/Users/ADMIN/Documents/REIGN/src/utils/nrpsEngine.ts)
Implements the Normalized Relative Performance System:
1. Calculates $\mu_t$ (mean score of all active players) and $\sigma_t$ (standard deviation of all active players) for a given matchday.
2. Computes Z-scores: $Z_u^{(t)} = (P_u^{(t)} - \mu_t)/\sigma_t$.
3. Compresses Z-scores: $R_u^{(t)} = \tanh(\beta \cdot Z_u^{(t)})$ (with tunable parameter $\beta$).
4. Computes normalized weights using Softmax: $w_u^{(t)} = e^{R_u^{(t)}} / \sum_j e^{R_j^{(t)}}$.
5. Allocates rewards: $reward_u^{(t)} = w_u^{(t)} \cdot Pool_t$.
6. Calculates net profit/loss for the ledger: $profit_u^{(t)} = reward_u^{(t)} - \text{matchday\_fee}_u^{(t)}$ (where matchday fee is the distributed $2 entry fee, e.g. $\$2 / 7 \approx \$0.285$).

---

### Component 3: Premium UI & Web3 Dashboard

We will build a high-fidelity dashboard that mirrors the dark-themed, sleek branding of **OKX** and **X Layer** (deep carbon/black background, neon green and electric blue highlights, clean grid lines, glassmorphism card styling, and smooth animations).

#### Screens & Features:
1. **Wallet Connect & Onboarding**: Custom modal supporting MetaMask and OKX Wallet. Built-in Faucet button to mint mock USDT and deposit the $10 ($2 fee + $8 lock) into the `ReignPool` contract.
2. **Squad Builder Grid**: Interactive football pitch layout. Users select their 15-player squad (11 starters, 4 subs) adhering to a $100M budget. Includes drag-and-drop or select menus, position validators, and captain/vice-captain selectors.
3. **Interactive Simulator Panel**: Admin controls allowing the user to generate random or semi-random matchday stats, trigger auto-substitutions, execute the NRPS calculation, sign the batch payout transaction, and submit it to the X Layer testnet.
4. **Leaderboard & Ledger**: Real-time display showing matchday scores, relative Z-scores, $\tanh$ weights, and the resulting payouts. Shows the user's `lockedPrincipal` and `withdrawableProfit` on-chain, with a working **Withdraw Profit** button.

---

## Verification Plan

### Automated Tests
1. **Smart Contracts**: Foundry unit tests (`forge test`) validating deposit locks, batch settlements, owner restrictions, profit withdrawals, and epoch-end principal withdrawals.
2. **FPL Logic & NRPS Math**: Jest tests verifying the math functions, FPL points calculation, formation-aware auto-substitution edge cases, and Softmax normalization weights summing to 1.

### Manual Verification
1. **Local Testnet Deployment**: Deploy the contracts to a local Anvil instance or X Layer testnet.
2. **End-to-End Simulation**:
   - Mint mock USDT and approve `ReignPool`.
   - Deposit $10.
   - Build a squad of 15 players.
   - Simulate a matchday (triggering FPL points, auto-subs, and NRPS payouts).
   - Verify on-chain withdrawable profits increase for winners.
   - Trigger a profit withdrawal and verify balances update.
   - End the epoch and withdraw the $8 locked principal.

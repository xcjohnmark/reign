import fs from 'fs';
import path from 'path';
import { Player, MatchStats, Squad, calculateTeamScore } from './fplScoring';
import { calculateNRPS, NRPSEngineResult } from './nrpsEngine';
import { generateValidSquad } from './squadGenerator';

// Types
export interface MockOnChainState {
  okbBalance: number;
  deposited: boolean;
  withdrawableProfit: number;
  lockedPrincipal: number;
}

export interface UserState {
  wallet: string;
  name: string;
  squad: Squad | null;
  history: {
    matchday: number;
    score: number;
    reward: number;
    netProfit: number;
  }[];
  onChainState: MockOnChainState;
}

export interface MatchdayHistory {
  matchday: number;
  simulated: boolean;
  playerStats: Record<number, MatchStats>;
  nrpsResult: NRPSEngineResult | null;
  activeCountries: string[];
}

export interface CountryStanding {
  countryId: string;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
}

export interface GameState {
  currentMatchday: number;
  epochEnded: boolean;
  users: UserState[];
  matchdayHistory: MatchdayHistory[];
  activeCountries: string[];
  standings: CountryStanding[];
}

const STATE_FILE_PATH = path.join(process.cwd(), 'src', 'data', 'gameState.json');
const SEED_DATA_PATH = path.join(process.cwd(), 'src', 'data', 'seedData.json');

// Load Seed Data
export function getSeedData() {
  const fileContent = fs.readFileSync(SEED_DATA_PATH, 'utf8');
  return JSON.parse(fileContent);
}

// Read State
export function readState(): GameState {
  if (!fs.existsSync(STATE_FILE_PATH)) {
    return initializeState();
  }
  try {
    const fileContent = fs.readFileSync(STATE_FILE_PATH, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error("Error reading state, reinitializing...", error);
    return initializeState();
  }
}

// Write State
export function writeState(state: GameState): void {
  fs.writeFileSync(STATE_FILE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

// Initialize State
export function initializeState(): GameState {
  const seed = getSeedData();
  const players: Player[] = seed.players;
  const countries = seed.countries;

  // Initialize competitors (15 mock wallets)
  const competitorNames = [
    "OKX Captain", "X-Layer Whale", "Satoshi Squad", "FPL Champion", 
    "Ether Kick", "Viem Striker", "Gas Saver", "Rainbow Wallet", 
    "MetaMask Pro", "Z-Score Zealot", "Tanh Tactician", "Softmax Striker", 
    "HCLP Staker", "World Cup Wiz", "Goal Getter"
  ];

  const possibleDeposits = [0.125, 0.25, 0.5, 1.0, 2.0, 5.0];
  const competitors: UserState[] = competitorNames.map((name, i) => {
    const hex = i.toString(16);
    const wallet = `0x${hex.padStart(40, '0')}`;
    const depositAmount = possibleDeposits[i % possibleDeposits.length];
    const lockedPrincipal = depositAmount * 0.8;
    return {
      wallet,
      name,
      squad: null,
      history: [],
      onChainState: {
        okbBalance: 100.0 - depositAmount,
        deposited: true,
        withdrawableProfit: 0.0,
        lockedPrincipal
      }
    };
  });

  // Generate valid squads for all competitors
  for (const comp of competitors) {
    comp.squad = generateValidSquad(players);
  }

  // Active countries (all 48 initially)
  const activeCountryIds = countries.map((c: any) => c.id);

  // Standings
  const standings: CountryStanding[] = countries.map((c: any) => ({
    countryId: c.id,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0
  }));

  const state: GameState = {
    currentMatchday: 1,
    epochEnded: false,
    users: competitors,
    matchdayHistory: Array.from({ length: 7 }, (_, idx) => ({
      matchday: idx + 1,
      simulated: false,
      playerStats: {},
      nrpsResult: null,
      activeCountries: idx < 3 ? activeCountryIds : []
    })),
    activeCountries: activeCountryIds,
    standings
  };

  writeState(state);
  return state;
}

// Helper to calculate BPS for a player based on stats
function calculateBPS(player: Player, stats: MatchStats): number {
  let bps = 0;
  bps += stats.minutesPlayed >= 60 ? 6 : stats.minutesPlayed > 0 ? 3 : 0;
  
  if (player.position === 'GK' || player.position === 'DEF') {
    bps += stats.cleanSheet ? 12 : 0;
    bps -= Math.floor(stats.goalsConceded / 2) * 2;
  } else if (player.position === 'MID') {
    bps += stats.cleanSheet ? 6 : 0;
  }

  bps += stats.goals * (player.position === 'FWD' ? 12 : player.position === 'MID' ? 18 : 24);
  bps += stats.assists * 9;
  bps += stats.saves * 2;

  if (stats.yellowCard) bps -= 3;
  if (stats.redCard) bps -= 9;
  bps -= stats.ownGoals * 6;

  return bps;
}

// Simulate Matchday
export function simulateMatchday(state: GameState): GameState {
  const md = state.currentMatchday;
  if (md > 7 || state.epochEnded) {
    throw new Error("Tournament has already ended");
  }

  const seed = getSeedData();
  const players: Player[] = seed.players;
  const countries = seed.countries;
  const activeCountries = [...state.activeCountries];

  // Initialize stats map for all players (default is 0 mins)
  const statsMap: Record<number, MatchStats> = {};
  for (const p of players) {
    statsMap[p.id] = {
      minutesPlayed: 0,
      goals: 0,
      assists: 0,
      cleanSheet: false,
      saves: 0,
      goalsConceded: 0,
      yellowCard: false,
      redCard: false,
      ownGoals: 0,
      bpsBonus: 0
    };
  }

  // 1. Group Countries into Match Pairings
  const pairings: [string, string][] = [];
  
  if (md <= 3) {
    for (let i = 0; i < countries.length; i += 2) {
      pairings.push([countries[i].id, countries[i + 1].id]);
    }
  } else if (md === 4) {
    for (let i = 0; i < 8; i++) {
      pairings.push([activeCountries[i], activeCountries[15 - i]]);
    }
  } else if (md === 5) {
    for (let i = 0; i < 4; i++) {
      pairings.push([activeCountries[i * 2], activeCountries[i * 2 + 1]]);
    }
  } else if (md === 6) {
    pairings.push([activeCountries[0], activeCountries[1]]);
    pairings.push([activeCountries[2], activeCountries[3]]);
  } else if (md === 7) {
    pairings.push([activeCountries[0], activeCountries[1]]);
    pairings.push([activeCountries[2], activeCountries[3]]);
  }

  // 2. Simulate Each Match
  const nextActiveCountries: string[] = [];
  const nextLosers: string[] = [];

  for (const [teamAId, teamBId] of pairings) {
    const teamAPlayers = players.filter(p => p.countryId === teamAId);
    const teamBPlayers = players.filter(p => p.countryId === teamBId);

    const teamARating = teamAPlayers.reduce((sum, p) => sum + p.rating, 0) / (teamAPlayers.length || 1);
    const teamBRating = teamBPlayers.reduce((sum, p) => sum + p.rating, 0) / (teamBPlayers.length || 1);

    let goalsA = Math.floor(Math.random() * 3);
    let goalsB = Math.floor(Math.random() * 3);

    const diff = teamARating - teamBRating;
    if (diff > 5 && Math.random() < 0.4) goalsA++;
    if (diff < -5 && Math.random() < 0.4) goalsB++;

    if (md >= 4 && goalsA === goalsB) {
      if (Math.random() < 0.5) {
        goalsA++;
      } else {
        goalsB++;
      }
    }

    if (goalsA > goalsB) {
      nextActiveCountries.push(teamAId);
      nextLosers.push(teamBId);
    } else if (goalsB > goalsA) {
      nextActiveCountries.push(teamBId);
      nextLosers.push(teamAId);
    } else {
      nextActiveCountries.push(teamAId);
      nextActiveCountries.push(teamBId);
    }

    if (md <= 3) {
      const standingA = state.standings.find(s => s.countryId === teamAId)!;
      const standingB = state.standings.find(s => s.countryId === teamBId)!;

      standingA.goalsFor += goalsA;
      standingA.goalsAgainst += goalsB;
      standingB.goalsFor += goalsB;
      standingB.goalsAgainst += goalsA;

      if (goalsA > goalsB) {
        standingA.wins++;
        standingA.points += 3;
        standingB.losses++;
      } else if (goalsB > goalsA) {
        standingB.wins++;
        standingB.points += 3;
        standingA.losses++;
      } else {
        standingA.draws++;
        standingA.points += 1;
        standingB.draws++;
        standingB.points += 1;
      }
    }

    for (const p of teamAPlayers) {
      statsMap[p.id].minutesPlayed = 90;
      statsMap[p.id].cleanSheet = goalsB === 0;
      statsMap[p.id].goalsConceded = goalsB;
      statsMap[p.id].saves = p.position === 'GK' ? goalsB + Math.floor(Math.random() * 4) : 0;
      statsMap[p.id].yellowCard = Math.random() < 0.12;
      statsMap[p.id].redCard = Math.random() < 0.015;
      statsMap[p.id].ownGoals = Math.random() < 0.005 ? 1 : 0;
    }

    for (const p of teamBPlayers) {
      statsMap[p.id].minutesPlayed = 90;
      statsMap[p.id].cleanSheet = goalsA === 0;
      statsMap[p.id].goalsConceded = goalsA;
      statsMap[p.id].saves = p.position === 'GK' ? goalsA + Math.floor(Math.random() * 4) : 0;
      statsMap[p.id].yellowCard = Math.random() < 0.12;
      statsMap[p.id].redCard = Math.random() < 0.015;
      statsMap[p.id].ownGoals = Math.random() < 0.005 ? 1 : 0;
    }

    allocateGoalsAndAssists(teamAPlayers, goalsA, statsMap);
    allocateGoalsAndAssists(teamBPlayers, goalsB, statsMap);

    const matchPlayers = [...teamAPlayers, ...teamBPlayers];
    const playerBpsScores = matchPlayers.map(p => ({
      id: p.id,
      bps: calculateBPS(p, statsMap[p.id])
    }));
    playerBpsScores.sort((a, b) => b.bps - a.bps);

    if (playerBpsScores.length > 0) statsMap[playerBpsScores[0].id].bpsBonus = 3;
    if (playerBpsScores.length > 1) statsMap[playerBpsScores[1].id].bpsBonus = 2;
    if (playerBpsScores.length > 2) statsMap[playerBpsScores[2].id].bpsBonus = 1;
  }

  let activeCountryIds: string[] = [];
  if (md < 3) {
    activeCountryIds = state.activeCountries;
  } else if (md === 3) {
    const sortedStandings = [...state.standings].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      const gdB = b.goalsFor - b.goalsAgainst;
      const gdA = a.goalsFor - a.goalsAgainst;
      if (gdB !== gdA) return gdB - gdA;
      return b.goalsFor - a.goalsFor;
    });
    activeCountryIds = sortedStandings.slice(0, 16).map(s => s.countryId);
  } else if (md === 4) {
    activeCountryIds = nextActiveCountries;
  } else if (md === 5) {
    activeCountryIds = nextActiveCountries;
  } else if (md === 6) {
    activeCountryIds = [...nextActiveCountries, ...nextLosers];
  } else if (md === 7) {
    activeCountryIds = [];
  }

  // 4. Calculate Scores for Registered Users
  const userPerformances = state.users.map(u => {
    let score = 0;
    if (u.squad) {
      const scoreResult = calculateTeamScore(u.squad, players, statsMap);
      score = scoreResult.totalScore;
    }
    const lockedAmount = u.onChainState.lockedPrincipal;
    const matchdayFee = (u.onChainState.lockedPrincipal * 0.25) / 7.0;
    return {
      userId: u.wallet,
      score,
      lockedAmount,
      matchdayFee
    };
  });

  // 5. Calculate NRPS redistribution
  const poolSize = state.users.reduce((sum, u) => sum + u.onChainState.lockedPrincipal * 0.25, 0);
  const nrpsResult = calculateNRPS(userPerformances, poolSize, 1.0);

  // Update histories and withdrawableProfit of users
  for (const u of state.users) {
    const userPerformance = nrpsResult.userResults.find(r => r.userId === u.wallet)!;
    u.history.push({
      matchday: md,
      score: userPerformance.score,
      reward: userPerformance.reward,
      netProfit: userPerformance.netProfit
    });

    // Keep mock on-chain state synchronized
    if (u.onChainState) {
      if (userPerformance.netProfit >= 0) {
        u.onChainState.withdrawableProfit += userPerformance.netProfit;
      } else {
        const loss = -userPerformance.netProfit;
        if (u.onChainState.withdrawableProfit >= loss) {
          u.onChainState.withdrawableProfit -= loss;
        } else {
          u.onChainState.withdrawableProfit = 0;
        }
      }
    }
  }

  // 6. Record history for this matchday
  const historyItem = state.matchdayHistory.find(h => h.matchday === md)!;
  historyItem.simulated = true;
  historyItem.playerStats = statsMap;
  historyItem.nrpsResult = nrpsResult;
  historyItem.activeCountries = state.activeCountries;

  // Update game state
  state.currentMatchday = md + 1;
  state.activeCountries = activeCountryIds;
  if (state.currentMatchday > 7) {
    state.epochEnded = true;
  }

  writeState(state);
  return state;
}

// Allocates goals and assists to players randomly but logically
function allocateGoalsAndAssists(teamPlayers: Player[], goals: number, statsMap: Record<number, MatchStats>) {
  if (goals === 0) return;

  const outfieldPlayers = teamPlayers.filter(p => p.position !== 'GK');
  if (outfieldPlayers.length === 0) return;

  const scorerPool: Player[] = [];
  for (const p of outfieldPlayers) {
    const weight = p.position === 'FWD' ? 7 : p.position === 'MID' ? 4 : 1;
    for (let w = 0; w < weight; w++) {
      scorerPool.push(p);
    }
  }

  const assistPool: Player[] = [];
  for (const p of outfieldPlayers) {
    const weight = p.position === 'MID' ? 7 : p.position === 'FWD' ? 4 : 2;
    for (let w = 0; w < weight; w++) {
      assistPool.push(p);
    }
  }

  for (let g = 0; g < goals; g++) {
    const scorer = scorerPool[Math.floor(Math.random() * scorerPool.length)];
    statsMap[scorer.id].goals++;

    if (Math.random() < 0.70) {
      const eligibleAssistPlayers = assistPool.filter(p => p.id !== scorer.id);
      if (eligibleAssistPlayers.length > 0) {
        const assister = eligibleAssistPlayers[Math.floor(Math.random() * eligibleAssistPlayers.length)];
        statsMap[assister.id].assists++;
      }
    }
  }
}

// ==========================================
// MOCK BLOCKCHAIN OPERATIONS
// ==========================================

export function getOrCreateMockUser(walletAddress: string): UserState {
  const state = readState();
  let user = state.users.find(u => u.wallet.toLowerCase() === walletAddress.toLowerCase());
  
  if (!user) {
    user = {
      wallet: walletAddress.toLowerCase(),
      name: "User",
      squad: null,
      history: [],
      onChainState: {
        okbBalance: 100.0, // Start with 100 OKB mock balance
        deposited: false,
        withdrawableProfit: 0.0,
        lockedPrincipal: 0.0
      }
    };
    state.users.push(user);
    writeState(state);
  }
  return user;
}

export function executeMockAction(walletAddress: string, action: string, amount?: number): GameState {
  const state = readState();
  const user = state.users.find(u => u.wallet.toLowerCase() === walletAddress.toLowerCase()) || {
    wallet: walletAddress.toLowerCase(),
    name: "User",
    squad: null,
    history: [],
    onChainState: { okbBalance: 100.0, deposited: false, withdrawableProfit: 0.0, lockedPrincipal: 0.0 }
  };

  // If user wasn't in state, push it
  if (!state.users.some(u => u.wallet.toLowerCase() === walletAddress.toLowerCase())) {
    state.users.push(user);
  }

  if (action === "faucet") {
    user.onChainState.okbBalance += 100.0;
  } else if (action === "deposit") {
    const depositAmount = amount || 10.0;
    if (user.onChainState.okbBalance < depositAmount) {
      throw new Error(`Insufficient OKB balance. Need ${depositAmount} OKB.`);
    }
    if (depositAmount < 0.125) {
      throw new Error("Minimum deposit is 0.125 OKB ($10 equivalent).");
    }
    if (user.onChainState.deposited) {
      throw new Error("Already deposited.");
    }
    user.onChainState.okbBalance -= depositAmount;
    user.onChainState.deposited = true;
    user.onChainState.lockedPrincipal = depositAmount * 0.8;
  } else if (action === "withdrawProfit") {
    const withdrawAmount = amount || 0;
    if (withdrawAmount < 0.0625) {
      throw new Error("Below minimum withdrawal limit (0.0625 OKB)");
    }
    if (user.onChainState.withdrawableProfit < withdrawAmount) {
      throw new Error("Insufficient withdrawable profit balance");
    }
    user.onChainState.withdrawableProfit -= withdrawAmount;
    user.onChainState.okbBalance += withdrawAmount;
  } else if (action === "withdrawPrincipal") {
    if (!state.epochEnded) {
      throw new Error("Epoch has not ended yet");
    }
    if (user.onChainState.lockedPrincipal <= 0) {
      throw new Error("No principal to withdraw");
    }
    user.onChainState.okbBalance += user.onChainState.lockedPrincipal;
    user.onChainState.lockedPrincipal = 0.0;
  } else {
    throw new Error("Unknown mock action: " + action);
  }

  writeState(state);
  return state;
}

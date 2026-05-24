import fs from 'fs';
import path from 'path';
import { calculateTeamScore, Player, MatchStats, Squad } from './src/utils/fplScoring';
import { calculateNRPS, UserPerformance } from './src/utils/nrpsEngine';

// Load seed data
const seedDataPath = path.join(__dirname, 'src', 'data', 'seedData.json');
const seedData = JSON.parse(fs.readFileSync(seedDataPath, 'utf8'));
const players: Player[] = seedData.players;

console.log(`Loaded ${players.length} players from seed data.`);

// 1. Define a Mock Squad
// Starters (11):
// GK: Alisson (8)
// DEF: Marquinhos (7), Saliba (11), Ruediger (20), Bastoni (25) -> 4 DEFs
// MID: Mac Allister (3), Bellingham (12), Saka (14), Musiala (19) -> 4 MIDs
// FWD: Messi (1), Mbappe (9) -> 2 FWDs
// Total starters = 11 (Formation: 1-4-4-2 -> Valid!)
const starters = [8, 7, 11, 20, 25, 3, 12, 14, 19, 1, 9];

// Subs (4):
// Sub 0 (GK): Emiliano Martinez (4)
// Sub 1 (FWD): Lautaro Martinez (2)
// Sub 2 (MID): Florian Wirtz (18)
// Sub 3 (DEF): Dani Carvajal (17)
const subs = [4, 2, 18, 17];

const squad: Squad = {
  starters,
  subs,
  captainId: 1,      // Messi
  viceCaptainId: 12,  // Bellingham
};

// 2. Mock Match Statistics
const statsMap: Record<number, MatchStats> = {
  // Alisson (GK) - Played 90m, clean sheet, 3 saves -> 2 + 4 + 1 = 7 pts
  8: { minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: true, saves: 3, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Marquinhos (DEF) - Played 90m, clean sheet -> 2 + 4 = 6 pts
  7: { minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: true, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Saliba (DEF) - Played 90m, clean sheet, 1 assist -> 2 + 4 + 3 = 9 pts
  11: { minutesPlayed: 90, goals: 0, assists: 1, cleanSheet: true, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Ruediger (DEF) - Played 90m, clean sheet -> 2 + 4 = 6 pts
  20: { minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: true, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Bastoni (DEF) - Played 90m, clean sheet -> 2 + 4 = 6 pts
  25: { minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: true, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Mac Allister (MID) - Played 90m, 1 goal -> 2 + 5 = 7 pts
  3: { minutesPlayed: 90, goals: 1, assists: 0, cleanSheet: false, saves: 0, goalsConceded: 1, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Bellingham (MID) - Played 90m, 1 assist, yellow card -> 2 + 3 - 1 = 4 pts (Vice-captain)
  12: { minutesPlayed: 90, goals: 0, assists: 1, cleanSheet: false, saves: 0, goalsConceded: 1, yellowCard: true, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Saka (MID) - Played 90m, 1 goal, 1 assist -> 2 + 5 + 3 = 10 pts
  14: { minutesPlayed: 90, goals: 1, assists: 1, cleanSheet: false, saves: 0, goalsConceded: 1, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 1 },
  // Musiala (MID) - Played 90m -> 2 pts
  19: { minutesPlayed: 90, goals: 0, assists: 0, cleanSheet: false, saves: 0, goalsConceded: 1, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Messi (FWD) - Played 0m -> 0 pts (Captain) - Should trigger captaincy pass to Bellingham & auto-sub
  1: { minutesPlayed: 0, goals: 0, assists: 0, cleanSheet: false, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Mbappe (FWD) - Played 90m, 1 goal -> 2 + 4 = 6 pts
  9: { minutesPlayed: 90, goals: 1, assists: 0, cleanSheet: false, saves: 0, goalsConceded: 1, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },

  // Sub 0 (GK): E. Martinez - Did not play
  4: { minutesPlayed: 0, goals: 0, assists: 0, cleanSheet: false, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Sub 1 (FWD): Lautaro Martinez - Played 60m, 1 goal -> 2 + 4 = 6 pts (Should sub in for Messi as FWD)
  2: { minutesPlayed: 60, goals: 1, assists: 0, cleanSheet: false, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Sub 2 (MID): Florian Wirtz - Played 90m, 1 assist -> 2 + 3 = 5 pts
  18: { minutesPlayed: 90, goals: 0, assists: 1, cleanSheet: false, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 },
  // Sub 3 (DEF): Dani Carvajal - Did not play
  17: { minutesPlayed: 0, goals: 0, assists: 0, cleanSheet: false, saves: 0, goalsConceded: 0, yellowCard: false, redCard: false, ownGoals: 0, bpsBonus: 0 }
};

console.log("\n--- RUNNING FPL SCORING & AUTO-SUB TESTING ---");

const result = calculateTeamScore(squad, players, statsMap);

console.log(`Active Captain ID: ${result.activeCaptainId} (Expected: 12 - Jude Bellingham because Messi played 0m)`);
console.log("Substitutions Made:");
result.substitutionsMade.forEach(sub => {
  const playerOut = players.find(p => p.id === sub.out)?.name;
  const playerIn = players.find(p => p.id === sub.in)?.name;
  console.log(`  - OUT: ${playerOut} (ID: ${sub.out}) | IN: ${playerIn} (ID: ${sub.in})`);
});
console.log("Individual Player Scores (in Final Lineup):");
Object.entries(result.playerScores).forEach(([idStr, score]) => {
  const id = Number(idStr);
  const p = players.find(player => player.id === id);
  console.log(`  - ${p?.name} (${p?.position}): Base ${score.basePoints} * Multiplier ${score.multiplier} = Final ${score.finalPoints} pts`);
});
console.log(`Total Team Score: ${result.totalScore} pts`);

// Expected Math:
// Alisson: 7
// Marquinhos: 6
// Saliba: 9
// Ruediger: 6
// Bastoni: 6
// Mac Allister: 7
// Bellingham (C): 4 * 2 = 8
// Saka: 11
// Musiala: 2
// Mbappe: 6
// Lautaro Martinez (subbed in for Messi): 6
// Total = 7 + 6 + 9 + 6 + 6 + 7 + 8 + 11 + 2 + 6 + 6 = 74 points.
console.log(`Is Total Score 74? ${result.totalScore === 74 ? 'YES' : 'NO'}`);

console.log("\n--- RUNNING NRPS ECONOMY TESTING ---");

const performances: UserPerformance[] = [
  { userId: "User_A", score: 74 }, // Our user
  { userId: "User_B", score: 60 },
  { userId: "User_C", score: 45 },
  { userId: "User_D", score: 55 }
];

const poolSize = 10.0; // $10 matchday prize pool
const nrpsResult = calculateNRPS(performances, poolSize);

console.log(`Population Mean (mu): ${nrpsResult.mean.toFixed(4)}`);
console.log(`Population StdDev (sigma): ${nrpsResult.stdDev.toFixed(4)}`);
console.log("NRPS Distribution Results:");
let sumWeights = 0;
let sumRewards = 0;
nrpsResult.userResults.forEach(r => {
  sumWeights += r.weight;
  sumRewards += r.reward;
  console.log(`  - ${r.userId}: Raw Score = ${r.score} | Z = ${r.zScore.toFixed(3)} | R_u = ${r.compressedRating.toFixed(3)} | Weight = ${(r.weight * 100).toFixed(2)}% | Reward = $${r.reward.toFixed(4)} | Net Profit = $${r.netProfit.toFixed(4)}`);
});

console.log(`Sum of weights = ${sumWeights.toFixed(4)} (Expected: 1.0)`);
console.log(`Sum of rewards = $${sumRewards.toFixed(4)} (Expected: $10.0)`);

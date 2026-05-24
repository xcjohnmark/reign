export interface UserPerformance {
  userId: string;
  score: number;
}

export interface NRPSUserResult {
  userId: string;
  score: number;
  zScore: number;
  compressedRating: number; // R_u
  weight: number;           // w_u
  reward: number;           // reward_u
  netProfit: number;        // profit_u (reward_u - matchday_fee)
}

export interface NRPSEngineResult {
  mean: number;
  stdDev: number;
  totalPool: number;
  userResults: NRPSUserResult[];
}

/**
 * Executes the Normalized Relative Performance System (NRPS) math.
 * Redistributes a matchday's prize pool relative to user performance.
 *
 * @param performances Array of user IDs and their fantasy scores for the matchday.
 * @param poolSize The total prize pool (Pool_t) to distribute for this matchday.
 * @param beta The sensitivity parameter for tanh compression (default 1.0).
 * @param matchdayFee The entry fee cost allocated for this specific matchday (default 2.0 / 7).
 */
export function calculateNRPS(
  performances: UserPerformance[],
  poolSize: number,
  beta: number = 1.0,
  matchdayFee: number = 2.0 / 7.0
): NRPSEngineResult {
  const N = performances.length;

  if (N === 0) {
    return { mean: 0, stdDev: 0, totalPool: poolSize, userResults: [] };
  }

  // 1. Calculate Global Population Mean (mu)
  const totalScore = performances.reduce((sum, u) => sum + u.score, 0);
  const mean = totalScore / N;

  // 2. Calculate Global Population Standard Deviation (sigma)
  let varianceSum = 0;
  for (const u of performances) {
    varianceSum += Math.pow(u.score - mean, 2);
  }
  const stdDev = N > 1 ? Math.sqrt(varianceSum / N) : 0;

  // 3. Calculate Z-scores and Compressed Ratings (R_u = tanh(beta * Z_u))
  const zScores: number[] = [];
  const compressedRatings: number[] = [];

  for (const u of performances) {
    // If standard deviation is 0 (all users got same score), Z-score is 0
    const z = stdDev > 0 ? (u.score - mean) / stdDev : 0;
    const r = Math.tanh(beta * z);
    zScores.push(z);
    compressedRatings.push(r);
  }

  // 4. Calculate Softmax Weights (w_u = e^(R_u) / sum(e^(R_j)))
  const expRatings = compressedRatings.map(r => Math.exp(r));
  const sumExpRatings = expRatings.reduce((sum, val) => sum + val, 0);
  const weights = expRatings.map(exp => (sumExpRatings > 0 ? exp / sumExpRatings : 1 / N));

  // 5. Calculate Rewards and Net Profits
  const userResults: NRPSUserResult[] = performances.map((u, i) => {
    const weight = weights[i];
    const reward = weight * poolSize;
    const netProfit = reward - matchdayFee;

    return {
      userId: u.userId,
      score: u.score,
      zScore: zScores[i],
      compressedRating: compressedRatings[i],
      weight,
      reward,
      netProfit
    };
  });

  return {
    mean,
    stdDev,
    totalPool: poolSize,
    userResults
  };
}

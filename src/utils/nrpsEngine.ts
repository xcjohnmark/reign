export interface UserPerformance {
  userId: string;
  score: number;
  lockedAmount: number; // The user's locked principal
  matchdayFee: number;  // The user's individual matchday fee
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
 * Redistributes a matchday's prize pool relative to weighted user performance.
 *
 * @param performances Array of user performances containing scores, lockedAmounts, and individual matchdayFees.
 * @param poolSize The total prize pool (Pool_t) to distribute for this matchday.
 * @param beta The sensitivity parameter for tanh compression (default 1.0).
 */
export function calculateNRPS(
  performances: UserPerformance[],
  poolSize: number,
  beta: number = 1.0
): NRPSEngineResult {
  const N = performances.length;

  if (N === 0) {
    return { mean: 0, stdDev: 0, totalPool: poolSize, userResults: [] };
  }

  // 1. Calculate userWeight = score * lockedAmount / totalLockedAmount
  const totalLockedAmount = performances.reduce((sum, p) => sum + p.lockedAmount, 0) || 1.0;
  const weightedPerformances = performances.map(p => {
    const userWeight = (p.score * p.lockedAmount) / totalLockedAmount;
    return {
      ...p,
      userWeight
    };
  });

  // 2. Calculate Global Population Mean of userWeight (mu)
  const totalWeight = weightedPerformances.reduce((sum, wp) => sum + wp.userWeight, 0);
  const mean = totalWeight / N;

  // 3. Calculate Global Population Standard Deviation of userWeight (sigma)
  let varianceSum = 0;
  for (const wp of weightedPerformances) {
    varianceSum += Math.pow(wp.userWeight - mean, 2);
  }
  const stdDev = N > 1 ? Math.sqrt(varianceSum / N) : 0;

  // 4. Calculate Z-scores and Compressed Ratings (R_u = tanh(beta * Z_u))
  const zScores: number[] = [];
  const compressedRatings: number[] = [];

  for (const wp of weightedPerformances) {
    // If standard deviation is 0 (all users got same weight), Z-score is 0
    const z = stdDev > 0 ? (wp.userWeight - mean) / stdDev : 0;
    const r = Math.tanh(beta * z);
    zScores.push(z);
    compressedRatings.push(r);
  }

  // 5. Calculate Softmax Weights (w_u = e^(R_u) / sum(e^(R_j)))
  const expRatings = compressedRatings.map(r => Math.exp(r));
  const sumExpRatings = expRatings.reduce((sum, val) => sum + val, 0);
  const weights = expRatings.map(exp => (sumExpRatings > 0 ? exp / sumExpRatings : 1 / N));

  // 6. Calculate Rewards and Net Profits
  const userResults: NRPSUserResult[] = weightedPerformances.map((wp, i) => {
    const weight = weights[i];
    const reward = weight * poolSize;
    const netProfit = reward - wp.matchdayFee;

    return {
      userId: wp.userId,
      score: wp.score,
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

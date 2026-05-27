export interface Player {
  id: number;
  name: string;
  countryId: string;
  position: 'GK' | 'DEF' | 'MID' | 'FWD';
  price: number;
  rating: number;
  espnId?: number;
}

export interface MatchStats {
  minutesPlayed: number;
  goals: number;
  assists: number;
  cleanSheet: boolean;
  saves: number;
  goalsConceded: number;
  yellowCard: boolean;
  redCard: boolean;
  ownGoals: number;
  bpsBonus: number; // 0, 1, 2, or 3 points
}

export interface Squad {
  starters: (number | null)[]; // Array of 11 player IDs (or null for empty slots)
  subs: (number | null)[];     // Array of 4 player IDs (or null for empty slots)
  captainId: number | null;
  viceCaptainId: number | null;
  formation?: string;
}

/**
 * Calculates FPL points for a single player based on their match statistics and position.
 */
export function calculatePlayerPoints(position: 'GK' | 'DEF' | 'MID' | 'FWD', stats: MatchStats): number {
  if (stats.minutesPlayed === 0) {
    return 0;
  }

  let points = 0;

  // 1. Playtime / Appearance points
  if (stats.minutesPlayed >= 60) {
    points += 2;
  } else if (stats.minutesPlayed > 0) {
    points += 1;
  }

  // 2. Attacking returns (Goals & Assists)
  points += stats.assists * 3;

  if (stats.goals > 0) {
    if (position === 'GK' || position === 'DEF') {
      points += stats.goals * 6;
    } else if (position === 'MID') {
      points += stats.goals * 5;
    } else if (position === 'FWD') {
      points += stats.goals * 4;
    }
  }

  // 3. Defensive returns
  // Clean sheets (only if played 60+ minutes)
  if (stats.cleanSheet && stats.minutesPlayed >= 60) {
    if (position === 'GK' || position === 'DEF') {
      points += 4;
    } else if (position === 'MID') {
      points += 1;
    }
  }

  // Saves (Goalkeepers only)
  if (position === 'GK' && stats.saves > 0) {
    points += Math.floor(stats.saves / 3);
  }

  // Goals conceded deductions (GK and DEF only)
  if ((position === 'GK' || position === 'DEF') && stats.goalsConceded >= 2) {
    points -= Math.floor(stats.goalsConceded / 2);
  }

  // 4. Negative actions
  if (stats.yellowCard) points -= 1;
  if (stats.redCard) points -= 3;
  points -= stats.ownGoals * 2;

  // 5. BPS Bonus
  points += stats.bpsBonus;

  return points;
}

/**
 * Validates whether a given 11-player starting lineup conforms to FPL formation rules:
 * - Exactly 1 Goalkeeper (GK)
 * - At least 3 Defenders (DEF)
 * - At least 1 Forward (FWD)
 */
export function isValidFormation(players: Player[]): boolean {
  if (players.length !== 11) return false;

  const gkCount = players.filter(p => p.position === 'GK').length;
  const defCount = players.filter(p => p.position === 'DEF').length;
  const fwdCount = players.filter(p => p.position === 'FWD').length;

  return gkCount === 1 && defCount >= 3 && fwdCount >= 1;
}

export interface AutoSubResult {
  finalStarters: Player[];
  finalSubs: Player[];
  substitutionsMade: { out: Player; in: Player }[];
}

/**
 * Runs the FPL auto-substitution logic.
 * If starting players played 0 minutes, they are replaced by eligible benched players
 * in order of priority (left-to-right), ensuring formation validity.
 */
export function performAutoSubstitutions(
  starters: Player[],
  subs: Player[],
  statsMap: Record<number, MatchStats>
): AutoSubResult {
  const finalStarters = [...starters];
  const finalSubs = [...subs];
  const substitutionsMade: { out: Player; in: Player }[] = [];

  // 1. Identify starting GK and bench GK
  const startingGkIndex = finalStarters.findIndex(p => p.position === 'GK');
  const startingGk = startingGkIndex !== -1 ? finalStarters[startingGkIndex] : null;
  const startingGkStats = (startingGk && statsMap[startingGk.id]) || { minutesPlayed: 0 };

  // If starting GK played 0 minutes (or is missing), look for the bench GK
  if (!startingGk || startingGkStats.minutesPlayed === 0) {
    const benchGkIndex = finalSubs.findIndex(p => p.position === 'GK');
    if (benchGkIndex !== -1) {
      const benchGk = finalSubs[benchGkIndex];
      const benchGkStats = statsMap[benchGk.id] || { minutesPlayed: 0 };

      if (benchGkStats.minutesPlayed > 0) {
        // Swap goalkeeper
        if (startingGkIndex !== -1) {
          finalStarters[startingGkIndex] = benchGk;
          finalSubs[benchGkIndex] = startingGk!;
          if (startingGk) {
            substitutionsMade.push({ out: startingGk, in: benchGk });
          }
        } else {
          finalStarters.push(benchGk);
          finalSubs.splice(benchGkIndex, 1);
        }
      }
    }
  }

  // 2. Identify outfield starters who played 0 minutes
  // We process them one by one.
  let outfieldStartersToReplace = finalStarters.filter(p => p.position !== 'GK' && (statsMap[p.id]?.minutesPlayed || 0) === 0);

  for (const starterToReplace of outfieldStartersToReplace) {
    // Find the index of this starter in our current starting lineup
    const starterIdxInLineup = finalStarters.findIndex(p => p.id === starterToReplace.id);
    if (starterIdxInLineup === -1) continue;

    // Find the first outfield sub on the bench (left-to-right) who played > 0 mins
    let subFound = false;

    for (let i = 0; i < finalSubs.length; i++) {
      const sub = finalSubs[i];
      if (sub.position === 'GK') continue; // Goalkeeper cannot replace outfield

      const subStats = statsMap[sub.id] || { minutesPlayed: 0 };
      if (subStats.minutesPlayed > 0) {
        // Propose substitution: replace starterToReplace with sub
        const proposedStarters = [...finalStarters];
        proposedStarters[starterIdxInLineup] = sub;

        // Check if formation remains valid (e.g. at least 3 defenders, 1 forward)
        if (isValidFormation(proposedStarters)) {
          // Commit the swap
          finalStarters[starterIdxInLineup] = sub;
          finalSubs[i] = starterToReplace;
          substitutionsMade.push({ out: starterToReplace, in: sub });
          subFound = true;
          break; // Move to the next starter to replace
        }
      }
    }
  }

  return {
    finalStarters,
    finalSubs,
    substitutionsMade
  };
}

export interface TeamScoreResult {
  playerScores: Record<number, { basePoints: number; multiplier: number; finalPoints: number }>;
  totalScore: number;
  substitutionsMade: { out: number; in: number }[];
  activeCaptainId: number;
}

/**
 * Calculates the total score for a team, resolving captaincy and running auto-subs.
 */
export function calculateTeamScore(
  squad: Squad,
  allPlayers: Player[],
  statsMap: Record<number, MatchStats>
): TeamScoreResult {
  const playerMap = new Map(allPlayers.map(p => [p.id, p]));

  const starterPlayers = squad.starters.map(id => id ? playerMap.get(id) : null).filter((p): p is Player => !!p);
  const subPlayers = squad.subs.map(id => id ? playerMap.get(id) : null).filter((p): p is Player => !!p);

  // Run auto-substitutions
  const { finalStarters, substitutionsMade } = performAutoSubstitutions(starterPlayers, subPlayers, statsMap);

  // Resolve captain and vice-captain
  let activeCaptainId = squad.captainId || 0;
  const captainStats = (squad.captainId && statsMap[squad.captainId]) || { minutesPlayed: 0 };

  if (captainStats.minutesPlayed === 0) {
    const viceCaptainStats = (squad.viceCaptainId && statsMap[squad.viceCaptainId]) || { minutesPlayed: 0 };
    if (viceCaptainStats.minutesPlayed > 0) {
      activeCaptainId = squad.viceCaptainId || 0;
    }
  }

  const playerScores: Record<number, { basePoints: number; multiplier: number; finalPoints: number }> = {};
  let totalScore = 0;

  // Calculate points for the final starting XI
  for (const player of finalStarters) {
    const stats = statsMap[player.id] || {
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

    const basePoints = calculatePlayerPoints(player.position, stats);
    const multiplier = player.id === activeCaptainId ? 2 : 1;
    const finalPoints = basePoints * multiplier;

    playerScores[player.id] = { basePoints, multiplier, finalPoints };
    totalScore += finalPoints;
  }

  // Calculate points for final bench players (no double points, not added to total score unless subbed, but we display them)
  const finalStartersSet = new Set(finalStarters.map(p => p.id));
  for (const player of subPlayers) {
    // If they were not subbed in, their scores are calculated as sub (and do not add to total)
    if (!finalStartersSet.has(player.id)) {
      const stats = statsMap[player.id] || {
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
      const basePoints = calculatePlayerPoints(player.position, stats);
      playerScores[player.id] = { basePoints, multiplier: 0, finalPoints: 0 };
    }
  }

  return {
    playerScores,
    totalScore,
    substitutionsMade: substitutionsMade.map(s => ({ out: s.out.id, in: s.in.id })),
    activeCaptainId
  };
}

export function getFormationPositions(formation?: string): ('GK' | 'DEF' | 'MID' | 'FWD')[] {
  const form = formation || '4-4-2';
  switch (form) {
    case '4-3-3':
      return ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];
    case '3-5-2':
      return ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD'];
    case '4-2-3-1':
      return ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'FWD'];
    case '3-4-3':
      return ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD', 'FWD'];
    case '5-3-2':
      return ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'FWD', 'FWD'];
    case '5-4-1':
      return ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD'];
    case '4-4-2':
    default:
      return ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'FWD', 'FWD'];
  }
}

/**
 * Returns the maximum number of players allowed from the same country based on the matchday.
 */
export function getMaxPlayersPerCountry(matchday: number): number {
  if (matchday <= 4) return 3; // MD 1-3 Groups, MD 4 Round of 16
  if (matchday === 5) return 4; // MD 5 Quarter-finals
  if (matchday === 6) return 6; // MD 6 Semi-finals
  return 10; // MD 7 Finals (future-proof ceiling of 10)
}

/**
 * Returns the maximum squad budget allowed based on the matchday.
 */
export function getMaxBudget(matchday: number): number {
  return 100.0; // Option A: Keep budget strictly at $100.0M for all matchdays
}


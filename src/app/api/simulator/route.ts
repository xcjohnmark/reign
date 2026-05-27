import { NextRequest, NextResponse } from "next/server";
import { readState, writeState, initializeState, simulateMatchday, GameState } from "../../../utils/gameStateHandler";

export async function GET(request: NextRequest) {
  try {
    const state = readState();
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get("wallet");

    let userHistory: any[] = [];
    if (wallet) {
      const user = state.users.find(u => u.wallet.toLowerCase() === wallet.toLowerCase());
      if (user) {
        userHistory = user.history;
      }
    }

    // Generate leaderboard
    const leaderboard = state.users.map(u => {
      const totalScore = u.history.reduce((sum, h) => sum + h.score, 0);
      const totalReward = u.history.reduce((sum, h) => sum + h.reward, 0);
      const totalNetProfit = u.history.reduce((sum, h) => sum + h.netProfit, 0);
      
      const latestHistory = u.history[u.history.length - 1];
      const latestPnL = latestHistory ? latestHistory.netProfit : 0.0;
      const latestScore = latestHistory ? latestHistory.score : 0;

      return {
        wallet: u.wallet,
        name: u.name,
        totalScore,
        totalReward,
        totalNetProfit,
        latestPnL,
        latestScore,
        hasSquad: u.squad !== null,
        lockedCapital: u.onChainState?.lockedPrincipal || 0.0
      };
    });

    // Sort leaderboard by Total Score (descending)
    leaderboard.sort((a, b) => b.totalScore - a.totalScore);

    return NextResponse.json({
      currentMatchday: state.currentMatchday,
      epochEnded: state.epochEnded,
      leaderboard,
      standings: state.standings,
      activeCountries: state.activeCountries,
      matchdayHistory: state.matchdayHistory.filter(h => h.simulated),
      userHistory
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, state: passedState, isStateless } = body;

    // Reset Action
    if (action === "reset") {
      const newState = initializeState(isStateless || passedState !== undefined);
      return NextResponse.json({
        success: true,
        message: "Tournament successfully reset",
        currentMatchday: newState.currentMatchday,
        epochEnded: newState.epochEnded,
        state: newState
      });
    }

    // Default: Simulate current matchday
    let state: GameState = passedState || readState();

    if (state.epochEnded) {
      return NextResponse.json({ error: "Tournament epoch has already ended" }, { status: 400 });
    }

    // Ensure all users have a squad before simulating
    if (state.users.length === 0) {
      return NextResponse.json({ error: "No users registered. Please submit your squad first." }, { status: 400 });
    }

    const currentMd = state.currentMatchday;
    state = simulateMatchday(state, passedState !== undefined);

    // Get the simulated history for the just-completed matchday
    const lastResult = state.matchdayHistory.find(h => h.matchday === currentMd)!;

    // Prepare transaction payload for ReignPool.settleMatchday
    const settleAddresses: string[] = [];
    const settleProfitsOrLosses: string[] = []; // scaled to 18 decimals, as strings

    if (lastResult.nrpsResult) {
      for (const res of lastResult.nrpsResult.userResults) {
        settleAddresses.push(res.userId);
        settleProfitsOrLosses.push(scaleTo18Decimals(res.netProfit));
      }
    }

    return NextResponse.json({
      success: true,
      simulatedMatchday: currentMd,
      nextMatchday: state.currentMatchday,
      epochEnded: state.epochEnded,
      playerStats: lastResult.playerStats,
      nrpsResult: lastResult.nrpsResult,
      matches: lastResult.matches,
      eliminatedCountries: lastResult.eliminatedCountries,
      settlePayload: {
        users: settleAddresses,
        profitsOrLosses: settleProfitsOrLosses
      },
      state
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Scales net profit (dollars) to 18-decimal wei string
function scaleTo18Decimals(amount: number): string {
  const isNegative = amount < 0;
  const absVal = Math.abs(amount);
  // Scale with 6 decimal places of precision, then pad with 12 zeros to make 18 decimals
  const scaled = BigInt(Math.round(absVal * 1e6)) * (BigInt(10) ** BigInt(12));
  return (isNegative ? -scaled : scaled).toString();
}

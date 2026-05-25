import { NextRequest, NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { Player, isValidFormation } from "../../../utils/fplScoring";
import { readState, writeState, getSeedData } from "../../../utils/gameStateHandler";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    const state = readState();
    const user = state.users.find(u => u.wallet.toLowerCase() === wallet.toLowerCase());

    return NextResponse.json({
      squad: user ? user.squad : null,
      currentMatchday: state.currentMatchday,
      epochEnded: state.epochEnded
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, squad, signature, message } = body;

    if (!walletAddress || !squad || !signature || !message) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    // 1. Verify Wallet Signature using Viem
    let recoveredAddress: string;
    if (signature.startsWith("0xmock_")) {
      recoveredAddress = walletAddress;
    } else {
      try {
        recoveredAddress = await recoverMessageAddress({
          message,
          signature
        });
      } catch (err: any) {
        return NextResponse.json({ error: "Failed to recover signature: " + err.message }, { status: 400 });
      }
    }

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Invalid signature, signer mismatch" }, { status: 401 });
    }

    // 2. Validate Squad Structure & Constraints
    const seed = getSeedData();
    const players: Player[] = seed.players;
    const playerMap = new Map(players.map(p => [p.id, p]));

    const { starters, subs, captainId, viceCaptainId } = squad;

    if (!Array.isArray(starters) || starters.length !== 11) {
      return NextResponse.json({ error: "Starting XI must contain exactly 11 players" }, { status: 400 });
    }

    if (!Array.isArray(subs) || subs.length !== 4) {
      return NextResponse.json({ error: "Bench must contain exactly 4 players" }, { status: 400 });
    }

    const allPlayerIds = [...starters, ...subs];
    const uniqueIds = new Set(allPlayerIds);
    if (uniqueIds.size !== 15) {
      return NextResponse.json({ error: "Squad must contain exactly 15 unique players" }, { status: 400 });
    }

    // Retrieve full player objects
    const starterPlayers: Player[] = [];
    const allSquadPlayers: Player[] = [];

    for (const id of starters) {
      const p = playerMap.get(id);
      if (!p) return NextResponse.json({ error: `Player ID ${id} not found` }, { status: 400 });
      starterPlayers.push(p);
      allSquadPlayers.push(p);
    }

    for (const id of subs) {
      const p = playerMap.get(id);
      if (!p) return NextResponse.json({ error: `Player ID ${id} not found` }, { status: 400 });
      allSquadPlayers.push(p);
    }

    // Validate budget (<= $100M)
    const totalPrice = allSquadPlayers.reduce((sum, p) => sum + p.price, 0);
    if (totalPrice > 100.0) {
      return NextResponse.json({ error: `Squad exceeds $100M budget limit (Total: $${totalPrice.toFixed(1)}M)` }, { status: 400 });
    }

    // Validate country limit (max 3 players from same country)
    const countryCounts: Record<string, number> = {};
    for (const p of allSquadPlayers) {
      countryCounts[p.countryId] = (countryCounts[p.countryId] || 0) + 1;
      if (countryCounts[p.countryId] > 3) {
        return NextResponse.json({ error: `Max 3 players from the same country allowed (${p.countryId} has ${countryCounts[p.countryId]})` }, { status: 400 });
      }
    }

    // Validate starting XI formation rules
    if (!isValidFormation(starterPlayers)) {
      return NextResponse.json({ error: "Starting formation is invalid (Must have exactly 1 GK, at least 3 DEF, at least 1 FWD)" }, { status: 400 });
    }

    // Validate captain/vice-captain
    if (!starters.includes(captainId)) {
      return NextResponse.json({ error: "Captain must be one of the starters" }, { status: 400 });
    }
    if (!starters.includes(viceCaptainId)) {
      return NextResponse.json({ error: "Vice-Captain must be one of the starters" }, { status: 400 });
    }
    if (captainId === viceCaptainId) {
      return NextResponse.json({ error: "Captain and Vice-Captain cannot be the same player" }, { status: 400 });
    }

    // 3. Save/Update in gameState.json
    const state = readState();
    
    // Check if user is already registered (if not, add them, otherwise update)
    let user = state.users.find(u => u.wallet.toLowerCase() === walletAddress.toLowerCase());

    if (!user) {
      user = {
        wallet: walletAddress.toLowerCase(),
        name: "User",
        squad: null,
        history: [],
        onChainState: {
          usdtBalance: 0.0,
          deposited: false,
          withdrawableProfit: 0.0,
          lockedPrincipal: 0.0
        }
      };
      state.users.push(user);
    }

    user.squad = {
      starters,
      subs,
      captainId,
      viceCaptainId
    };

    writeState(state);

    return NextResponse.json({
      success: true,
      message: "Squad successfully saved",
      squad: user.squad
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateMockUser, executeMockAction } from "../../../utils/gameStateHandler";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get("wallet");

    if (!wallet) {
      return NextResponse.json({ error: "Wallet address is required" }, { status: 400 });
    }

    const user = getOrCreateMockUser(wallet);
    return NextResponse.json({
      onChainState: user.onChainState
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { walletAddress, action, amount, state: passedState } = body;

    if (!walletAddress || !action) {
      return NextResponse.json({ error: "walletAddress and action are required" }, { status: 400 });
    }

    const state = executeMockAction(walletAddress, action, amount, passedState);
    const user = state.users.find(u => u.wallet.toLowerCase() === walletAddress.toLowerCase())!;

    return NextResponse.json({
      success: true,
      message: `Mock ${action} action executed successfully`,
      onChainState: user.onChainState,
      state
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

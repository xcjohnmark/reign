import { NextRequest, NextResponse } from "next/server";
import { createWalletClient, http, publicActions } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import fs from "fs";
import path from "path";

const reignPoolAbi = [
  {
    inputs: [
      { name: "users", type: "address[]" },
      { name: "profitsOrLosses", type: "int256[]" }
    ],
    name: "settleMatchday",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

const POOL_ADDRESS = "0x355a3608840657a6e26b493FFbcDac0cCA633c15";
const activeRpc = "https://testrpc.xlayer.tech/terigon";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { users, profitsOrLosses } = body;

    if (!users || !profitsOrLosses) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    // 1. Load Private Key from contracts/.env or process.env
    const envPath = path.join(process.cwd(), "contracts", ".env");
    let privateKey = process.env.PRIVATE_KEY;

    if (!privateKey && fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf8");
      const match = content.match(/PRIVATE_KEY=["']?([^"'\s]+)["']?/);
      if (match) {
        privateKey = match[1];
      }
    }

    if (!privateKey) {
      return NextResponse.json({ error: "Server deployer private key not configured" }, { status: 500 });
    }

    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey as `0x${string}`);

    // 2. Initialize Viem Wallet Client on Server
    const walletClient = createWalletClient({
      account,
      chain: {
        id: 1952,
        name: "X Layer Testnet",
        nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
        rpcUrls: { default: { http: [activeRpc] } }
      },
      transport: http(activeRpc)
    }).extend(publicActions);

    const parsedProfits = profitsOrLosses.map((val: string) => BigInt(val));

    // 3. Write Contract from Server (as Contract Owner)
    const hash = await walletClient.writeContract({
      address: POOL_ADDRESS as `0x${string}`,
      abi: reignPoolAbi,
      functionName: 'settleMatchday',
      args: [users as `0x${string}[]`, parsedProfits]
    });

    return NextResponse.json({
      success: true,
      hash
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

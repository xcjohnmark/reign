'use client';

import React, { useState, useEffect, useRef } from 'react';
import { 
  Coins, Users, Calendar, Play, RotateCcw, AlertTriangle, 
  ShieldCheck, Download, Award, Wallet, ArrowRight, 
  CheckCircle, TrendingUp, Info, LogOut, Eye, Trophy 
} from 'lucide-react';
import seedData from '../data/seedData.json';
import { isValidFormation, Player, getFormationPositions, calculateTeamScore, calculatePlayerPoints, performAutoSubstitutions } from '../utils/fplScoring';

// ABIs for real contract interactions
const mockUsdtAbi = [
  {
    inputs: [
      { name: "account", type: "address" }
    ],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    name: "faucet",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  }
];

const reignPoolAbi = [
  {
    inputs: [
      { name: "user", type: "address" }
    ],
    name: "userDeposits",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { name: "user", type: "address" }
    ],
    name: "withdrawableProfit",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "epochEnded",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { name: "amount", type: "uint256" }
    ],
    name: "withdrawProfit",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [],
    name: "withdrawPrincipal",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
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

// Contract Addresses (Hardhat localhost defaults)
const USDT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const POOL_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";


export default function Dashboard() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'squad' | 'simulator' | 'leaderboard'>('squad');

  // Web3 Connection State
  const [wallet, setWallet] = useState<string>('');
  const [walletType, setWalletType] = useState<'mock' | 'real' | null>(null);
  const [txLoading, setTxLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // On-Chain Balances
  const [balanceOKB, setBalanceOKB] = useState<number>(0);
  const [deposited, setDeposited] = useState<boolean>(false);
  const [withdrawableProfit, setWithdrawableProfit] = useState<number>(0);
  const [lockedPrincipal, setLockedPrincipal] = useState<number>(0);
  const [epochEnded, setEpochEnded] = useState<boolean>(false);

  // Variable Lock / OKX Wallet Integration States (Block 2)
  const [stakeInputAmount, setStakeInputAmount] = useState<string>("0.125");
  const [walletProvider, setWalletProvider] = useState<'okx' | 'metamask'>('okx');
  const [isWrongNetwork, setIsWrongNetwork] = useState<boolean>(false);
  const [chainId, setChainId] = useState<number | null>(null);
  const [showConnectModal, setShowConnectModal] = useState<boolean>(false);

  // Tournament / Simulator State
  const [currentMatchday, setCurrentMatchday] = useState<number>(1);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [leaderboardSortField, setLeaderboardSortField] = useState<'rank' | 'name' | 'locked' | 'latestScore' | 'score' | 'pnl' | 'totalPnl'>('score');
  const [leaderboardSortAsc, setLeaderboardSortAsc] = useState<boolean>(false);
  const [isMyRowVisible, setIsMyRowVisible] = useState<boolean>(true);
  const myRowRef = useRef<HTMLTableRowElement | null>(null);
  const [walletConnecting, setWalletConnecting] = useState<boolean>(false);
  const [networkSwitching, setNetworkSwitching] = useState<boolean>(false);
  const [txAction, setTxAction] = useState<string | null>(null);
  const [standings, setStandings] = useState<any[]>([]);
  const [activeCountries, setActiveCountries] = useState<string[]>([]);
  const [matchdayHistory, setMatchdayHistory] = useState<any[]>([]);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [activeResultsMatchday, setActiveResultsMatchday] = useState<number | null>(null);
  const [userHistory, setUserHistory] = useState<any[]>([]);

  // Squad Builder State
  const [starters, setStarters] = useState<(number | null)[]>(Array(11).fill(null)); // 11 slots
  const [subs, setSubs] = useState<(number | null)[]>(Array(4).fill(null)); // 4 slots
  const [captainId, setCaptainId] = useState<number | null>(null);
  const [viceCaptainId, setViceCaptainId] = useState<number | null>(null);
  const [selectedFormation, setSelectedFormation] = useState<string>('4-4-2');
  const [showValidationModal, setShowValidationModal] = useState<boolean>(false);
  const [squadValidationErrors, setSquadValidationErrors] = useState<string[]>([]);
  const [eliminationNotification, setEliminationNotification] = useState<{
    removedCount: number;
    remainingBudget: number;
  } | null>(null);

  // Market Filters
  const [marketPosition, setMarketPosition] = useState<string>('ALL');
  const [marketSearch, setMarketSearch] = useState<string>('');
  const [marketCountry, setMarketCountry] = useState<string>('ALL');
  const [marketSort, setMarketSort] = useState<'rating' | 'price'>('rating');

  // Modal / Selection states
  const [selectedSlotIndex, setSelectedSlotIndex] = useState<{ type: 'starter' | 'sub'; index: number } | null>(null);

  // Players list
  const allPlayers = seedData.players as Player[];
  const playerMap = new Map(allPlayers.map(p => [p.id, p]));

  // Auto-connect mock wallet if saved
  useEffect(() => {
    const savedWallet = localStorage.getItem('reign_wallet');
    const savedType = localStorage.getItem('reign_wallet_type');
    const savedProvider = localStorage.getItem('reign_wallet_provider');
    if (savedProvider) {
      setWalletProvider(savedProvider as 'okx' | 'metamask');
    }
    if (savedWallet && savedType) {
      setWallet(savedWallet);
      setWalletType(savedType as 'mock' | 'real');
    }
  }, []);

  // Fetch data when wallet connects
  useEffect(() => {
    if (wallet) {
      loadWeb3State();
      loadSquadState();
      loadSimulatorState();
    }
  }, [wallet, walletType]);

  // Listen for accountsChanged and chainChanged on real Web3 wallet
  useEffect(() => {
    if (walletType === 'real') {
      const provider = walletProvider === 'okx' ? (window as any).okxwallet : (window as any).ethereum;
      if (!provider) return;

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          setWallet(accounts[0].toLowerCase());
        } else {
          disconnectWallet();
        }
      };

      const handleChainChanged = (cIdHex: string) => {
        const newChainId = parseInt(cIdHex, 16);
        setChainId(newChainId);
        setIsWrongNetwork(newChainId !== 195);
        loadWeb3State();
      };

      provider.on('accountsChanged', handleAccountsChanged);
      provider.on('chainChanged', handleChainChanged);

      return () => {
        if (provider.removeListener) {
          provider.removeListener('accountsChanged', handleAccountsChanged);
          provider.removeListener('chainChanged', handleChainChanged);
        }
      };
    }
  }, [walletType, walletProvider]);

  // Load general simulator state periodically
  useEffect(() => {
    loadSimulatorState();
  }, [currentMatchday]);

  // --- API / Web3 Integrations ---

  const loadWeb3State = async () => {
    if (!wallet) return;
    if (walletType === 'mock') {
      try {
        const res = await fetch(`/api/web3?wallet=${wallet}`);
        const data = await res.json();
        if (data.onChainState) {
          setBalanceOKB(data.onChainState.okbBalance);
          setDeposited(data.onChainState.deposited);
          setWithdrawableProfit(data.onChainState.withdrawableProfit);
          setLockedPrincipal(data.onChainState.lockedPrincipal);
        }
      } catch (err) {
        console.error("Failed to load mock web3 state", err);
      }
    } else {
      // Real Web3 Mode
      try {
        const { createPublicClient, http, formatEther } = await import('viem');
        
        const provider = walletProvider === 'okx' ? (window as any).okxwallet : (window as any).ethereum;
        if (!provider) return;

        // Check chain ID
        const cIdHex = await provider.request({ method: 'eth_chainId' });
        const currentChainId = parseInt(cIdHex, 16);
        setChainId(currentChainId);
        setIsWrongNetwork(currentChainId !== 195);

        const publicClient = createPublicClient({
          chain: {
            id: 195,
            name: "X Layer Testnet",
            nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
            rpcUrls: { default: { http: ["https://testrpc.xlayer.tech"] } }
          },
          transport: http("https://testrpc.xlayer.tech")
        });

        // 1. Fetch native balance of OKB
        const rawBalance = await provider.request({
          method: 'eth_getBalance',
          params: [wallet, 'latest']
        });
        const balanceVal = BigInt(rawBalance);

        // 2. Fetch ReignPool user deposits
        const depVal = await publicClient.readContract({
          address: POOL_ADDRESS as `0x${string}`,
          abi: reignPoolAbi,
          functionName: 'userDeposits',
          args: [wallet as `0x${string}`]
        }) as bigint;

        // 3. Fetch ReignPool withdrawableProfit
        const profitVal = await publicClient.readContract({
          address: POOL_ADDRESS as `0x${string}`,
          abi: reignPoolAbi,
          functionName: 'withdrawableProfit',
          args: [wallet as `0x${string}`]
        }) as bigint;

        // 4. Fetch epochEnded
        const endVal = await publicClient.readContract({
          address: POOL_ADDRESS as `0x${string}`,
          abi: reignPoolAbi,
          functionName: 'epochEnded'
        }) as boolean;

        setBalanceOKB(parseFloat(formatEther(balanceVal)));
        setDeposited(depVal > 0n);
        setLockedPrincipal(parseFloat(formatEther(depVal)));
        setWithdrawableProfit(parseFloat(formatEther(profitVal)));
        setEpochEnded(endVal);
      } catch (err) {
        console.warn("Real Web3 contracts check failed, make sure local Hardhat node is running", err);
      }
    }
  };

  const switchNetwork = async () => {
    const provider = walletProvider === 'okx' ? (window as any).okxwallet : (window as any).ethereum;
    if (!provider) return;
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0xC3' }], // 195 in hex
      });
      setIsWrongNetwork(false);
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: '0xC3',
                chainName: 'X Layer Testnet',
                nativeCurrency: {
                  name: 'OKB',
                  symbol: 'OKB',
                  decimals: 18,
                },
                rpcUrls: ['https://testrpc.xlayer.tech'],
                blockExplorerUrls: ['https://www.okx.com/explorer/xlayer-testnet'],
              },
            ],
          });
          setIsWrongNetwork(false);
        } catch (addError) {
          console.error("Failed to add X Layer Testnet", addError);
        }
      } else {
        console.error("Failed to switch to X Layer Testnet", switchError);
      }
    }
  };

  const loadSquadState = async () => {
    if (!wallet) return;
    try {
      const res = await fetch(`/api/squad?wallet=${wallet}`);
      const data = await res.json();
      if (data.squad) {
        const { starters: s, subs: b, captainId: cap, viceCaptainId: vice, formation: form } = data.squad;
        const newStarters = s.map((id: number | null) => id || null);
        const newSubs = b.map((id: number | null) => id || null);

        // If we transitioned to a matchday with team elimination (currentMatchday >= 4)
        // and we had a full squad before, check if there are now nulls due to auto-removal
        const hadFullSquad = starters.every(id => id !== null) && subs.every(id => id !== null) && starters.length === 11 && subs.length === 4;
        const hasNullNow = newStarters.includes(null) || newSubs.includes(null);
        
        if (hadFullSquad && hasNullNow) {
          const removedCount = newStarters.filter((id: any) => id === null).length + newSubs.filter((id: any) => id === null).length;
          // Calculate remaining budget
          const newSpent = [...newStarters, ...newSubs].reduce((sum, id) => {
            if (id) {
              const player = playerMap.get(id);
              return sum + (player ? player.price : 0);
            }
            return sum;
          }, 0);
          setEliminationNotification({
            removedCount,
            remainingBudget: 100.0 - newSpent
          });
        }

        setStarters(newStarters);
        setSubs(newSubs);
        setCaptainId(cap);
        setViceCaptainId(vice);
        setSelectedFormation(form || '4-4-2');
      } else {
        setStarters(Array(11).fill(null));
        setSubs(Array(4).fill(null));
        setCaptainId(null);
        setViceCaptainId(null);
        setSelectedFormation('4-4-2');
      }
    } catch (err) {
      console.error("Failed to load squad state", err);
    }
  };

  const loadSimulatorState = async () => {
    try {
      const url = wallet ? `/api/simulator?wallet=${wallet.toLowerCase()}` : '/api/simulator';
      const res = await fetch(url);
      const data = await res.json();
      setCurrentMatchday(data.currentMatchday);
      setEpochEnded(data.epochEnded);
      setLeaderboard(data.leaderboard || []);
      setStandings(data.standings || []);
      setActiveCountries(data.activeCountries || []);
      setMatchdayHistory(data.matchdayHistory || []);
      setUserHistory(data.userHistory || []);
    } catch (err) {
      console.error("Failed to load simulator state", err);
    }
  };

  // Connect Mock Wallet
  const connectMockWallet = () => {
    const mockAddr = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266".toLowerCase(); // Standard Hardhat Account #0
    setWallet(mockAddr);
    setWalletType('mock');
    localStorage.setItem('reign_wallet', mockAddr);
    localStorage.setItem('reign_wallet_type', 'mock');
    setSuccessMsg("Connected to Mock Wallet successfully");
    setErrorMsg('');
  };

  const connectRealWallet = async (providerType: 'okx' | 'metamask') => {
    setWalletProvider(providerType);
    let provider = providerType === 'okx' ? (window as any).okxwallet : (window as any).ethereum;
    
    if (providerType === 'okx' && !provider) {
      if ((window as any).ethereum?.isOkxWallet) {
        provider = (window as any).ethereum;
      } else {
        setErrorMsg("OKX Wallet is not installed. Please install it or use MetaMask.");
        return;
      }
    }

    if (!provider) {
      setErrorMsg(`${providerType === 'okx' ? 'OKX Wallet' : 'MetaMask'} is not detected.`);
      return;
    }

    setWalletConnecting(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      if (accounts.length > 0) {
        const addr = accounts[0].toLowerCase();
        setWallet(addr);
        setWalletType('real');
        localStorage.setItem('reign_wallet', addr);
        localStorage.setItem('reign_wallet_type', 'real');
        localStorage.setItem('reign_wallet_provider', providerType);
        
        // Check chain and switch if needed
        const cIdHex = await provider.request({ method: 'eth_chainId' });
        const currentChainId = parseInt(cIdHex, 16);
        setChainId(currentChainId);
        if (currentChainId !== 195) {
          setIsWrongNetwork(true);
          setNetworkSwitching(true);
          try {
            await provider.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: '0xC3' }], // 195 in hex
            });
            setIsWrongNetwork(false);
          } catch (switchError: any) {
            if (switchError.code === 4902) {
              try {
                await provider.request({
                  method: 'wallet_addEthereumChain',
                  params: [
                    {
                      chainId: '0xC3',
                      chainName: 'X Layer Testnet',
                      nativeCurrency: {
                        name: 'OKB',
                        symbol: 'OKB',
                        decimals: 18,
                      },
                      rpcUrls: ['https://testrpc.xlayer.tech'],
                      blockExplorerUrls: ['https://www.okx.com/explorer/xlayer-testnet'],
                    },
                  ],
                });
                setIsWrongNetwork(false);
              } catch (addError) {
                console.error("Failed to add X Layer Testnet", addError);
              }
            } else {
              console.error("Failed to switch to X Layer Testnet", switchError);
            }
          } finally {
            setNetworkSwitching(false);
          }
        } else {
          setIsWrongNetwork(false);
        }
        
        setSuccessMsg("Connected to wallet: " + addr.substring(0, 6) + "..." + addr.substring(38));
        setErrorMsg('');
        setShowConnectModal(false);
      }
    } catch (err: any) {
      setErrorMsg("Wallet connection failed: " + err.message);
    } finally {
      setWalletConnecting(false);
    }
  };

  // Disconnect
  const disconnectWallet = () => {
    setWallet('');
    setWalletType(null);
    localStorage.removeItem('reign_wallet');
    localStorage.removeItem('reign_wallet_type');
    setSuccessMsg("Disconnected successfully");
  };

  // Web3 Mock Action Trigger
  const triggerMockAction = async (action: string, amount?: number) => {
    if (walletType !== 'mock') return;
    setTxLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/web3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: wallet, action, amount })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setBalanceOKB(data.onChainState.okbBalance);
      setDeposited(data.onChainState.deposited);
      setWithdrawableProfit(data.onChainState.withdrawableProfit);
      setLockedPrincipal(data.onChainState.lockedPrincipal);
      setSuccessMsg(`Mock ${action} executed successfully!`);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setTxLoading(false);
    }
  };

  // On-Chain Real Web3 Actions
  const triggerRealAction = async (action: string, amountVal?: number) => {
    if (walletType !== 'real') return;
    setTxAction(action);
    setTxLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { createWalletClient, custom, parseUnits } = await import('viem');
      
      const provider = walletProvider === 'okx' ? (window as any).okxwallet : (window as any).ethereum;
      if (!provider) throw new Error("No wallet provider detected");
      
      const walletClient = createWalletClient({
        chain: {
          id: 195,
          name: "X Layer Testnet",
          nativeCurrency: { name: "OKB", symbol: "OKB", decimals: 18 },
          rpcUrls: { default: { http: ["https://testrpc.xlayer.tech"] } }
        },
        transport: custom(provider)
      });

      if (action === "deposit") {
        const valToDeposit = amountVal || parseFloat(stakeInputAmount) || 0.125;
        const depHash = await walletClient.writeContract({
          address: POOL_ADDRESS as `0x${string}`,
          abi: reignPoolAbi,
          functionName: 'deposit',
          account: wallet as `0x${string}`,
          value: parseUnits(valToDeposit.toFixed(4), 18)
        });
        setSuccessMsg(`Deposit transaction sent! Hash: ${depHash}`);
      } else if (action === "withdrawProfit") {
        const withdrawAmount = parseUnits((amountVal || 0.0625).toString(), 18);
        const hash = await walletClient.writeContract({
          address: POOL_ADDRESS as `0x${string}`,
          abi: reignPoolAbi,
          functionName: 'withdrawProfit',
          args: [withdrawAmount],
          account: wallet as `0x${string}`
        });
        setSuccessMsg(`Profit withdrawal successful! Hash: ${hash}`);
      } else if (action === "withdrawPrincipal") {
        const hash = await walletClient.writeContract({
          address: POOL_ADDRESS as `0x${string}`,
          abi: reignPoolAbi,
          functionName: 'withdrawPrincipal',
          account: wallet as `0x${string}`
        });
        setSuccessMsg(`Principal successfully refunded! Hash: ${hash}`);
      }

      // Reload state after delay
      setTimeout(loadWeb3State, 2000);
    } catch (err: any) {
      setErrorMsg("Transaction failed: " + err.message);
    } finally {
      setTxLoading(false);
      setTxAction(null);
    }
  };

  // Dispatch Action (Mock or Real Web3)
  const dispatchAction = (action: string, amount?: number) => {
    if (walletType === 'mock') {
      triggerMockAction(action, amount);
    } else {
      triggerRealAction(action, amount);
    }
  };

  // --- Squad Management ---

  // Squad Stats & Checks
  const selectedStartersFull = starters.map(id => id ? playerMap.get(id) : null).filter(Boolean) as Player[];
  const selectedSubsFull = subs.map(id => id ? playerMap.get(id) : null).filter(Boolean) as Player[];
  const fullSquad = [...selectedStartersFull, ...selectedSubsFull];

  const totalSpent = fullSquad.reduce((sum, p) => sum + p.price, 0);
  const remainingBudget = 100.0 - totalSpent;
  const squadSize = fullSquad.length;

  const starterPositions = getFormationPositions(selectedFormation);
  const gkIndices = starterPositions.map((pos, idx) => pos === 'GK' ? idx : -1).filter(idx => idx !== -1);
  const defIndices = starterPositions.map((pos, idx) => pos === 'DEF' ? idx : -1).filter(idx => idx !== -1);
  const midIndices = starterPositions.map((pos, idx) => pos === 'MID' ? idx : -1).filter(idx => idx !== -1);
  const fwdIndices = starterPositions.map((pos, idx) => pos === 'FWD' ? idx : -1).filter(idx => idx !== -1);

  const hasNullSlots = starters.includes(null) || subs.includes(null) || starters.length !== 11 || subs.length !== 4;
  const hasEliminatedPlayers = [...starters, ...subs].some(id => {
    if (!id) return false;
    const player = playerMap.get(id);
    return player && activeCountries.length > 0 && !activeCountries.includes(player.countryId);
  });
  const isUserSquadValidForSimulation = !hasNullSlots && !hasEliminatedPlayers;

  const countryCounts: Record<string, number> = {};
  for (const p of fullSquad) {
    countryCounts[p.countryId] = (countryCounts[p.countryId] || 0) + 1;
  }

  // Validations
  const isBudgetValid = remainingBudget >= 0;
  const isSquadSizeValid = squadSize === 15;
  const isFormationValid = isValidFormation(selectedStartersFull);
  
  let countryLimitExceeded = false;
  for (const cId in countryCounts) {
    if (countryCounts[cId] > 3) {
      countryLimitExceeded = true;
    }
  }

  const isCaptainValid = captainId !== null && starters.includes(captainId);
  const isViceCaptainValid = viceCaptainId !== null && starters.includes(viceCaptainId) && viceCaptainId !== captainId;

  const isSquadSaveable = 
    isBudgetValid && 
    isSquadSizeValid && 
    isFormationValid && 
    !countryLimitExceeded && 
    isCaptainValid && 
    isViceCaptainValid &&
    deposited;

  // Computed variables for variable lock staking (Block 2)
  const numericStakeAmount = parseFloat(stakeInputAmount) || 0;
  
  // Calculate total locked by competitors
  const totalCompetitorsLocked = leaderboard
    .filter(u => u.wallet.toLowerCase() !== wallet.toLowerCase())
    .reduce((sum, u) => sum + (u.lockedCapital || 0), 0);
  
  // User estimated locked principal (80% of entered stake)
  const userEstPrincipal = numericStakeAmount * 0.8;
  
  // Estimated pool share percentage: userEstPrincipal / (totalCompetitorsLocked + userEstPrincipal)
  const totalEstLocked = totalCompetitorsLocked + userEstPrincipal;
  const estPoolShare = totalEstLocked > 0 ? (userEstPrincipal / totalEstLocked) * 100 : 0;

  // Validation message helper for staking input
  let validationMsg = "";
  if (!wallet) {
    validationMsg = "Wallet not connected.";
  } else if (isWrongNetwork && walletType === 'real') {
    validationMsg = "Incorrect network. Please switch to X Layer Testnet.";
  } else if (deposited) {
    validationMsg = "Stake has already been locked.";
  } else if (numericStakeAmount < 0.125) {
    validationMsg = "Minimum lock is 0.125 OKB.";
  } else if (balanceOKB < numericStakeAmount) {
    validationMsg = "Insufficient OKB balance.";
  }

  // Intersection observer for tracking user row visibility on the leaderboard
  useEffect(() => {
    if (!wallet || activeTab !== 'leaderboard') {
      setIsMyRowVisible(true);
      return;
    }

    const element = myRowRef.current;
    if (!element) {
      setIsMyRowVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsMyRowVisible(entry.isIntersecting);
      },
      {
        threshold: 0.1,
      }
    );

    observer.observe(element);
    return () => {
      if (element) {
        observer.unobserve(element);
      }
    };
  }, [wallet, activeTab, leaderboard, leaderboardSortField, leaderboardSortAsc]);

  // Find connected user's rank in leaderboard (by total score)
  const myRank = (() => {
    if (!wallet) return 0;
    const sortedByScore = [...leaderboard].sort((a, b) => b.totalScore - a.totalScore);
    const idx = sortedByScore.findIndex(u => u.wallet.toLowerCase() === wallet.toLowerCase());
    return idx !== -1 ? idx + 1 : 0;
  })();

  const handleSort = (field: 'rank' | 'name' | 'locked' | 'latestScore' | 'score' | 'pnl' | 'totalPnl') => {
    if (leaderboardSortField === field) {
      setLeaderboardSortAsc(!leaderboardSortAsc);
    } else {
      setLeaderboardSortField(field);
      if (field === 'name') {
        setLeaderboardSortAsc(true);
      } else {
        setLeaderboardSortAsc(false);
      }
    }
  };

  const formatPnL = (val: number) => {
    const eps = 1e-9;
    if (val > eps) return `+${val.toFixed(4)} OKB`;
    if (val < -eps) return `${val.toFixed(4)} OKB`;
    return `0.0000 OKB`;
  };

  const getPnLColorClass = (val: number) => {
    const eps = 1e-9;
    if (val > eps) return 'text-[#00ff55]';
    if (val < -eps) return 'text-red-400';
    return 'text-neutral-500';
  };

  // Sorted Leaderboard according to selected column header (Block 5)
  const sortedLeaderboard = [...leaderboard].sort((a, b) => {
    let valA: any = 0;
    let valB: any = 0;
    
    if (leaderboardSortField === 'score') {
      valA = a.totalScore;
      valB = b.totalScore;
    } else if (leaderboardSortField === 'locked') {
      valA = a.lockedCapital !== undefined ? a.lockedCapital : 0;
      valB = b.lockedCapital !== undefined ? b.lockedCapital : 0;
    } else if (leaderboardSortField === 'pnl') {
      valA = a.latestPnL !== undefined ? a.latestPnL : 0;
      valB = b.latestPnL !== undefined ? b.latestPnL : 0;
    } else if (leaderboardSortField === 'totalPnl') {
      valA = a.totalNetProfit !== undefined ? a.totalNetProfit : 0;
      valB = b.totalNetProfit !== undefined ? b.totalNetProfit : 0;
    } else if (leaderboardSortField === 'latestScore') {
      valA = a.latestScore !== undefined ? a.latestScore : 0;
      valB = b.latestScore !== undefined ? b.latestScore : 0;
    } else if (leaderboardSortField === 'name') {
      valA = a.name ? a.name.toLowerCase() : '';
      valB = b.name ? b.name.toLowerCase() : '';
    } else if (leaderboardSortField === 'rank') {
      valA = a.totalScore;
      valB = b.totalScore;
      if (valA === valB) {
        return b.lockedCapital - a.lockedCapital;
      }
      return leaderboardSortAsc ? valB - valA : valA - valB;
    }

    if (valA === valB) {
      // Secondary sort: Amount Locked descending
      return b.lockedCapital - a.lockedCapital;
    }

    if (typeof valA === 'string' && typeof valB === 'string') {
      return leaderboardSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }

    return leaderboardSortAsc ? valA - valB : valB - valA;
  });

  // Add player to current selected slot
  const handleSelectPlayer = (player: Player) => {
    if (!selectedSlotIndex) return;

    // Check if player is already in squad (in another slot)
    const isAlreadySelected = starters.includes(player.id) || subs.includes(player.id);
    if (isAlreadySelected) {
      setErrorMsg(`${player.name} is already in your squad.`);
      return;
    }

    if (selectedSlotIndex.type === 'starter') {
      const newStarters = [...starters];
      newStarters[selectedSlotIndex.index] = player.id;
      setStarters(newStarters);
    } else {
      const newSubs = [...subs];
      newSubs[selectedSlotIndex.index] = player.id;
      setSubs(newSubs);
    }

    setSelectedSlotIndex(null);
    setErrorMsg('');
  };

  // Remove player from slot
  const handleRemovePlayer = (type: 'starter' | 'sub', index: number, id: number) => {
    if (type === 'starter') {
      const newStarters = [...starters];
      newStarters[index] = null;
      setStarters(newStarters);
      if (captainId === id) setCaptainId(null);
      if (viceCaptainId === id) setViceCaptainId(null);
    } else {
      const newSubs = [...subs];
      newSubs[index] = null;
      setSubs(newSubs);
    }
  };

  // Set Captain or Vice-Captain
  const handleSetRole = (role: 'captain' | 'vice', id: number) => {
    if (role === 'captain') {
      setCaptainId(id);
      if (viceCaptainId === id) setViceCaptainId(null);
    } else {
      setViceCaptainId(id);
      if (captainId === id) setCaptainId(null);
    }
  };

  const handleFormationChange = (newFormation: string) => {
    const oldPositions = getFormationPositions(selectedFormation);
    const newPositions = getFormationPositions(newFormation);

    const currentStartersByPos: Record<'GK' | 'DEF' | 'MID' | 'FWD', (number | null)[]> = {
      GK: [],
      DEF: [],
      MID: [],
      FWD: []
    };

    starters.forEach((id, idx) => {
      if (id) {
        const player = playerMap.get(id);
        if (player) {
          currentStartersByPos[player.position].push(id);
        }
      }
    });

    const newStarters = Array(11).fill(null);
    const posCounters: Record<'GK' | 'DEF' | 'MID' | 'FWD', number> = {
      GK: 0,
      DEF: 0,
      MID: 0,
      FWD: 0
    };

    for (let i = 0; i < 11; i++) {
      const neededPos = newPositions[i];
      const count = posCounters[neededPos];
      const availableList = currentStartersByPos[neededPos];
      
      if (count < availableList.length) {
        newStarters[i] = availableList[count];
        posCounters[neededPos]++;
      } else {
        newStarters[i] = null;
      }
    }

    setStarters(newStarters);
    setSelectedFormation(newFormation);

    if (captainId && !newStarters.includes(captainId)) {
      setCaptainId(null);
    }
    if (viceCaptainId && !newStarters.includes(viceCaptainId)) {
      setViceCaptainId(null);
    }
  };

  const getSquadValidationErrors = (): string[] => {
    const errors: string[] = [];

    // 1. Budget check
    if (totalSpent > 100.0) {
      errors.push(`Budget Limit Exceeded: Total squad price is $${totalSpent.toFixed(1)}M, which exceeds the $100.0M limit.`);
    }

    // 2. Squad slots check
    const emptyStarters = starters.filter(id => id === null).length;
    const emptySubs = subs.filter(id => id === null).length;
    if (emptyStarters > 0 || emptySubs > 0) {
      errors.push(`Empty Slots: You have ${emptyStarters} empty starting slots and ${emptySubs} empty bench slots. All 15 slots must be filled.`);
    }

    // 3. Country limit check (max 3 from same country)
    for (const cId in countryCounts) {
      if (countryCounts[cId] > 3) {
        const countryName = seedData.countries.find(c => c.id === cId)?.name || cId;
        errors.push(`Country Limit Exceeded: You have selected ${countryCounts[cId]} players from ${countryName} (max 3 allowed).`);
      }
    }

    // 4. Position and formation matching check
    const requiredPositions = getFormationPositions(selectedFormation);
    starters.forEach((id, idx) => {
      if (id) {
        const player = playerMap.get(id);
        if (player && player.position !== requiredPositions[idx]) {
          errors.push(`Slot Position Mismatch: Starter slot ${idx + 1} requires a ${requiredPositions[idx]} player, but has ${player.name} (${player.position}).`);
        }
      }
    });

    // 5. Captain checks
    if (captainId === null) {
      errors.push("Missing Captain: You must select a captain from your starting XI.");
    } else if (!starters.includes(captainId)) {
      errors.push("Invalid Captain: Captain must be a player in your starting XI.");
    }

    // 6. Vice captain checks
    if (viceCaptainId === null) {
      errors.push("Missing Vice-Captain: You must select a vice-captain from your starting XI.");
    } else if (!starters.includes(viceCaptainId)) {
      errors.push("Invalid Vice-Captain: Vice-captain must be a player in your starting XI.");
    } else if (viceCaptainId === captainId) {
      errors.push("Invalid Roles: Captain and vice-captain cannot be the same player.");
    }

    // 7. Eliminated countries check
    const eliminatedPlayers: string[] = [];
    starters.forEach(id => {
      if (id) {
        const player = playerMap.get(id);
        if (player && activeCountries.length > 0 && !activeCountries.includes(player.countryId)) {
          eliminatedPlayers.push(player.name);
        }
      }
    });
    subs.forEach(id => {
      if (id) {
        const player = playerMap.get(id);
        if (player && activeCountries.length > 0 && !activeCountries.includes(player.countryId)) {
          eliminatedPlayers.push(player.name);
        }
      }
    });
    if (eliminatedPlayers.length > 0) {
      errors.push(`Eliminated Players: The following players belong to eliminated countries and must be replaced: ${eliminatedPlayers.join(', ')}.`);
    }

    return errors;
  };

  // Cryptographically Sign and Save Squad
  const saveSquad = async () => {
    if (!wallet) return;
    if (!deposited) {
      setErrorMsg("You must lock a stake before saving a squad.");
      return;
    }

    const errors = getSquadValidationErrors();
    if (errors.length > 0) {
      setSquadValidationErrors(errors);
      setShowValidationModal(true);
      return;
    }
    setTxAction('saveSquad');
    setTxLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const message = `Save REIGN squad for Matchday ${currentMatchday}: ${starters.join(",")}|${subs.join(",")}|${captainId}|${viceCaptainId}`;
      let signature = "";

      if (walletType === 'mock') {
        // Generate mock signature
        signature = `0xmock_signature_${wallet}_${Date.now()}`;
      } else {
        // Real Web3 Signature using MetaMask
        signature = await (window as any).ethereum.request({
          method: 'personal_sign',
          params: [message, wallet]
        });
      }

      const res = await fetch('/api/squad', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: wallet,
          squad: { starters, subs, captainId, viceCaptainId, formation: selectedFormation },
          signature,
          message
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccessMsg("Squad saved and locked successfully!");
      loadSimulatorState();
    } catch (err: any) {
      setErrorMsg("Failed to save squad: " + err.message);
    } finally {
      setTxLoading(false);
      setTxAction(null);
    }
  };

  // --- Tournament & Simulator Actions ---

  // Trigger Matchday Simulation
  const simulateCurrentMatchday = async () => {
    setSimulationLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSimulationResult(data);
      setSuccessMsg(`Matchday ${data.simulatedMatchday} simulated successfully!`);
      setActiveResultsMatchday(data.simulatedMatchday); // Auto-open results modal!
      loadSimulatorState();
      loadWeb3State(); // reload wallet to get new rewards/ledger
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setSimulationLoading(false);
    }
  };

  // Submit settleMatchday transaction on-chain (Admin)
  const settleMatchdayOnChain = async () => {
    if (!simulationResult || !simulationResult.settlePayload) return;
    setTxLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { users, profitsOrLosses } = simulationResult.settlePayload;

      if (walletType === 'mock') {
        // Mock Settle
        // Since mock handles updating withdrawableProfit inside simulateMatchday API, we just mark it done!
        setSuccessMsg("Matchday payouts successfully settled in mock ledger!");
        setSimulationResult(null);
      } else {
        // Real Web3 Payout Settle
        const { createWalletClient, custom } = await import('viem');
        const walletClient = createWalletClient({
          chain: {
            id: 31337,
            name: "Localhost",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: { default: { http: ["http://127.0.0.1:8545"] } }
          },
          transport: custom((window as any).ethereum)
        });

        // Convert profits/losses back to BigInt values
        const parsedProfits = profitsOrLosses.map((val: string) => BigInt(val));

        const hash = await walletClient.writeContract({
          address: POOL_ADDRESS as `0x${string}`,
          abi: reignPoolAbi,
          functionName: 'settleMatchday',
          args: [users as `0x${string}[]`, parsedProfits],
          account: wallet as `0x${string}`
        });

        setSuccessMsg(`On-chain matchday payouts settled! Hash: ${hash}`);
        setSimulationResult(null);
        setTimeout(loadWeb3State, 2000);
      }
    } catch (err: any) {
      setErrorMsg("Settlement transaction failed: " + err.message);
    } finally {
      setTxLoading(false);
    }
  };

  // Reset Tournament
  const resetTournament = async () => {
    if (!window.confirm("Are you sure you want to reset the tournament to Matchday 1? This will wipe all simulator history and rankings.")) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccessMsg("Tournament successfully reset!");
      setSimulationResult(null);
      setStarters(Array(11).fill(null));
      setSubs(Array(4).fill(null));
      setCaptainId(null);
      setViceCaptainId(null);
      loadSimulatorState();
      setTimeout(loadWeb3State, 500);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // --- Filtering player lists ---
  const filteredPlayers = allPlayers.filter(p => {
    if (marketPosition !== 'ALL' && p.position !== marketPosition) return false;
    if (marketCountry !== 'ALL' && p.countryId !== marketCountry) return false;
    if (marketSearch && !p.name.toLowerCase().includes(marketSearch.toLowerCase())) return false;
    return true;
  });

  filteredPlayers.sort((a, b) => {
    if (marketSort === 'rating') return b.rating - a.rating;
    return b.price - a.price;
  });

  const getPositionName = (pos: string) => {
    switch (pos) {
      case 'GK': return 'Goalkeeper';
      case 'DEF': return 'Defender';
      case 'MID': return 'Midfielder';
      case 'FWD': return 'Forward';
      default: return '';
    }
  };

  const getCountryInfo = (id: string) => {
    const c = seedData.countries.find(x => x.id === id);
    return {
      name: c?.name || id,
      flag: c?.flag || '🏳️'
    };
  };

  const getTopPerformers = (selectedHistory: any) => {
    if (!selectedHistory || !selectedHistory.playerStats) return [];
    return Object.entries(selectedHistory.playerStats)
      .map(([idStr, stat]: [string, any]) => {
        const id = parseInt(idStr);
        const player = allPlayers.find(p => p.id === id);
        if (!player) return null;
        const score = calculatePlayerPoints(player.position, stat);
        return { player, score, stat };
      })
      .filter((p): p is any => p !== null && p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  };

  const renderPlayerStatsBadges = (player: Player, stats: any) => {
    if (!stats || stats.minutesPlayed === 0) return <span className="text-neutral-500 font-bold">DNP</span>;
    const badges = [];
    if (stats.goals > 0) badges.push(`⚽ x${stats.goals}`);
    if (stats.assists > 0) badges.push(`👟 x${stats.assists}`);
    if (player.position === 'GK' && stats.saves > 0) badges.push(`🧤 x${stats.saves}`);
    if (stats.cleanSheet && stats.minutesPlayed >= 60 && (player.position === 'GK' || player.position === 'DEF' || player.position === 'MID')) {
      badges.push(`⛔ CS`);
    }
    if (stats.bpsBonus > 0) badges.push(`⭐ +${stats.bpsBonus} Bonus`);
    if (stats.yellowCard) badges.push(`🟨 YC`);
    if (stats.redCard) badges.push(`🟥 RC`);
    if (stats.ownGoals > 0) badges.push(`❌ OG`);

    return (
      <div className="flex flex-wrap gap-1 mt-0.5 justify-center">
        {badges.map((b, i) => (
          <span key={i} className="text-[9px] bg-neutral-850 text-neutral-400 px-1 rounded border border-neutral-850 font-bold uppercase whitespace-nowrap">
            {b}
          </span>
        ))}
        {badges.length === 0 && <span className="text-[10px] text-neutral-500 font-mono">Played {stats.minutesPlayed}m</span>}
      </div>
    );
  };

  return (
    <div className="flex-1 bg-black text-neutral-100 font-sans flex flex-col min-h-screen">
      {/* 1. Sleek Header */}
      <header className="border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-[#00ff55] to-emerald-400 p-2 rounded-lg text-black font-extrabold flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-wider bg-gradient-to-r from-neutral-50 via-neutral-100 to-emerald-400 bg-clip-text text-transparent">REIGN</h1>
            <p className="text-xs text-neutral-500 font-medium tracking-widest">WEB3 FANTASY WORLD CUP</p>
          </div>
        </div>

        {/* Network and Wallet Bar */}
        <div className="flex items-center gap-4">
          {wallet && (
            <div className="hidden sm:flex items-center gap-2 bg-neutral-900 border border-neutral-800 rounded-full px-3 py-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#00ff55] animate-pulse"></span>
              <span className="text-neutral-400 font-semibold uppercase tracking-wider">X Layer {walletType === 'mock' ? 'Simulated' : 'Testnet'}</span>
            </div>
          )}

          {wallet ? (
            <div className="flex items-center gap-3 bg-neutral-900/60 backdrop-blur border border-neutral-800/80 rounded-full py-1 pl-4 pr-1">
              <div className="text-right">
                <p className="text-[10px] font-bold text-neutral-500 tracking-wider">BALANCE</p>
                <p className="text-xs font-black text-[#00ff55] font-mono">{balanceOKB.toFixed(4)} OKB</p>
              </div>
              <div className="bg-neutral-950 px-3 py-1.5 rounded-full border border-neutral-800 flex items-center gap-2">
                <Wallet className="w-3.5 h-3.5 text-[#00ff55]" />
                <span className="text-xs font-mono font-bold text-neutral-300">
                  {wallet.substring(0, 6)}...{wallet.substring(38)}
                </span>
                <button 
                  onClick={disconnectWallet} 
                  className="hover:text-red-500 transition-colors p-0.5 ml-1"
                  title="Disconnect Wallet"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button 
                onClick={connectMockWallet} 
                className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 transition px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 text-neutral-300"
              >
                <RotateCcw className="w-3.5 h-3.5 text-neutral-400" />
                Mock Sign-In
              </button>
              <button 
                onClick={() => setShowConnectModal(true)} 
                className="bg-[#00ff55] hover:bg-[#02e04c] text-black font-extrabold transition px-4 py-2 rounded-full text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20"
              >
                <Wallet className="w-3.5 h-3.5" />
                Connect Wallet
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-6 py-6 flex flex-col gap-6">
        
        {/* Status / Message Banners */}
        {errorMsg && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-red-500">Error Encountered</h4>
              <p className="text-xs text-red-400/90 mt-0.5 leading-relaxed">{errorMsg}</p>
            </div>
          </div>
        )}

        {successMsg && (() => {
          const hashIndex = successMsg.indexOf("Hash: ");
          if (hashIndex !== -1) {
            const textPart = successMsg.substring(0, hashIndex);
            const hashPart = successMsg.substring(hashIndex + 6).trim();
            return (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-emerald-400">Success</h4>
                  <p className="text-xs text-emerald-300/90 mt-0.5 leading-relaxed">
                    {textPart}
                    <a 
                      href={`https://www.okx.com/explorer/xlayer-testnet/tx/${hashPart}`} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-cyan-400 hover:text-cyan-300 underline ml-1 font-mono break-all font-bold"
                    >
                      {hashPart.substring(0, 10)}...{hashPart.substring(hashPart.length - 8)}
                    </a>
                  </p>
                </div>
              </div>
            );
          }
          return (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-emerald-400">Success</h4>
                <p className="text-xs text-emerald-300/90 mt-0.5 leading-relaxed">{successMsg}</p>
              </div>
            </div>
          );
        })()}

        {/* Wrong Network Banner */}
        {isWrongNetwork && walletType === 'real' && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-amber-500">Wrong Network</h4>
                <p className="text-xs text-amber-400/95 mt-0.5 leading-relaxed">
                  Please switch your wallet network to X Layer Testnet to interact with the tournament.
                </p>
              </div>
            </div>
            <button
              onClick={switchNetwork}
              className="bg-amber-500 hover:bg-amber-600 text-black text-xs font-black px-4 py-2 rounded-xl transition"
            >
              Switch Network
            </button>
          </div>
        )}

        {/* Not Connected Screen */}
        {!wallet ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="max-w-md w-full bg-neutral-950 border border-neutral-900 rounded-3xl p-8 text-center flex flex-col items-center gap-6 shadow-2xl">
              <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-full text-[#00ff55] animate-pulse">
                <Coins className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-black tracking-tight text-neutral-100">Deploy Capital. Build Reign.</h2>
                <p className="text-neutral-500 text-sm mt-2 leading-relaxed">
                  Staking HCLP capital (80% refundable principal + 20% entry fee) unlocks squad compilation and matchday simulations with rewards redistributed via the Z-Score Softmax (NRPS) engine on X Layer.
                </p>
              </div>
              
              <div className="flex flex-col gap-2 w-full">
                <button 
                  onClick={() => setShowConnectModal(true)} 
                  className="w-full bg-[#00ff55] hover:bg-[#02e04c] text-black font-black transition py-3 rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Wallet className="w-4 h-4" />
                  Connect OKX Wallet / MetaMask
                </button>
                <div className="flex items-center my-2 text-neutral-600">
                  <hr className="flex-1 border-neutral-800" />
                  <span className="px-3 text-[10px] font-bold tracking-widest uppercase">OR</span>
                  <hr className="flex-1 border-neutral-800" />
                </div>
                <button 
                  onClick={connectMockWallet} 
                  className="w-full bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 text-neutral-300 font-bold transition py-3 rounded-xl text-sm flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4 text-neutral-400" />
                  Sign In with Mock Wallet (No Install Required)
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Connected Dashboard */
          <>
            {/* 2. Navigation Tabs */}
            <div className="flex items-center justify-between bg-neutral-950 border border-neutral-900 rounded-2xl p-1.5">
              <div className="flex gap-1.5 flex-1 md:flex-initial">
                <button 
                  onClick={() => setActiveTab('squad')} 
                  className={`flex-1 md:flex-initial px-6 py-2.5 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'squad' ? 'bg-[#00ff55] text-black shadow-lg shadow-emerald-500/10' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'}`}
                >
                  <Users className="w-4 h-4" />
                  Squad Builder
                </button>
                <button 
                  onClick={() => setActiveTab('simulator')} 
                  className={`flex-1 md:flex-initial px-6 py-2.5 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'simulator' ? 'bg-[#00ff55] text-black shadow-lg shadow-emerald-500/10' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'}`}
                >
                  <Calendar className="w-4 h-4" />
                  Matchday Simulator
                </button>
                <button 
                  onClick={() => setActiveTab('leaderboard')} 
                  className={`flex-1 md:flex-initial px-6 py-2.5 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-200 flex items-center justify-center gap-2 ${activeTab === 'leaderboard' ? 'bg-[#00ff55] text-black shadow-lg shadow-emerald-500/10' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'}`}
                >
                  <TrendingUp className="w-4 h-4" />
                  Leaderboard & Ledger
                </button>
              </div>

              {/* Tournament Phase Badge (Block 4.4) */}
              <div className="hidden md:flex items-center gap-3">
                {!epochEnded ? (
                  <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-850 px-3 py-1.5 rounded-2xl">
                    <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">
                      MD {currentMatchday}
                    </span>
                    <div className="h-3 w-px bg-neutral-800" />
                    <span className="text-[10px] text-blue-400 font-black uppercase tracking-wider">
                      {currentMatchday <= 3 ? "Group Stage" : 
                       currentMatchday === 4 ? "Round of 16" : 
                       currentMatchday === 5 ? "Quarter-Finals" : 
                       currentMatchday === 6 ? "Semi-Finals" : "Final"}
                    </span>
                  </div>
                ) : (
                  <span className="text-[10px] bg-emerald-500/10 text-[#00ff55] border border-emerald-500/20 px-3 py-1.5 rounded-2xl font-black uppercase tracking-wider">
                    Tournament Completed
                  </span>
                )}
                
                {/* Reset Control */}
                <button 
                  onClick={resetTournament} 
                  className="flex items-center gap-2 text-xs font-bold text-neutral-500 hover:text-red-400 hover:bg-red-500/10 px-3.5 py-2 rounded-xl transition-all duration-200 border border-transparent hover:border-red-500/20 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset Tournament
                </button>
              </div>
            </div>

            {/* 3. Tab Contents */}
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* TAB 1: SQUAD BUILDER */}
              {activeTab === 'squad' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start min-h-0">
                  
                  {/* Left Column: Pitch & Bench */}
                  <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
                    
                    {/* Inter-Matchday Transfer & Withdrawal Window (Block 4.3) */}
                    {currentMatchday > 1 && !epochEnded && (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 text-[#00ff55] rounded-3xl px-5 py-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-bold w-full">
                        <div className="flex items-center gap-2">
                          <span className="relative flex h-2 w-2 flex-shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ff55] opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00ff55]"></span>
                          </span>
                          <span>Matchday {currentMatchday - 1} Complete — Transfer Window Open</span>
                        </div>
                        {withdrawableProfit > 0 && (
                          <div className="flex items-center gap-2.5 self-end sm:self-auto">
                            {withdrawableProfit < 0.0625 && (
                              <span className="text-[10px] text-amber-500 font-medium normal-case">
                                (Min. withdrawal limit is 0.0625 OKB)
                              </span>
                            )}
                            <button
                              onClick={() => dispatchAction('withdrawProfit')}
                              disabled={txLoading || withdrawableProfit < 0.0625}
                              className="bg-[#00ff55] hover:bg-[#02e04c] disabled:opacity-40 disabled:hover:bg-[#00ff55] disabled:cursor-not-allowed text-black font-black px-3.5 py-2 rounded-xl text-[10px] uppercase transition cursor-pointer flex-shrink-0 shadow-lg shadow-emerald-500/10"
                            >
                              Withdraw {withdrawableProfit.toFixed(4)} OKB
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {/* Budget & Registration Indicator */}
                    <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                      
                      {/* Budget Tracker */}
                      <div className="flex-1 flex flex-col gap-2">
                        <div className="flex justify-between text-xs font-black text-neutral-400">
                          <span>BUDGET SPENT</span>
                          <span className={isBudgetValid ? 'text-[#00ff55]' : 'text-red-500'}>
                            ${totalSpent.toFixed(1)}M / $100.0M
                          </span>
                        </div>
                        <div className="w-full bg-neutral-900 h-2.5 rounded-full overflow-hidden border border-neutral-800">
                          <div 
                            className={`h-full transition-all duration-300 ${isBudgetValid ? 'bg-gradient-to-r from-emerald-500 to-[#00ff55]' : 'bg-red-500'}`} 
                            style={{ width: `${Math.min(totalSpent, 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Staking/Deposit check */}
                      {!deposited ? (
                        <div className="flex flex-col gap-3 bg-neutral-900/40 p-4 rounded-2xl border border-neutral-800/80 max-w-md w-full sm:w-auto">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">LOCK OKB STAKE</span>
                            {numericStakeAmount > 0 && (
                              <span className="text-[10px] font-bold text-neutral-500">
                                Share: {estPoolShare.toFixed(2)}% | 80% Principal: {userEstPrincipal.toFixed(3)} OKB
                              </span>
                            )}
                          </div>
                          
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type="number"
                                step="0.001"
                                min="0.125"
                                value={stakeInputAmount}
                                onChange={(e) => setStakeInputAmount(e.target.value)}
                                placeholder="Amount"
                                className="w-full bg-neutral-950 border border-neutral-800 focus:border-[#00ff55]/50 focus:ring-1 focus:ring-[#00ff55]/50 rounded-xl px-3 py-2 text-xs font-mono font-bold text-neutral-100 outline-none transition"
                              />
                              <span className="absolute right-3 top-2 text-[10px] font-black text-neutral-500 font-mono">OKB</span>
                            </div>
                            <button 
                              onClick={() => dispatchAction('deposit')}
                              disabled={txLoading || !!validationMsg}
                              className="bg-gradient-to-r from-[#00ff55] to-emerald-400 hover:from-emerald-400 hover:to-[#00ff55] disabled:opacity-30 disabled:pointer-events-none text-black font-black px-4 py-2 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg shadow-emerald-500/10 transition"
                            >
                              <Coins className="w-3.5 h-3.5" />
                              STAKE
                            </button>
                          </div>

                          {/* Quick Select Buttons */}
                          <div className="flex flex-wrap gap-1.5">
                            {[0.125, 0.25, 0.5, 1.0, 2.0, 5.0].map(amt => (
                              <button
                                key={amt}
                                type="button"
                                onClick={() => setStakeInputAmount(amt.toString())}
                                className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition border ${
                                  parseFloat(stakeInputAmount) === amt
                                    ? 'bg-[#00ff55]/10 border-[#00ff55] text-[#00ff55]'
                                    : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200'
                                }`}
                              >
                                {amt}
                              </button>
                            ))}
                          </div>

                          {/* Validation Message */}
                          {validationMsg && (
                            <p className="text-[10px] font-semibold text-amber-500/90 leading-tight">
                              ⚠️ {validationMsg}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 text-[#00ff55] rounded-2xl px-5 py-4 flex flex-col gap-1 self-center text-xs font-bold w-full sm:w-auto">
                          <div className="flex items-center gap-2">
                            <ShieldCheck className="w-4.5 h-4.5 text-[#00ff55]" />
                            <span>Stake Active & Locked</span>
                          </div>
                          <p className="text-[10px] font-normal text-emerald-400/80">
                            Locked Principal: {lockedPrincipal.toFixed(4)} OKB (refundable)
                          </p>
                        </div>
                      )}
                    </div>                    {/* Pitch Toolbar with Formation Selector */}
                    <div className="flex items-center justify-between bg-neutral-950 border border-neutral-900 rounded-3xl p-4 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-neutral-400 uppercase tracking-widest">TACTICS / FORMATION</span>
                      </div>
                      
                      <div className="relative">
                        <select
                          value={selectedFormation}
                          onChange={(e) => handleFormationChange(e.target.value)}
                          className="bg-neutral-900 border border-neutral-800 text-neutral-200 text-xs font-bold px-3 py-1.5 rounded-xl outline-none focus:border-[#00ff55]/50 focus:ring-1 focus:ring-[#00ff55]/50 transition cursor-pointer"
                        >
                          {['4-4-2', '4-3-3', '3-5-2', '4-2-3-1', '3-4-3', '5-3-2', '5-4-1'].map(form => (
                            <option key={form} value={form} className="bg-neutral-950 font-bold text-neutral-300">
                              {form}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Football Pitch */}
                    <div className="bg-gradient-to-b from-neutral-950 to-neutral-900 border border-neutral-900 rounded-3xl p-6 relative overflow-hidden flex flex-col justify-between aspect-[1.3] shadow-2xl">
                      {/* Pitch Layout Markings */}
                      <div className="absolute inset-x-0 top-0 h-1/2 border-b border-neutral-800/40 pointer-events-none"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/4 aspect-square border border-neutral-800/40 rounded-full pointer-events-none"></div>
                      
                      {/* GK Position */}
                      <div className="flex justify-center">
                        {gkIndices.map(idx => (
                          <PitchSlot 
                            key={idx}
                            index={idx} 
                            position="GK" 
                            playerId={starters[idx]} 
                            onRemove={(id) => handleRemovePlayer('starter', idx, id)}
                            onSelect={() => setSelectedSlotIndex({ type: 'starter', index: idx })}
                            captainId={captainId}
                            viceCaptainId={viceCaptainId}
                            onSetRole={handleSetRole}
                            playerMap={playerMap}
                          />
                        ))}
                      </div>

                      {/* DEF Position */}
                      <div className="flex justify-around">
                        {defIndices.map(idx => (
                          <PitchSlot 
                            key={idx}
                            index={idx} 
                            position="DEF" 
                            playerId={starters[idx]} 
                            onRemove={(id) => handleRemovePlayer('starter', idx, id)}
                            onSelect={() => setSelectedSlotIndex({ type: 'starter', index: idx })}
                            captainId={captainId}
                            viceCaptainId={viceCaptainId}
                            onSetRole={handleSetRole}
                            playerMap={playerMap}
                          />
                        ))}
                      </div>

                      {/* MID Position */}
                      <div className="flex justify-around">
                        {midIndices.map(idx => (
                          <PitchSlot 
                            key={idx}
                            index={idx} 
                            position="MID" 
                            playerId={starters[idx]} 
                            onRemove={(id) => handleRemovePlayer('starter', idx, id)}
                            onSelect={() => setSelectedSlotIndex({ type: 'starter', index: idx })}
                            captainId={captainId}
                            viceCaptainId={viceCaptainId}
                            onSetRole={handleSetRole}
                            playerMap={playerMap}
                          />
                        ))}
                      </div>

                      {/* FWD Position */}
                      <div className="flex justify-around px-20">
                        {fwdIndices.map(idx => (
                          <PitchSlot 
                            key={idx}
                            index={idx} 
                            position="FWD" 
                            playerId={starters[idx]} 
                            onRemove={(id) => handleRemovePlayer('starter', idx, id)}
                            onSelect={() => setSelectedSlotIndex({ type: 'starter', index: idx })}
                            captainId={captainId}
                            viceCaptainId={viceCaptainId}
                            onSetRole={handleSetRole}
                            playerMap={playerMap}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Bench Section (4 Subs) */}
                    <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-5">
                      <h3 className="text-xs font-black tracking-wider text-neutral-500 mb-4 uppercase">Substitutes Bench (Ordered Left-to-Right)</h3>
                      <div className="grid grid-cols-4 gap-4">
                        {[0, 1, 2, 3].map(idx => {
                          const pos = idx === 0 ? "GK" : idx === 1 ? "DEF" : idx === 2 ? "MID" : "FWD";
                          return (
                            <div key={idx} className="bg-neutral-900/50 rounded-2xl border border-neutral-900 p-3 flex flex-col items-center justify-center">
                              <PitchSlot 
                                index={idx} 
                                position={pos} 
                                playerId={subs[idx]} 
                                onRemove={(id) => handleRemovePlayer('sub', idx, id)}
                                onSelect={() => setSelectedSlotIndex({ type: 'sub', index: idx })}
                                captainId={null}
                                viceCaptainId={null}
                                playerMap={playerMap}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Player Market / Selection Modal */}
                  <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6 lg:self-stretch min-h-0">
                    
                    {/* Squad Control Panel */}
                    <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-5 flex flex-col gap-4 flex-shrink-0">
                      <h3 className="text-sm font-black tracking-wider text-neutral-300 uppercase">Squad Control Panel</h3>
                      
                      <div className="grid grid-cols-2 gap-3 text-xs bg-neutral-900/30 p-3 rounded-2xl border border-neutral-850">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-black text-neutral-500 uppercase tracking-wider">Formation</span>
                          <span className="font-bold text-neutral-200">{selectedFormation}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-black text-neutral-500 uppercase tracking-wider">Staged Players</span>
                          <span className="font-bold text-neutral-200">{squadSize} / 15</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-black text-neutral-500 uppercase tracking-wider">Budget Spent</span>
                          <span className={`font-bold ${isBudgetValid ? 'text-[#00ff55]' : 'text-red-400'}`}>${totalSpent.toFixed(1)}M</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-black text-neutral-500 uppercase tracking-wider">Budget Limit</span>
                          <span className="font-bold text-neutral-400">$100.0M</span>
                        </div>
                      </div>

                      <button 
                        onClick={saveSquad}
                        disabled={!wallet || !deposited || txLoading}
                        className="w-full bg-[#00ff55] hover:bg-[#02e04c] disabled:opacity-40 disabled:hover:bg-[#00ff55] disabled:cursor-not-allowed text-black font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 transition duration-200 mt-2 shadow-lg shadow-emerald-500/10 cursor-pointer"
                      >
                        {txLoading && txAction === 'saveSquad' ? (
                          <div className="w-4.5 h-4.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <ShieldCheck className="w-4.5 h-4.5" />
                        )}
                        {txLoading && txAction === 'saveSquad' ? "SAVING..." : "LOCK AND SIGN SQUAD"}
                      </button>
                    </div>

                    {/* Market / Selector panel */}
                    <div className={`
                      ${selectedSlotIndex 
                        ? 'fixed inset-0 z-50 bg-neutral-950 p-4 md:p-6 flex flex-col h-full' 
                        : 'hidden lg:flex lg:flex-col lg:flex-1 lg:min-h-0'}
                      lg:relative lg:inset-auto lg:z-0 lg:bg-transparent lg:p-0 lg:flex lg:flex-col lg:flex-1 lg:min-h-0 lg:sticky lg:top-[90px] lg:max-h-[calc(100vh-130px)]
                    `}>
                      <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-5 flex flex-col min-h-[400px] lg:min-h-[500px] flex-1 overflow-hidden">
                      <div className="flex items-center justify-between mb-4 flex-shrink-0">
                        <h3 className="text-sm font-black tracking-wider text-neutral-300 uppercase">
                          {selectedSlotIndex ? `SELECT ${getPositionName(selectedSlotIndex.type === 'starter' ? starterPositions[selectedSlotIndex.index] : (selectedSlotIndex.index === 0 ? 'GK' : selectedSlotIndex.index === 1 ? 'DEF' : selectedSlotIndex.index === 2 ? 'MID' : 'FWD'))}` : "PLAYER MARKET"}
                        </h3>
                        {selectedSlotIndex && (
                          <button 
                            onClick={() => setSelectedSlotIndex(null)}
                            className="text-xs text-neutral-500 hover:text-neutral-300 font-bold"
                          >
                            Cancel selection
                          </button>
                        )}
                      </div>

                      {/* Filters */}
                      <div className="flex flex-col gap-2 flex-shrink-0 mb-3">
                        <input 
                          type="text" 
                          placeholder="Search player name..." 
                          value={marketSearch}
                          onChange={(e) => setMarketSearch(e.target.value)}
                          className="bg-neutral-900 border border-neutral-850 rounded-xl px-4 py-2 text-xs focus:outline-none focus:border-neutral-700 w-full text-neutral-200 font-medium"
                        />
                        
                        <div className="grid grid-cols-2 gap-2">
                          {/* Position Filter */}
                          {!selectedSlotIndex && (
                            <select 
                              value={marketPosition} 
                              onChange={(e) => setMarketPosition(e.target.value)}
                              className="bg-neutral-900 border border-neutral-850 rounded-xl px-3 py-2 text-xs focus:outline-none text-neutral-300 font-medium"
                            >
                              <option value="ALL">All Positions</option>
                              <option value="GK">Goalkeepers</option>
                              <option value="DEF">Defenders</option>
                              <option value="MID">Midfielders</option>
                              <option value="FWD">Forwards</option>
                            </select>
                          )}
                          
                          {/* Sort */}
                          <select 
                            value={marketSort} 
                            onChange={(e) => setMarketSort(e.target.value as any)}
                            className={`bg-neutral-900 border border-neutral-850 rounded-xl px-3 py-2 text-xs focus:outline-none text-neutral-300 font-medium ${selectedSlotIndex ? 'col-span-2' : ''}`}
                          >
                            <option value="rating">Sort by Rating</option>
                            <option value="price">Sort by Price</option>
                          </select>
                        </div>
                      </div>

                      {/* Player List */}
                      <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-2 min-h-0">
                        {filteredPlayers
                          .filter(p => {
                            if (!selectedSlotIndex) return true;
                            // Enforce position constraint for the selected slot
                            const slotIndex = selectedSlotIndex.index;
                            const slotType = selectedSlotIndex.type;
                            let targetPos = "";
                            if (slotType === 'starter') {
                              targetPos = starterPositions[slotIndex];
                            } else {
                              targetPos = slotIndex === 0 ? 'GK' : slotIndex === 1 ? 'DEF' : slotIndex === 2 ? 'MID' : 'FWD';
                            }
                            return p.position === targetPos;
                          })
                          .map(player => {
                            const isAdded = starters.includes(player.id) || subs.includes(player.id);
                            const country = seedData.countries.find(c => c.id === player.countryId);

                            return (
                              <div 
                                key={player.id} 
                                className={`bg-neutral-900/40 border border-neutral-900 rounded-xl p-3 flex items-center justify-between transition-all hover:bg-neutral-900/80 ${isAdded ? 'opacity-40' : ''}`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <span className="text-xl">{country?.flag || '🏳️'}</span>
                                  <div>
                                    <h4 className="text-xs font-bold text-neutral-200">{player.name}</h4>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] bg-neutral-850 text-neutral-400 px-1.5 py-0.5 rounded font-black tracking-wider">{player.position}</span>
                                      <span className="text-[10px] text-neutral-500 font-bold">{country?.name}</span>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-3.5">
                                  <div className="text-right">
                                    <p className="text-xs font-black text-[#00ff55]">${player.price.toFixed(1)}M</p>
                                    <p className="text-[10px] text-neutral-500 font-bold">Rating: {player.rating}</p>
                                  </div>
                                  
                                  {selectedSlotIndex ? (
                                    <button
                                      disabled={isAdded}
                                      onClick={() => handleSelectPlayer(player)}
                                      className="bg-neutral-850 hover:bg-neutral-800 border border-neutral-800 disabled:opacity-50 text-neutral-300 font-black px-3 py-1.5 rounded-lg text-[10px] uppercase transition cursor-pointer"
                                    >
                                      Select
                                    </button>
                                  ) : (
                                    <button
                                      disabled
                                      className="opacity-0 w-0 h-0"
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        {filteredPlayers.length === 0 && (
                          <div className="py-10 text-center text-xs text-neutral-500 font-bold">
                            No players matched filters
                          </div>
                        )}
                      </div>
                    </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: TOURNAMENT SIMULATOR */}
              {activeTab === 'simulator' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start min-h-0">
                  
                  {/* Left Column: Matchday simulation panel */}
                  <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
                    
                    {/* Big Action Panel */}
                    <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-6 shadow-xl">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-lg font-black tracking-wider text-neutral-200 uppercase">
                            {epochEnded ? "TOURNAMENT COMPLETE" : `MATCHDAY ${currentMatchday} SIMULATION`}
                          </h2>
                          {!epochEnded && (
                            <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              {currentMatchday <= 3 ? "Group Stage" : 
                               currentMatchday === 4 ? "Round of 16" : 
                               currentMatchday === 5 ? "Quarter-Finals" : 
                               currentMatchday === 6 ? "Semi-Finals" : "Final"}
                            </span>
                          )}
                          {currentMatchday > 1 && !epochEnded && (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse">
                              Transfer Window Open
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                          {epochEnded ? "All 7 matchdays have been simulated and payouts settled. Withdraw your profits and principal from the Ledger tab." : "Simulate games for this matchday, calculate player FPL scores, auto-substitutions, and calculate Softmax payouts."}
                        </p>
                      </div>

                      {!epochEnded && (
                        <div className="flex-shrink-0 flex items-center gap-3">
                          {simulationResult ? (
                            <button 
                              onClick={settleMatchdayOnChain}
                              disabled={txLoading}
                              className="bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-blue-500 hover:to-cyan-400 text-white font-black px-6 py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-500/15 cursor-pointer"
                            >
                              <ShieldCheck className="w-4.5 h-4.5" />
                              SETTLE PAYOUTS ON X LAYER
                            </button>
                          ) : (
                            <div className="flex flex-col gap-2">
                              <button 
                                onClick={simulateCurrentMatchday}
                                disabled={simulationLoading || !isUserSquadValidForSimulation}
                                className="bg-[#00ff55] hover:bg-[#02e04c] disabled:opacity-40 disabled:hover:bg-[#00ff55] disabled:cursor-not-allowed text-black font-black px-6 py-3.5 rounded-2xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
                              >
                                <Play className="w-4.5 h-4.5 fill-black" />
                                {simulationLoading ? "SIMULATING..." : `SIMULATE MATCHDAY ${currentMatchday}`}
                              </button>
                              {!isUserSquadValidForSimulation && (
                                <p className="text-[10px] text-amber-500 font-bold max-w-xs leading-normal">
                                  ⚠️ Simulation blocked: Fix your squad (all 15 slots must be filled with active players, no eliminated countries).
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Simulation results card */}
                    {simulationResult ? (
                      <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-5 flex flex-col gap-5">
                        <div className="flex items-center justify-between border-b border-neutral-900 pb-3">
                          <h3 className="text-xs font-black tracking-wider text-neutral-400 uppercase">Matchday {simulationResult.simulatedMatchday} Payout Details</h3>
                          <span className="text-[10px] bg-neutral-900 text-neutral-400 px-2 py-0.5 rounded-full border border-neutral-850 font-bold uppercase">Pending Settlement</span>
                        </div>

                        {/* NRPS User Payout Results */}
                        <div className="flex flex-col gap-3">
                          {simulationResult.nrpsResult?.userResults
                            .filter((r: any) => r.userId === wallet.toLowerCase())
                            .map((res: any) => (
                              <div key={res.userId} className="bg-neutral-900/50 border border-neutral-900 rounded-2xl p-4 grid grid-cols-3 gap-4">
                                <div className="text-center border-r border-neutral-850">
                                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">SQUAD SCORE</p>
                                  <p className="text-lg font-black text-neutral-200 mt-1">{res.score} pts</p>
                                </div>
                                <div className="text-center border-r border-neutral-850">
                                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Z-SCORE (TANH)</p>
                                  <p className="text-lg font-black text-blue-400 mt-1">{res.zScore >= 0 ? '+' : ''}{res.zScore.toFixed(2)}</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">NET PAYOUT</p>
                                  <p className={`text-lg font-black mt-1 ${res.netProfit >= 0 ? 'text-[#00ff55]' : 'text-red-500'}`}>
                                    {res.netProfit >= 0 ? '+' : ''}{res.netProfit.toFixed(4)} OKB
                                  </p>
                                </div>
                              </div>
                            ))}

                          {/* Detail summary */}
                          <div className="bg-neutral-900/30 rounded-2xl p-4 flex flex-col gap-2 text-xs">
                            <div className="flex justify-between text-neutral-500">
                              <span>Redistribution Mean Score:</span>
                              <span className="font-bold text-neutral-300">{simulationResult.nrpsResult?.mean.toFixed(1)} pts</span>
                            </div>
                            <div className="flex justify-between text-neutral-500">
                              <span>Redistribution Std Dev:</span>
                              <span className="font-bold text-neutral-300">{simulationResult.nrpsResult?.stdDev.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-neutral-500">
                              <span>Total Matchday Pool:</span>
                              <span className="font-mono font-bold text-[#00ff55]">{simulationResult.nrpsResult?.totalPool.toFixed(4)} OKB</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Show last matchday history or standings */
                      <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-5 flex flex-col gap-4">
                        <h3 className="text-xs font-black tracking-wider text-neutral-400 uppercase">Country Standings (Group Stage A-L)</h3>
                        <div className="overflow-x-auto max-h-[350px]">
                          <table className="w-full text-xs text-left text-neutral-400">
                            <thead className="bg-neutral-900 text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                              <tr>
                                <th className="px-4 py-3">Rank</th>
                                <th className="px-4 py-3">Country</th>
                                <th className="px-4 py-3 text-center">W-D-L</th>
                                <th className="px-4 py-3 text-center">GD</th>
                                <th className="px-4 py-3 text-center">Points</th>
                                <th className="px-4 py-3 text-center">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {[...standings]
                                .sort((a, b) => {
                                  if (b.points !== a.points) return b.points - a.points;
                                  return (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst);
                                })
                                .map((c, idx) => {
                                  const country = seedData.countries.find(ct => ct.id === c.countryId);
                                  const isActive = activeCountries.includes(c.countryId);
                                  
                                  return (
                                    <tr key={c.countryId} className="border-b border-neutral-900/60 hover:bg-neutral-900/20">
                                      <td className="px-4 py-3 font-mono font-bold">{idx + 1}</td>
                                      <td className="px-4 py-3 flex items-center gap-2 font-bold text-neutral-200">
                                        <span>{country?.flag}</span>
                                        <span>{country?.name}</span>
                                      </td>
                                      <td className="px-4 py-3 text-center">{c.wins}-{c.draws}-{c.losses}</td>
                                      <td className="px-4 py-3 text-center">{c.goalsFor - c.goalsAgainst}</td>
                                      <td className="px-4 py-3 text-center font-bold text-neutral-200">{c.points}</td>
                                      <td className="px-4 py-3 text-center">
                                        <span className="relative group inline-block">
                                          <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase cursor-help transition-all ${isActive ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                                            {isActive ? 'Active' : 'OUT'}
                                          </span>
                                          {/* Custom Tooltip */}
                                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 hidden group-hover:block bg-neutral-950 border border-neutral-800 text-[10px] text-neutral-400 p-2.5 rounded-xl shadow-xl z-50 text-center leading-normal pointer-events-none">
                                            {isActive 
                                              ? "This country is still competing. Players from this country can score points." 
                                              : "This country has been eliminated from the tournament. Players from this country will no longer score points."
                                            }
                                            {/* Tooltip arrow */}
                                            <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-950"></span>
                                          </span>
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: Historical Matchdays list */}
                  <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
                    <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-5 flex flex-col gap-4">
                      <h3 className="text-sm font-black tracking-wider text-neutral-300 uppercase">Simulator Logs</h3>
                      
                      <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
                        {matchdayHistory.map(h => (
                          <div key={h.matchday} className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex flex-col gap-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-black text-neutral-200 uppercase">Matchday {h.matchday}</span>
                              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-bold">Simulated</span>
                            </div>
                            
                            {/* Payout sum */}
                            <div className="text-xs text-neutral-500 flex justify-between">
                              <span>User Score:</span>
                              <span className="font-bold text-neutral-300">
                                {h.nrpsResult?.userResults.find((r: any) => r.userId === wallet.toLowerCase())?.score || 0} pts
                              </span>
                            </div>
                            <div className="text-xs text-neutral-500 flex justify-between">
                              <span>Net Payout:</span>
                              <span className={`font-bold ${h.nrpsResult?.userResults.find((r: any) => r.userId === wallet.toLowerCase())?.netProfit >= 0 ? 'text-[#00ff55]' : 'text-red-500'}`}>
                                {h.nrpsResult?.userResults.find((r: any) => r.userId === wallet.toLowerCase())?.netProfit.toFixed(4) || '0.0000'} OKB
                              </span>
                            </div>

                            <button
                              onClick={() => setActiveResultsMatchday(h.matchday)}
                              className="w-full mt-2 bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-300 font-black py-2 rounded-xl text-[10px] flex items-center justify-center gap-1.5 transition cursor-pointer uppercase"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              View Results
                            </button>
                          </div>
                        ))}

                        {matchdayHistory.length === 0 && (
                          <div className="py-10 text-center text-xs text-neutral-500 font-bold">
                            No matchdays simulated yet.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: LEADERBOARD & LEDGER */}
              {activeTab === 'leaderboard' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start min-h-0">
                  
                  {/* Left Column: Ledger / Staking overview */}
                  <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
                    <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-6 flex flex-col gap-6 shadow-xl">
                      
                      {/* Ledger Summary */}
                      <div>
                        <h3 className="text-sm font-black tracking-wider text-neutral-300 uppercase mb-4">HCLP Ledger Overview</h3>
                        <div className="flex flex-col gap-3">
                          <LedgerRow label="Staked Principal (Locked)" val={`${lockedPrincipal.toFixed(4)} OKB`} desc="Fully refundable after MD 7" />
                          <LedgerRow label="Withdrawable Profits" val={`${withdrawableProfit.toFixed(4)} OKB`} desc="Earned via NRPS rankings" />
                          <LedgerRow label="Wallet OKB Balance" val={`${balanceOKB.toFixed(4)} OKB`} desc="Native X Layer gas/utility token" />
                        </div>
                      </div>

                      {/* Web3 Faucet & Withdrawal Buttons */}
                      <div className="flex flex-col gap-2 border-t border-neutral-900 pt-5">
                        {/* Faucet Link */}
                        <a 
                          href="https://www.okx.com/explorer/xlayer-testnet"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 text-neutral-200 font-bold py-3 rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer transition text-center"
                        >
                          <Download className="w-4.5 h-4.5 text-neutral-400" />
                          GET TESTNET OKB (EXTERNAL FAUCET)
                        </a>
                        
                        {/* Withdraw Profit */}
                        <button 
                          onClick={() => dispatchAction('withdrawProfit')}
                          disabled={txLoading || withdrawableProfit < 0.0625}
                          className="bg-gradient-to-r from-emerald-500 to-[#00ff55] disabled:opacity-30 disabled:from-neutral-900 disabled:to-neutral-900 disabled:text-neutral-500 disabled:border disabled:border-neutral-850 disabled:cursor-not-allowed text-black font-black py-3 rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer transition shadow-lg shadow-emerald-500/5"
                        >
                          {txLoading && txAction === 'withdrawProfit' ? (
                            <div className="w-4.5 h-4.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <TrendingUp className="w-4.5 h-4.5" />
                          )}
                          {txLoading && txAction === 'withdrawProfit' ? "WITHDRAWING..." : "WITHDRAW PROFIT (MIN 0.0625 OKB)"}
                        </button>
                        
                        {/* Refund Principal */}
                        <button 
                          onClick={() => dispatchAction('withdrawPrincipal')}
                          disabled={txLoading || !epochEnded || lockedPrincipal <= 0}
                          className="bg-neutral-900 hover:bg-neutral-850 border border-neutral-850 hover:border-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed text-neutral-200 font-bold py-3 rounded-2xl text-xs flex items-center justify-center gap-2 cursor-pointer transition"
                        >
                          {txLoading && txAction === 'withdrawPrincipal' ? (
                            <div className="w-4.5 h-4.5 border-2 border-neutral-200 border-t-transparent rounded-full animate-spin"></div>
                          ) : (
                            <RotateCcw className="w-4.5 h-4.5 text-neutral-400" />
                          )}
                          {txLoading && txAction === 'withdrawPrincipal' ? "REFUNDING..." : `WITHDRAW PRINCIPAL (${lockedPrincipal.toFixed(4)} OKB)`}
                        </button>
                      </div>

                      {/* Note */}
                      <div className="bg-neutral-900/30 rounded-2xl p-4 flex gap-3 text-[10px] text-neutral-500 leading-relaxed">
                        <Info className="w-4.5 h-4.5 text-neutral-500 flex-shrink-0 mt-0.5" />
                        <p>
                          The **Hybrid Capital Lock + Profit (HCLP)** ensures your staked principal (80% of deposit) is safe and returned fully upon tournament completion. Only the non-refundable entry fee (20% of deposit) goes into matchday prize pools. Profits are claimable once they exceed the minimum limit (0.0625 OKB).
                        </p>
                      </div>

                    </div>
                  </div>

                  {/* Right Column: Leaderboard list */}
                  <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6">
                    <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-5 flex flex-col gap-4">
                      <h3 className="text-sm font-black tracking-wider text-neutral-300 uppercase">Competitor Leaderboard</h3>
                      
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left text-neutral-400">
                          <thead className="bg-neutral-900 text-[10px] font-bold tracking-wider text-neutral-500 uppercase">
                            <tr>
                              <th 
                                onClick={() => handleSort('rank')}
                                className="px-4 py-3 cursor-pointer hover:text-neutral-200 select-none"
                              >
                                Rank {leaderboardSortField === 'rank' ? (leaderboardSortAsc ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => handleSort('name')}
                                className="px-4 py-3 cursor-pointer hover:text-neutral-200 select-none"
                              >
                                Name {leaderboardSortField === 'name' ? (leaderboardSortAsc ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => handleSort('locked')}
                                className="px-4 py-3 text-center cursor-pointer hover:text-neutral-200 select-none"
                              >
                                Amount Locked (OKB) {leaderboardSortField === 'locked' ? (leaderboardSortAsc ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => handleSort('latestScore')}
                                className="px-4 py-3 text-center cursor-pointer hover:text-neutral-200 select-none whitespace-nowrap"
                              >
                                Current MD Score {leaderboardSortField === 'latestScore' ? (leaderboardSortAsc ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => handleSort('score')}
                                className="px-4 py-3 text-center cursor-pointer hover:text-neutral-200 select-none whitespace-nowrap"
                              >
                                Total Score {leaderboardSortField === 'score' ? (leaderboardSortAsc ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => handleSort('pnl')}
                                className="px-4 py-3 text-center cursor-pointer hover:text-neutral-200 select-none whitespace-nowrap"
                              >
                                MD PnL {leaderboardSortField === 'pnl' ? (leaderboardSortAsc ? '▲' : '▼') : ''}
                              </th>
                              <th 
                                onClick={() => handleSort('totalPnl')}
                                className="px-4 py-3 text-center cursor-pointer hover:text-neutral-200 select-none whitespace-nowrap"
                              >
                                Total PnL {leaderboardSortField === 'totalPnl' ? (leaderboardSortAsc ? '▲' : '▼') : ''}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedLeaderboard.map((item, idx) => {
                              const isMe = item.wallet === wallet.toLowerCase();
                              // Find actual rank based on sorted by totalScore
                              const originalRank = [...leaderboard]
                                .sort((a, b) => b.totalScore - a.totalScore)
                                .findIndex(u => u.wallet === item.wallet) + 1;
                              return (
                                <tr 
                                  key={item.wallet} 
                                  ref={isMe ? myRowRef : null}
                                  className={`border-b border-neutral-900/60 hover:bg-neutral-900/10 ${
                                    isMe 
                                      ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-2 border-l-amber-500 shadow-[inset_0_0_12px_rgba(245,158,11,0.05)]' 
                                      : ''
                                  }`}
                                >
                                  <td className="px-4 py-3 font-mono font-bold">
                                    {originalRank === 1 ? '🥇' : originalRank === 2 ? '🥈' : originalRank === 3 ? '🥉' : originalRank}
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex flex-col">
                                      <span className={`font-bold flex items-center gap-1.5 ${isMe ? 'text-amber-400' : 'text-neutral-200'}`}>
                                        {item.name} {isMe ? '(You)' : ''}
                                        {item.hasSquad && (
                                          <span className="w-1.5 h-1.5 rounded-full bg-[#00ff55]" title="Squad Submitted"></span>
                                        )}
                                      </span>
                                      <span className="text-[10px] font-mono text-neutral-500">
                                        {item.wallet.substring(0, 6)}...{item.wallet.substring(36)}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-center font-mono font-bold text-neutral-300">
                                    {(item.lockedCapital !== undefined ? item.lockedCapital : 0.0).toFixed(4)} OKB
                                  </td>
                                  <td className="px-4 py-3 text-center font-bold text-neutral-300">
                                    {item.latestScore !== undefined ? item.latestScore : 0} pts
                                  </td>
                                  <td className="px-4 py-3 text-center font-bold text-neutral-200">
                                    {item.totalScore} pts
                                  </td>
                                  <td className={`px-4 py-3 text-center font-mono font-bold whitespace-nowrap ${getPnLColorClass(item.latestPnL)}`}>
                                    {formatPnL(item.latestPnL)}
                                  </td>
                                  <td className={`px-4 py-3 text-center font-mono font-bold whitespace-nowrap ${getPnLColorClass(item.totalNetProfit)}`}>
                                    {formatPnL(item.totalNetProfit)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Floating Sticky Badge for Active User's Leaderboard position */}
                  {!isMyRowVisible && myRank > 0 && activeTab === 'leaderboard' && (
                    <div 
                      onClick={() => {
                        myRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                      className="fixed bottom-6 right-6 z-45 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-600 text-black px-4 py-2.5 rounded-2xl font-black text-xs tracking-wider uppercase shadow-[0_8px_30px_rgb(245,158,11,0.3)] border border-amber-400/40 hover:from-amber-400 hover:to-yellow-500 active:scale-95 transition-all duration-200 cursor-pointer flex items-center gap-2 group"
                    >
                      <Trophy className="w-4 h-4 text-black group-hover:scale-110 transition-transform duration-200" />
                      <span>Your Position: #{myRank}</span>
                    </div>
                  )}

                </div>
              )}

            </div>
          </>
        )}

      {/* Global Loading Spinner Overlay (Block 6.3) */}
      {(walletConnecting || networkSwitching || (txLoading && txAction === 'deposit') || simulationLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-8 max-w-sm w-full flex flex-col items-center justify-center gap-4 text-center shadow-2xl">
            {/* Spinner */}
            <div className="w-12 h-12 border-4 border-[#00ff55]/20 border-t-[#00ff55] rounded-full animate-spin"></div>
            <h4 className="text-sm font-black text-neutral-200 uppercase tracking-wider">
              {walletConnecting && "Connecting Wallet..."}
              {networkSwitching && "Switching to X Layer..."}
              {txLoading && txAction === 'deposit' && "Confirming on X Layer..."}
              {simulationLoading && `Simulating Matchday ${currentMatchday}...`}
            </h4>
            <p className="text-xs text-neutral-500 leading-normal">
              {walletConnecting && "Please approve the connection request in your wallet extension."}
              {networkSwitching && "Please confirm the network switch in your wallet extension."}
              {txLoading && txAction === 'deposit' && "Waiting for block confirmation on X Layer Testnet."}
              {simulationLoading && "Generating match scores and calculating NRPS payouts."}
            </p>
          </div>
        </div>
      )}

      {/* Wallet Connect Modal (Block 1.1) */}
      {showConnectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-6 max-w-sm w-full flex flex-col gap-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowConnectModal(false)}
              className="absolute right-4 top-4 text-neutral-500 hover:text-neutral-300 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center flex flex-col items-center gap-2">
              <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-full text-[#00ff55]">
                <Wallet className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black tracking-tight text-neutral-200">Connect a Wallet</h3>
              <p className="text-xs text-neutral-500">Select your preferred Web3 wallet. OKX Wallet is recommended on X Layer.</p>
            </div>

            <div className="flex flex-col gap-3">
              {/* OKX Wallet */}
              <button
                onClick={() => connectRealWallet('okx')}
                className="flex items-center justify-between bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-4 transition text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-black p-1.5 rounded-xl border border-neutral-800 text-[#00ff55] font-black text-xs font-mono w-8 h-8 flex items-center justify-center">
                    OKX
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-neutral-200 group-hover:text-white transition">OKX Wallet</h4>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Preferred default wallet</p>
                  </div>
                </div>
                {typeof window !== 'undefined' && (window as any).okxwallet && (
                  <span className="bg-[#00ff55]/10 text-[#00ff55] text-[9px] font-black uppercase px-2 py-0.5 rounded border border-[#00ff55]/30">
                    Detected
                  </span>
                )}
              </button>

              {/* MetaMask */}
              <button
                onClick={() => connectRealWallet('metamask')}
                className="flex items-center justify-between bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-2xl p-4 transition text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-black p-1.5 rounded-xl border border-neutral-800 text-amber-500 font-black text-xs font-mono w-8 h-8 flex items-center justify-center">
                    MM
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-neutral-200 group-hover:text-white transition">MetaMask</h4>
                    <p className="text-[10px] text-neutral-500 mt-0.5">Standard injected wallet</p>
                  </div>
                </div>
              </button>
            </div>

            {/* Install Help */}
            {typeof window !== 'undefined' && !(window as any).okxwallet && (
              <div className="text-center pt-2">
                <a 
                  href="https://www.okx.com/web3" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-[10px] font-bold text-[#00ff55] hover:underline"
                >
                  Install OKX Wallet Extension &rarr;
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Squad Validation Modal */}
      {showValidationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-6 max-w-md w-full flex flex-col gap-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setShowValidationModal(false)}
              className="absolute right-4 top-4 text-neutral-500 hover:text-neutral-300 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center flex flex-col items-center gap-2">
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-full text-red-500">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black tracking-tight text-neutral-200">Cannot Lock Squad</h3>
              <p className="text-xs text-neutral-500">Your squad does not meet all tournament regulations. Please address the errors below.</p>
            </div>


            <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
              {squadValidationErrors.map((err, idx) => (
                <div key={idx} className="bg-neutral-900/50 border border-neutral-900 rounded-xl p-3 flex gap-2 text-xs text-neutral-300 leading-normal">
                  <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <span>{err}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowValidationModal(false)}
              className="w-full bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-200 font-black py-3 rounded-2xl text-xs transition duration-200 mt-2 cursor-pointer"
            >
              Fix Issues
            </button>
          </div>
        </div>
      )}

      {/* Eliminated Players Notification Modal */}
      {eliminationNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-6 max-w-sm w-full flex flex-col gap-5 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setEliminationNotification(null)}
              className="absolute right-4 top-4 text-neutral-500 hover:text-neutral-300 transition"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <div className="text-center flex flex-col items-center gap-2">
              <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-full text-amber-500">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black tracking-tight text-neutral-200">Players Eliminated</h3>
              <p className="text-xs text-neutral-400 leading-relaxed mt-1">
                <span className="font-bold text-neutral-200">{eliminationNotification.removedCount} players</span> in your squad belong to eliminated countries and have been auto-removed. 
                Your budget has been refunded. You now have <span className="font-bold text-[#00ff55] font-mono">${eliminationNotification.remainingBudget.toFixed(1)}M</span> available to draft replacement players from active countries.
              </p>
            </div>

            <button
              onClick={() => setEliminationNotification(null)}
              className="w-full bg-[#00ff55] hover:bg-[#02e04c] text-black font-black py-3 rounded-2xl text-xs transition duration-200 mt-2 cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              Draft Replacements
            </button>
          </div>
        </div>
      )}

      {/* Matchday Results Modal (Block 4.2) */}
      {activeResultsMatchday !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-neutral-950 border border-neutral-900 rounded-3xl p-6 max-w-2xl w-full flex flex-col gap-5 shadow-2xl relative my-8 animate-in fade-in zoom-in-95 duration-200">
            <button 
              onClick={() => setActiveResultsMatchday(null)}
              className="absolute right-4 top-4 text-neutral-500 hover:text-neutral-300 transition cursor-pointer"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Modal Header */}
            <div className="text-center border-b border-neutral-900 pb-4">
              <h3 className="text-lg font-black tracking-wider text-neutral-200 uppercase">
                Matchday {activeResultsMatchday} Results
              </h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Detailed scores, rankings, payouts, and player performances.
              </p>
            </div>

            {/* Modal Content Tabs/Grid */}
            {(() => {
              const selectedHistory = matchdayHistory.find(h => h.matchday === activeResultsMatchday);
              if (!selectedHistory) {
                return (
                  <div className="py-20 text-center text-xs text-neutral-500 font-bold">
                    Loading matchday data...
                  </div>
                );
              }

              const userNrpResult = selectedHistory.nrpsResult?.userResults.find((r: any) => r.userId === wallet.toLowerCase());
              const userRank = selectedHistory.nrpsResult ? 
                [...selectedHistory.nrpsResult.userResults]
                  .sort((a, b) => b.score - a.score)
                  .findIndex((r: any) => r.userId === wallet.toLowerCase()) + 1 : 
                0;

              const topPerformers = getTopPerformers(selectedHistory);

              const userMdHistory = userHistory.find((h: any) => h.matchday === activeResultsMatchday);
              const userSquad = userMdHistory?.squad;

              const starterPlayers = userSquad ? userSquad.starters.map((id: number | null) => id ? playerMap.get(id) : null).filter((p: any): p is Player => !!p) : [];
              const subPlayers = userSquad ? userSquad.subs.map((id: number | null) => id ? playerMap.get(id) : null).filter((p: any): p is Player => !!p) : [];
              const autoSubResult = userSquad ? performAutoSubstitutions(starterPlayers, subPlayers, selectedHistory.playerStats) : null;
              const finalStarters = autoSubResult ? autoSubResult.finalStarters : [];
              const finalStartersSet = new Set(finalStarters.map((p: Player) => p.id));

              const breakdown = userSquad ? calculateTeamScore(userSquad, allPlayers, selectedHistory.playerStats) : null;
              const finalSubs = userSquad ? userSquad.subs.map((id: number | null) => id ? playerMap.get(id) : null).filter((p: any): p is Player => !!p) : [];

              return (
                <div className="flex flex-col gap-5 max-h-[70vh] overflow-y-auto pr-1">
                  {/* 1. User Summary Row */}
                  <div className="grid grid-cols-3 gap-3 bg-neutral-900/30 border border-neutral-900 p-4 rounded-2xl text-center">
                    <div>
                      <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">MD Rank</p>
                      <p className="text-lg font-black text-neutral-200 mt-0.5">#{userRank || '-'} / 16</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">MD Score</p>
                      <p className="text-lg font-black text-[#00ff55] mt-0.5">{userNrpResult?.score || 0} pts</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-neutral-500 uppercase tracking-widest">Net Payout</p>
                      <p className={`text-lg font-black mt-0.5 ${userNrpResult?.netProfit >= 0 ? 'text-[#00ff55]' : 'text-red-400'}`}>
                        {userNrpResult?.netProfit >= 0 ? '+' : ''}{userNrpResult?.netProfit?.toFixed(4) || '0.0000'} OKB
                      </p>
                    </div>
                  </div>

                  {/* 2. Match Scores Grid */}
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-black tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                      Match Scores
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {selectedHistory.matches?.map((m: any, idx: number) => {
                        const teamA = getCountryInfo(m.teamAId);
                        const teamB = getCountryInfo(m.teamBId);
                        return (
                          <div key={idx} className="bg-neutral-900/40 border border-neutral-900 rounded-xl p-3 flex justify-between items-center text-xs">
                            <div className="flex items-center gap-1.5 w-[42%]">
                              <span className="text-base flex-shrink-0">{teamA.flag}</span>
                              <span className="font-bold text-neutral-300 truncate">{teamA.name}</span>
                            </div>
                            <div className="flex items-center justify-center gap-2 bg-neutral-950 border border-neutral-850 px-2.5 py-1 rounded-lg font-mono font-black text-neutral-200 text-xs w-[16%]">
                              <span>{m.scoreA}</span>
                              <span className="text-neutral-600">-</span>
                              <span>{m.scoreB}</span>
                            </div>
                            <div className="flex items-center gap-1.5 w-[42%] justify-end text-right">
                              <span className="font-bold text-neutral-300 truncate">{teamB.name}</span>
                              <span className="text-base flex-shrink-0">{teamB.flag}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 3. Top Scorers & Newly Eliminated Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Top Scorers */}
                    <div className="flex flex-col gap-2.5">
                      <h4 className="text-xs font-black tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-[#00ff55]" />
                        Top Performers
                      </h4>
                      <div className="flex flex-col gap-2">
                        {topPerformers.map(({ player, score }: any) => {
                          const country = getCountryInfo(player.countryId);
                          return (
                            <div key={player.id} className="bg-neutral-900/40 border border-neutral-900 rounded-xl p-3 flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-base">{country.flag}</span>
                                <div>
                                  <p className="font-bold text-neutral-200">{player.name}</p>
                                  <span className="text-[9px] bg-neutral-850 text-neutral-400 px-1 py-0.5 rounded font-black tracking-wider uppercase mt-0.5 inline-block">{player.position}</span>
                                </div>
                              </div>
                              <span className="font-mono font-black text-[#00ff55]">{score} pts</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Eliminated Countries */}
                    <div className="flex flex-col gap-2.5">
                      <h4 className="text-xs font-black tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                        Countries Knocked Out
                      </h4>
                      <div className="bg-neutral-900/40 border border-neutral-900 rounded-2xl p-4 flex flex-col gap-2 justify-center flex-1">
                        {selectedHistory.eliminatedCountries && selectedHistory.eliminatedCountries.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {selectedHistory.eliminatedCountries.map((cId: string) => {
                              const c = getCountryInfo(cId);
                              return (
                                <span key={cId} className="flex items-center gap-1.5 bg-neutral-900 border border-neutral-850 text-neutral-300 px-2.5 py-1.5 rounded-xl text-xs font-bold">
                                  <span>{c.flag}</span>
                                  <span>{c.name}</span>
                                </span>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-neutral-500 font-bold text-center py-6">
                            No countries eliminated in this round.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 4. User's Squad Breakdown */}
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-black tracking-wider text-neutral-400 uppercase flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-neutral-400" />
                      User Squad Breakdown
                    </h4>

                    {breakdown ? (
                      <div className="border border-neutral-900 rounded-2xl overflow-hidden text-xs">
                        {/* Table Header */}
                        <div className="bg-neutral-950 border-b border-neutral-900 p-3 grid grid-cols-12 font-black text-neutral-400 text-[10px] tracking-wider uppercase">
                          <div className="col-span-6">Player</div>
                          <div className="col-span-4 text-center">Stats</div>
                          <div className="col-span-2 text-right">Points</div>
                        </div>

                        {/* Starters */}
                        <div className="flex flex-col divide-y divide-neutral-900 bg-neutral-900/10">
                          {finalStarters.map((player: Player) => {
                            const country = getCountryInfo(player.countryId);
                            const stats = selectedHistory.playerStats[player.id];
                            const pointsInfo = breakdown.playerScores[player.id] || { basePoints: 0, multiplier: 1, finalPoints: 0 };
                            return (
                              <div key={player.id} className="p-3 grid grid-cols-12 items-center">
                                <div className="col-span-6 flex items-center gap-2">
                                  <span className="text-base flex-shrink-0">{country.flag}</span>
                                  <div>
                                    <div className="flex items-center gap-1">
                                      <span className="font-bold text-neutral-200">{player.name}</span>
                                      {player.id === breakdown.activeCaptainId && (
                                        <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1 rounded font-black tracking-wider">C</span>
                                      )}
                                    </div>
                                    <span className="text-[9px] bg-neutral-850 text-neutral-400 px-1 py-0.5 rounded font-black tracking-wider uppercase mt-0.5 inline-block">{player.position}</span>
                                  </div>
                                </div>
                                <div className="col-span-4 flex justify-center">
                                  {renderPlayerStatsBadges(player, stats)}
                                </div>
                                <div className="col-span-2 text-right font-bold text-neutral-200 font-mono">
                                  {pointsInfo.finalPoints} pts
                                  {pointsInfo.multiplier === 2 && (
                                    <span className="text-[9px] text-neutral-500 block">({pointsInfo.basePoints} x 2)</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Substitutions Header */}
                        {breakdown.substitutionsMade.length > 0 && (
                          <div className="bg-neutral-950 border-y border-neutral-900 p-2.5 text-[9px] font-black text-amber-500 uppercase tracking-widest text-center">
                            🔄 Auto-Substitutions Processed
                          </div>
                        )}

                        {breakdown.substitutionsMade.map((sub: any, idx: number) => {
                          const pOut = playerMap.get(sub.out);
                          const pIn = playerMap.get(sub.in);
                          return (
                            <div key={idx} className="bg-neutral-900/30 p-2.5 flex items-center justify-center gap-2 text-[10px] font-bold text-neutral-400 border-b border-neutral-900">
                              <span>🔴 {pOut?.name} (0 mins)</span>
                              <span className="text-neutral-600">→</span>
                              <span className="text-[#00ff55]">🟢 {pIn?.name}</span>
                            </div>
                          );
                        })}

                        {/* Unused Bench */}
                        {finalSubs.filter((p: Player) => !finalStartersSet.has(p.id)).length > 0 && (
                          <>
                            <div className="bg-neutral-950 border-y border-neutral-900 p-2.5 text-[9px] font-black text-neutral-500 uppercase tracking-widest">
                              Bench (Unused)
                            </div>
                            <div className="flex flex-col divide-y divide-neutral-900 bg-neutral-950/20">
                              {finalSubs.filter((p: Player) => !finalStartersSet.has(p.id)).map((player: Player) => {
                                const country = getCountryInfo(player.countryId);
                                const stats = selectedHistory.playerStats[player.id];
                                return (
                                  <div key={player.id} className="p-3 grid grid-cols-12 items-center opacity-60">
                                    <div className="col-span-6 flex items-center gap-2">
                                      <span className="text-base flex-shrink-0">{country.flag}</span>
                                      <div>
                                        <p className="font-bold text-neutral-300">{player.name}</p>
                                        <span className="text-[9px] bg-neutral-850 text-neutral-400 px-1 py-0.5 rounded font-black tracking-wider uppercase mt-0.5 inline-block">{player.position}</span>
                                      </div>
                                    </div>
                                    <div className="col-span-4 flex justify-center">
                                      {renderPlayerStatsBadges(player, stats)}
                                    </div>
                                    <div className="col-span-2 text-right font-bold text-neutral-400 font-mono">
                                      {(stats && calculatePlayerPoints(player.position, stats)) || 0} pts
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="bg-neutral-900/20 border border-neutral-900 rounded-2xl p-6 text-center text-xs text-neutral-500 font-bold">
                        Squad configuration not available for this matchday.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <button
              onClick={() => setActiveResultsMatchday(null)}
              className="w-full bg-[#00ff55] hover:bg-[#02e04c] text-black font-black py-3.5 rounded-2xl text-xs transition duration-200 mt-2 cursor-pointer shadow-lg shadow-emerald-500/10"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}

// Sub-components

interface PitchSlotProps {
  index: number;
  position: string;
  playerId: number | null;
  onRemove: (id: number) => void;
  onSelect: () => void;
  captainId: number | null;
  viceCaptainId: number | null;
  onSetRole?: (role: 'captain' | 'vice', id: number) => void;
  playerMap: Map<number, Player>;
}

function PitchSlot({ 
  index, position, playerId, onRemove, onSelect, 
  captainId, viceCaptainId, onSetRole, playerMap 
}: PitchSlotProps) {
  const p = playerId ? playerMap.get(playerId) : null;
  const isCaptain = captainId === playerId;
  const isViceCaptain = viceCaptainId === playerId;

  if (p) {
    const country = seedData.countries.find(c => c.id === p.countryId);
    return (
      <div className="relative flex flex-col items-center group w-16">
        {/* Card */}
        <div className="w-12 h-12 bg-neutral-900 border border-[#00ff55]/50 group-hover:border-[#00ff55] rounded-xl flex items-center justify-center font-black text-[#00ff55] shadow-lg shadow-emerald-500/10 relative transition duration-200">
          <span className="text-lg">{country?.flag}</span>
          
          {/* Captain / Vice Captain Indicators */}
          {isCaptain && (
            <span className="absolute -top-1.5 -right-1.5 bg-[#00ff55] text-black w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-black border border-black shadow">C</span>
          )}
          {isViceCaptain && (
            <span className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white w-4.5 h-4.5 rounded-full flex items-center justify-center text-[10px] font-black border border-black shadow">V</span>
          )}

          {/* Remove Button */}
          <button 
            onClick={() => onRemove(p.id)}
            className="absolute -bottom-1 -right-1 bg-red-500 hover:bg-red-600 text-white rounded-full w-4.5 h-4.5 flex items-center justify-center text-[8px] font-bold opacity-0 group-hover:opacity-100 transition duration-150 shadow"
            title="Remove Player"
          >
            ×
          </button>
        </div>

        {/* Name Label */}
        <p className="text-[9px] font-bold text-neutral-300 text-center w-20 truncate mt-1 bg-neutral-950/70 px-1 py-0.5 rounded border border-neutral-900 group-hover:border-neutral-800 transition">
          {p.name.split(" ").pop()}
        </p>
        <p className="text-[8px] font-bold text-[#00ff55]">${p.price.toFixed(1)}M</p>

        {/* Roles Setter Popover */}
        {onSetRole && (
          <div className="absolute top-full mt-1 bg-neutral-950 border border-neutral-850 p-1.5 rounded-lg flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition duration-150 z-10 shadow-xl pointer-events-none group-hover:pointer-events-auto">
            <button 
              onClick={() => onSetRole('captain', p.id)}
              className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition ${isCaptain ? 'bg-[#00ff55] text-black' : 'bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-neutral-200'}`}
            >
              C
            </button>
            <button 
              onClick={() => onSetRole('vice', p.id)}
              className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase transition ${isViceCaptain ? 'bg-blue-500 text-white' : 'bg-neutral-900 hover:bg-neutral-850 text-neutral-400 hover:text-neutral-200'}`}
            >
              V
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <button 
      onClick={onSelect}
      className="w-12 h-12 bg-neutral-900/60 hover:bg-neutral-900 border border-neutral-850 hover:border-neutral-700 border-dashed rounded-xl flex flex-col items-center justify-center text-neutral-500 hover:text-[#00ff55] transition duration-200 cursor-pointer"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider">{position}</span>
      <span className="text-sm font-light mt-0.5">+</span>
    </button>
  );
}

interface ValidationCheckProps {
  label: string;
  isValid: boolean;
  message: string;
}

function ValidationCheck({ label, isValid, message }: ValidationCheckProps) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-neutral-900/50">
      <span className="text-neutral-400 font-medium">{label}</span>
      <div className="text-right">
        <span className={`font-bold ${isValid ? 'text-[#00ff55]' : 'text-red-400'}`}>
          {isValid ? 'Passed' : 'Failed'}
        </span>
        <p className="text-[9px] text-neutral-500 font-bold mt-0.5">{message}</p>
      </div>
    </div>
  );
}

interface LedgerRowProps {
  label: string;
  val: string;
  desc: string;
}

function LedgerRow({ label, val, desc }: LedgerRowProps) {
  return (
    <div className="bg-neutral-900/50 border border-neutral-900 rounded-2xl p-4 flex items-center justify-between">
      <div>
        <h4 className="text-xs font-bold text-neutral-300">{label}</h4>
        <p className="text-[9px] text-neutral-500 font-bold mt-0.5">{desc}</p>
      </div>
      <span className="text-sm font-black text-neutral-200">{val}</span>
    </div>
  );
}

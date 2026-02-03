import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";

// Contract addresses and their respective deployment blocks for historical lookup
const contracts: any = {
  [CHAIN.ARBITRUM]: {
    factory: "0xEDA164585a5FF8c53c48907bD102A1B593bd17eF",
    fromBlock: 356832883, 
  },
  [CHAIN.ETHEREUM]: {
    factory: "0x7c01A2a7e9012A98760984F2715A4517AD2c549A",
    fromBlock: 24339672, 
  },
  [CHAIN.BASE]: {
    factory: "0xEDA164585a5FF8c53c48907bD102A1B593bd17eF",
    fromBlock: 41147622, 
  },
};

// Event ABIs based on the smart contract implementation
const abi = [
  "event GameDeposit(uint256 indexed gameId, address indexed player, uint256 indexed amount)",
  "event GameResultsRecorded(uint256 indexed gameId, address[] winners, address loser, uint256 amountPerWinner)",
  "event ReferralCommissionPaid(address indexed referrer, uint256 indexed gameId, uint256 amount)"
];

const iface = new ethers.Interface(abi);

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;
  const { factory, fromBlock: contractStartBlock } = contracts[chain];
  
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  // Helper function to safely parse logs and handle potential schema mismatches
  const parseLog = (log: any) => {
    try { 
      return iface.parseLog({ topics: [...log.topics], data: log.data }); 
    } catch (e) { 
      return null; 
    }
  };

  // --- 1. Daily Volume ---
  // We track all deposits made within the current 24h window
  const depositLogs = await getLogs({ 
    target: factory, 
    topic: iface.getEvent("GameDeposit")!.topicHash 
  });
  
  const depositsByGameId = new Map<string, bigint>();

  for (const log of depositLogs) {
    const parsed = parseLog(log);
    if (parsed) {
      const amount = BigInt(parsed.args.amount);
      const gameId = parsed.args.gameId.toString();
      dailyVolume.addGasToken(amount);
      
      // Store current day deposits to calculate fees if the game ends today
      depositsByGameId.set(gameId, (depositsByGameId.get(gameId) || 0n) + amount);
    }
  }

  // --- 2. Daily Fees & Protocol Revenue ---
  // Fees are realized only when a game is settled (GameResultsRecorded)
  const resultsLogs = await getLogs({ 
    target: factory, 
    topic: iface.getEvent("GameResultsRecorded")!.topicHash 
  });

  for (const log of resultsLogs) {
    const parsed = parseLog(log);
    if (!parsed) continue;

    const gameId = parsed.args.gameId.toString();

    // If the game started before today, we must fetch historical deposits 
    // to calculate the total pot and the resulting platform fee.
    if (!depositsByGameId.has(gameId)) {
      const currentBlock = await api.getBlock();
      const historicalLogs = await getLogs({
        target: factory,
        topic: iface.getEvent("GameDeposit")!.topicHash,
        fromBlock: contractStartBlock,
        toBlock: currentBlock,
      });

      for (const hLog of historicalLogs) {
        const hParsed = parseLog(hLog);
        if (hParsed && hParsed.args.gameId.toString() === gameId) {
          const val = BigInt(hParsed.args.amount);
          depositsByGameId.set(gameId, (depositsByGameId.get(gameId) || 0n) + val);
        }
      }
    }

    const totalPot = depositsByGameId.get(gameId);
    if (totalPot) {
      const winnersCount = BigInt(parsed.args.winners.length);
      const amountPerWinner = BigInt(parsed.args.amountPerWinner);
      const distributed = amountPerWinner * winnersCount;
      
      // Fee is the remainder of the pot after all winners are paid
      const fee = totalPot - distributed;
      
      if (fee > 0n) {
        dailyFees.addGasToken(fee);
        dailyRevenue.addGasToken(fee); // Initial revenue (referrals deducted later)
      }
    }
  }

  // --- 3. Referral Commission Deductions ---
  // Protocol revenue is net of referral payouts emitted in the same window
  const referralLogs = await getLogs({ 
    target: factory, 
    topic: iface.getEvent("ReferralCommissionPaid")!.topicHash 
  });

  for (const log of referralLogs) {
    const parsed = parseLog(log);
    if (parsed) {
      const refAmount = BigInt(parsed.args.amount);
      dailyRevenue.addGasToken(-refAmount);
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: { fetch, start: 1733529600 },
    [CHAIN.ETHEREUM]: { fetch, start: 1738108800 },
    [CHAIN.BASE]: { fetch, start: 1737504000 },
  },
  methodology: {
    Volume: "Total ETH stakes deposited by players into game rounds.",
    Fees: "Platform commission calculated as the difference between the total game pot and the total amount distributed to winners.",
    Revenue: "Net protocol earnings, calculated as total fees minus the on-chain referral bonuses paid out.",
  }
};

export default adapter;

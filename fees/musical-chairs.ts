import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { ethers } from "ethers";

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

const event_game_deposit = "event GameDeposit(uint256 indexed gameId, address indexed player, uint256 indexed amount)";
const event_game_results = "event GameResultsRecorded(uint256 indexed gameId, address[] winners, address loser, uint256 amountPerWinner)";

const iface = new ethers.Interface([event_game_deposit, event_game_results]);

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;
  const { factory, fromBlock } = contracts[chain];
  
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  // --- 1. Calculate Volume and map deposits by gameId ---
  const depositLogs = await getLogs({
    target: factory,
    topic: iface.getEvent("GameDeposit")?.topicHash,
    fromBlock,
    api: api,
  });

  const depositsByGameId = new Map<string, bigint>();
  for (const log of depositLogs) {
    const gameId = BigInt(log.topics[1]).toString();
    const amount = BigInt(log.topics[3]);
    dailyVolume.addGasToken(amount);

    const currentTotal = depositsByGameId.get(gameId) || 0n;
    depositsByGameId.set(gameId, currentTotal + amount);
  }

  // --- 2. Calculate Fees and Revenue from completed games ---
  const resultsLogs = await getLogs({
    target: factory,
    topic: iface.getEvent("GameResultsRecorded")?.topicHash,
    fromBlock,
    api: api,
  });

  for (const log of resultsLogs) {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsed) {
        const gameId = parsed.args.gameId.toString();
        const winnersCount = parsed.args.winners.length;
        const amountPerWinner = parsed.args.amountPerWinner;

        const totalPot = depositsByGameId.get(gameId);

        if (totalPot) {
            const distributed = BigInt(amountPerWinner) * BigInt(winnersCount);
            const fee = totalPot - distributed;

            if (fee >= 0) {
                dailyFees.addGasToken(fee);
                dailyRevenue.addGasToken(fee);
            }
        }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2025-07-12',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2026-01-29',
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: '2026-01-22',
    },
  },
  methodology: {
    Fees: "Fees are calculated as the total stakes collected minus the amount distributed to winners.",
    Revenue: "Revenue is the total fees collected. Referral payouts are treated as a protocol expense.",
  }
};

export default adapter;

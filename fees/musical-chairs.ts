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

// ABI событий для парсинга
const event_game_deposit = "event GameDeposit(uint256 indexed gameId, address indexed player, uint256 indexed amount)";
const event_game_results = "event GameResultsRecorded(uint256 indexed gameId, address[] winners, address loser, uint256 amountPerWinner)";
const event_referral_paid = "event ReferralCommissionPaid(address indexed referrer, uint256 indexed gameId, uint256 amount)";

const iface = new ethers.Interface([event_game_deposit, event_game_results, event_referral_paid]);

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, getFromBlock, getToBlock } = options;
  const { factory, fromBlock: contractStartBlock } = contracts[chain];
  
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();

  const fromBlock = await getFromBlock();
  const toBlock = await getToBlock();
  const startBlock = Math.max(fromBlock, contractStartBlock);

  // --- 1. Считаем Volume (все входящие депозиты) ---
  const depositLogs = await getLogs({
    target: factory,
    topic: iface.getEvent("GameDeposit")?.topicHash,
    fromBlock: startBlock,
    toBlock,
  });

  const depositsByGameId = new Map<string, bigint>();
  for (const log of depositLogs) {
    const gameId = BigInt(log.topics[1]).toString();
    const amount = BigInt(log.topics[3]); // amount проиндексирован в твоем контракте
    dailyVolume.addGasToken(amount);

    const currentTotal = depositsByGameId.get(gameId) || 0n;
    depositsByGameId.set(gameId, currentTotal + amount);
  }

  // --- 2. Считаем Fees (удержанная комиссия платформы) ---
  const resultsLogs = await getLogs({
    target: factory,
    topic: iface.getEvent("GameResultsRecorded")?.topicHash,
    fromBlock: startBlock,
    toBlock,
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
          // Revenue изначально равна Fees, далее вычтем бонусы
          dailyRevenue.addGasToken(fee);
        }
      }
    }
  }

  // --- 3. Считаем Referral Bonuses (расходы на партнеров) ---
  const referralLogs = await getLogs({
    target: factory,
    topic: iface.getEvent("ReferralCommissionPaid")?.topicHash,
    fromBlock: startBlock,
    toBlock,
  });

  for (const log of referralLogs) {
    const parsed = iface.parseLog({ topics: [...log.topics], data: log.data });
    if (parsed) {
      const referralAmount = BigInt(parsed.args.amount);
      // Вычитаем бонусы из чистой прибыли протокола
      dailyRevenue.addGasToken(-referralAmount);
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
      start: 1733529600, 
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1738108800,
    },
    [CHAIN.BASE]: {
      fetch: fetch,
      start: 1737504000,
    },
  },
  methodology: {
    Volume: "Total ETH deposited by players into games.",
    Fees: "Total commissions collected by the protocol (difference between total stakes and payouts).",
    Revenue: "Net protocol income after deducting referral commission payouts.",
  }
};

export default adapter;

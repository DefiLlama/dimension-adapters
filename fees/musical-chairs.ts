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
  // Исправлено: добавляем getFromBlock вместо обращения к несуществующему api.fromBlock
  const { createBalances, getLogs, chain, getFromBlock } = options;
  const { factory, fromBlock: contractStartBlock } = contracts[chain];
  
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  
  // Получаем номер блока начала текущего дня (24h window)
  const dayStartBlock = await getFromBlock();

  const parseLog = (log: any) => {
    try { 
      return iface.parseLog({ topics: [...log.topics], data: log.data }); 
    } catch (e) { 
      return null; 
    }
  };

  // --- 1. Daily Volume ---
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
      
      depositsByGameId.set(gameId, (depositsByGameId.get(gameId) || 0n) + amount);
    }
  }

  // --- 2. Daily Fees & Protocol Revenue ---
  const resultsLogs = await getLogs({ 
    target: factory, 
    topic: iface.getEvent("GameResultsRecorded")!.topicHash 
  });

  // ОПТИМИЗАЦИЯ: Сначала собираем ID игр, начавшихся в прошлые дни
  const missingGameIds = new Set<string>();
  for (const log of resultsLogs) {
    const parsed = parseLog(log);
    if (parsed) {
      const gameId = parsed.args.gameId.toString();
      if (!depositsByGameId.has(gameId)) {
        missingGameIds.add(gameId);
      }
    }
  }

  // ОПТИМИЗАЦИЯ: Один запрос к истории вместо цикла внутри цикла
  if (missingGameIds.size > 0) {
    const historicalLogs = await getLogs({
      target: factory,
      topic: iface.getEvent("GameDeposit")!.topicHash,
      fromBlock: contractStartBlock,
      toBlock: dayStartBlock - 1, // Ищем депозиты строго ДО начала текущего дня
    });

    for (const hLog of historicalLogs) {
      const hParsed = parseLog(hLog);
      if (hParsed) {
        const hGameId = hParsed.args.gameId.toString();
        if (missingGameIds.has(hGameId)) {
          const val = BigInt(hParsed.args.amount);
          depositsByGameId.set(hGameId, (depositsByGameId.get(hGameId) || 0n) + val);
        }
      }
    }
  }

  // Теперь считаем комиссии, имея полные данные о депозитах (текущих + исторических)
  for (const log of resultsLogs) {
    const parsed = parseLog(log);
    if (!parsed) continue;

    const gameId = parsed.args.gameId.toString();
    const totalPot = depositsByGameId.get(gameId);
    
    if (totalPot) {
      const winnersCount = BigInt(parsed.args.winners.length);
      const amountPerWinner = BigInt(parsed.args.amountPerWinner);
      const distributed = amountPerWinner * winnersCount;
      const fee = totalPot - distributed;
      
      if (fee > 0n) {
        dailyFees.addGasToken(fee);
        dailyRevenue.addGasToken(fee);
      }
    }
  }

  // --- 3. Referral Commission Deductions ---
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

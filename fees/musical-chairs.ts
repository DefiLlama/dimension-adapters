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

  const parseLog = (log: any) => {
    try { return iface.parseLog({ topics: [...log.topics], data: log.data }); } 
    catch (e) { return null; }
  };

  // 1. Daily Volume
  const depositLogs = await getLogs({ target: factory, topic: iface.getEvent("GameDeposit")!.topicHash });
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

  // 2. Daily Fees (Settled Games)
  const resultsLogs = await getLogs({ target: factory, topic: iface.getEvent("GameResultsRecorded")!.topicHash });

  for (const log of resultsLogs) {
    const parsed = parseLog(log);
    if (!parsed) continue;

    const gameId = parsed.args.gameId.toString();

    if (!depositsByGameId.has(gameId)) {
      const historicalLogs = await getLogs({
        target: factory,
        topic: iface.getEvent("GameDeposit")!.topicHash,
        fromBlock: contractStartBlock,
        toBlock: api.fromBlock,
      });
      for (const hLog of historicalLogs) {
        const hParsed = parseLog(hLog);
        if (hParsed && hParsed.args.gameId.toString() === gameId) {
          depositsByGameId.set(gameId, (depositsByGameId.get(gameId) || 0n) + BigInt(hParsed.args.amount));
        }
      }
    }

    const totalPot = depositsByGameId.get(gameId);
    if (totalPot) {
      const distributed = BigInt(parsed.args.amountPerWinner) * BigInt(parsed.args.winners.length);
      const fee = totalPot - distributed;
      if (fee > 0n) {
        dailyFees.addGasToken(fee);
        dailyRevenue.addGasToken(fee);
      }
    }
  }

  // 3. Referral Deductions
  const referralLogs = await getLogs({ target: factory, topic: iface.getEvent("ReferralCommissionPaid")!.topicHash });
  for (const log of referralLogs) {
    const parsed = parseLog(log);
    if (parsed) dailyRevenue.addGasToken(-BigInt(parsed.args.amount));
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
    Volume: "Total ETH stakes deposited into game rounds.",
    Fees: "Platform commission (total stakes minus winner payouts) collected at the end of each game.",
    Revenue: "Net protocol income after subtracting referral commission payouts.",
  }
};

export default adapter;

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

const CONTRACTS = {
  EXCHANGE: [
    "0x8BC070BEdAB741406F4B1Eb65A72bee27894B689",
    "0x6beb5a40c032afc305961162d8204cda16decfa5",
    "0x365fb81bd4A24D6303cd2F19c349dE6894D8d58A",
    "0x8a289d458f5a134ba40015085a8f50ffb681b41d",
  ],
  FEE_MODULE: [
    "0xF1f8F5C641F20C48526269EF7DFF19172Efa9783",
    "0xFBC2259Abb3f01c019ecE1d0200eE673Bb7BA34f",
    "0xF2311C668aAA8dEc48D5da577d3018eb94b3132F",
    "0xd172f3fbabe763ee8e52d8b32421574236da6057",
  ]
};

const EVENTS = {
  FEE_CHARGED: "event FeeCharged(address indexed receiver, uint256 tokenId, uint256 amount)",
  FEE_REFUNDED: "event FeeRefunded(bytes32 indexed orderHash, address indexed to, uint256 id, uint256 refund, uint256 indexed feeCharged)"
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();


  const isUSDT = (id: any) => {
    const idStr = typeof id === 'bigint' ? id.toString() : String(id);
    return idStr === "0";
  };

  const processLogs = async (contracts: string[], eventAbi: string, processor: (log: any) => void) => {
    for (const contract of contracts) {
      const logs = await options.getLogs({
        target: contract,
        eventAbi,
      });
      logs.forEach(processor);
    }
  };

  await processLogs(
    CONTRACTS.EXCHANGE,
    EVENTS.FEE_CHARGED,
    (log: any) => {
      if (!log || log.tokenId === undefined || log.amount === undefined) return;
      if (isUSDT(log.tokenId)) {
        dailyFees.add(USDT_BSC, log.amount);
      }
    }
  );

  await processLogs(
    CONTRACTS.FEE_MODULE,
    EVENTS.FEE_REFUNDED,
    (log: any) => {
      if (!log || log.id === undefined || log.refund === undefined) return;
      if (isUSDT(log.id)) {
        dailyFees.add(USDT_BSC, -log.refund);
      }
    }
  );

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2024-12-10",
    },
  },
};

export default adapter;

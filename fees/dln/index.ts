import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const config: Record<string, { chainId: number, start: string }> = {
  [CHAIN.SOLANA]: {
    chainId: 7565164,
    start: '2023-03-31',
  },
  [CHAIN.ETHEREUM]: {
    chainId: 1,
    start: '2023-03-31',
  },
  [CHAIN.ARBITRUM]: {
    chainId: 42161,
    start: '2023-03-31',
  },
  [CHAIN.AVAX]: {
    chainId: 43114,
    start: '2023-03-31',
  },
  [CHAIN.BSC]: {
    chainId: 56,
    start: '2023-03-31',
  },
  [CHAIN.POLYGON]: {
    chainId: 137,
    start: '2023-03-31',
  },
  [CHAIN.LINEA]: {
    chainId: 59144,
    start: '2023-03-31',
  },
  [CHAIN.BASE]: {
    chainId: 8453,
    start: '2023-03-31',
  },
  [CHAIN.OPTIMISM]: {
    chainId: 10,
    start: '2023-03-31',
  },
  [CHAIN.FANTOM]: {
    chainId: 250,
    start: '2023-03-31',
  },
  [CHAIN.NEON]: {
    chainId: 100000001,
    start: '2023-03-31',
  },
  [CHAIN.XDAI]: {
    chainId: 100000002,
    start: '2023-03-31',
  },
  [CHAIN.METIS]: {
    chainId: 100000004,
    start: '2024-06-05',
  },
  [CHAIN.SONIC]: {
    chainId: 100000014,
    start: '2024-12-26',
  },
  [CHAIN.CRONOS_ZKEVM]: {
    chainId: 100000010,
    start: '2025-01-21',
  },
  [CHAIN.ABSTRACT]: {
    chainId: 100000017,
    start: '2025-01-27',
  },
  [CHAIN.BERACHAIN]: {
    chainId: 100000020,
    start: '2025-02-06',
  },
  [CHAIN.STORY]: {
    chainId: 100000013,
    start: '2025-02-13',
  },
  [CHAIN.HYPERLIQUID]: {
    chainId: 100000022,
    start: '2025-02-20',
  },
  [CHAIN.ZIRCUIT]: {
    chainId: 100000015,
    start: '2025-03-07',
  },
  [CHAIN.FLOW]: {
    chainId: 100000009,
    start: '2025-03-26',
  },
  [CHAIN.BOB]: {
    chainId: 100000021,
    start: '2025-04-03',
  },
  [CHAIN.MANTLE]: {
    chainId: 100000023,
    start: '2025-04-17',
  },
  [CHAIN.PLUME]: {
    chainId: 100000024,
    start: '2025-06-05',
  },
  [CHAIN.SEI]: {
    chainId: 100000027,
    start: '2025-07-01',
  },
  [CHAIN.SOPHON]: {
    chainId: 100000025,
    start: '2025-06-06',
  },
}

function pad(s: number) {
  return s < 10 ? "0" + s : s;
}

function formatTimestampAsDate(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

const prefetch = async (options: FetchOptions) => {
  const dateFrom = formatTimestampAsDate(options.startOfDay);
  const data = await fetchURL(`https://stats-api.dln.trade/api/Satistics/getDaily?dateFrom=${dateFrom}&dateTo=${dateFrom}`);
  return data.dailyData;
}

const fetchHoldersRevenue = async (options: FetchOptions) => {
  if (options.chain !== CHAIN.SOLANA){
    return '0'
  }
  const dateFrom = formatTimestampAsDate(options.startOfDay);
  const url = `https://treasury-api.debridge.foundation/reserves/accumulation?aggregationType=incremental&startDate=2024-01-01&endDate=${dateFrom}`;
  const data = await fetchURL(url);
  const holderRevenue = data.reduce((acc: number, item: any) => {
    if (item.date === dateFrom) {
      return acc + item.amount;
    }
    return acc;
  }, 0);
  console.log(dateFrom)
  const dailyHoldersRevenue = options.createBalances();
  dailyHoldersRevenue.addCGToken('debridge', holderRevenue);

  return dailyHoldersRevenue;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyDatas = options.preFetchedResults || [];

  let dailyFees = 0;
  const chainId = config[options.chain].chainId;
  for (const dailyData of dailyDatas) {
    if (dailyData.giveChainId.bigIntegerValue === chainId) {
      dailyFees += Number(dailyData.totalProtocolFeeUsd);
    }
  }
  // buyback started from 20th june 2025
  const dailyProtocolRevenue = options.startTimestamp <= 1750550400 ? dailyFees : '0';
  const dailyHoldersRevenue = await fetchHoldersRevenue(options);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};


const info = {
  methodology: {
    Fees: 'All fees paid by users for swap and bridge tokens via deBridge.',
    Revenue: 'Fees are distributed to deBridge protocol.',
    ProtocolRevenue: '0% of fee goes to protocol treasury from 20th june 2025.',
    HoldersRevenue: '100% protocol revenue is used for buyback(started from 20th june 2025).',
  }
}

const adapter: Adapter = {
  methodology: info.methodology,
  version: 1,
  adapter: Object.keys(config).reduce((acc, chain) => {
    acc[chain] = {
      fetch,
      start: config[chain].start,
    }
    return acc;
  }, {}),
  prefetch
};

export default adapter;

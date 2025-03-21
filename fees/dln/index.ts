import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const fetch = (chainId: number) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const dateFrom = formatTimestampAsDate(todaysTimestamp);
    const dateTo = dateFrom;
    const url = `https://stats-api.dln.trade/api/Satistics/getDaily?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const response = await fetchURL(url);
    const dailyDatas = response.dailyData;
    let fees = 0;
    for (const dailyData of dailyDatas) {
      if (dailyData.giveChainId.bigIntegerValue === chainId) {
        fees += Number(dailyData.totalProtocolFeeUsd);
      }
    }

    return {
      dailyFees: String(fees),
      dailyRevenue: String(fees),
      timestamp,
    } as FetchResultFees;
  };
};

function pad(s: number) {
  return s < 10 ? "0" + s : s;
}

function formatTimestampAsDate(timestamp: number) {
  const date = new Date(timestamp * 1000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}`;
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(1),
      start: '2023-03-31',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(42161),
      start: '2023-03-31',
    },
    [CHAIN.AVAX]: {
      fetch: fetch(43114),
      start: '2023-03-31',
    },
    [CHAIN.BSC]: {
      fetch: fetch(56),
      start: '2023-03-31',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(137),
      start: '2023-03-31',
    },
    [CHAIN.SOLANA]: {
      fetch: fetch(7565164),
      start: '2023-03-31',
    },
    [CHAIN.LINEA]: {
      fetch: fetch(59144),
      start: '2023-03-31',
    },
    [CHAIN.BASE]: {
      fetch: fetch(8453),
      start: '2023-03-31',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(10),
      start: '2023-03-31',
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(250),
      start: '2023-03-31',
    },
    [CHAIN.NEON]: {
      fetch: fetch(100000001),
      start: '2023-03-31',
    },
    [CHAIN.METIS]: {
      fetch: fetch(100000004),
      start: '2024-06-05',
    },
    [CHAIN.SONIC]: {
      fetch: fetch(100000014),
      start: '2024-12-26',
    },
    [CHAIN.CRONOS_ZKEVM]: {
      fetch: fetch(100000010),
      start: '2025-01-21',
    },
    [CHAIN.ABSTRACT]: {
      fetch: fetch(100000017),
      start: '2025-01-27',
    },
    [CHAIN.BERACHAIN]: {
      fetch: fetch(100000020),
      start: '2025-02-06',
    },
    [CHAIN.STORY]: {
      fetch: fetch(100000013),
      start: '2025-02-13',
    },
    [CHAIN.HYPERLIQUID]: {
      fetch: fetch(100000022),
      start: '2025-02-20',
    },
    [CHAIN.ZIRCUIT]: {
      fetch: fetch(100000015),
      start: '2025-03-07',
    },
  },
};

export default adapter;

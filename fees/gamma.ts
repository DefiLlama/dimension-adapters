// import { Chain } from "@defillama/sdk/build/general"
// import { FetchResultFees, SimpleAdapter } from "../adapters/types"
// import { getBlock } from "../helpers/getBlock"
// import * as sdk from "@defillama/sdk";
// import { CHAIN } from "../helpers/chains";
// import { getPrices } from "../utils/prices";

import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface Item {
  chain: string;
  total_fees: number;
  total_revenue: number;
}
interface IData {
  datetime: string;
  items: Item[];
}


const _fetchApi = async (from_timestamp: number) => {
  const url = `https://wire2.gamma.xyz/frontend/revenue_status/main_charts?from_timestamp=${from_timestamp}&yearly=false&monthly=false&filter_zero_revenue=false`;
  const data: IData[] = (await fetchURL(url));
  return data;
}

const query: { [key: number]: Promise<IData[]> } = {};

const fetchApi = async (from_timestamp: number) => {
  if (!query[from_timestamp]) {
    query[from_timestamp] = _fetchApi(from_timestamp)
  }
  return query[from_timestamp]
}


const fetchFees = (chain: string) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const fromTimestamp = timestamp - 60 * 60 * 24
    const data: IData[] = await fetchApi(fromTimestamp);
    const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
    const dailyItem: IData | undefined = data.find((e: IData) => e.datetime.split('T')[0] === dateString)
    const result: IData = dailyItem || { datetime: '', items: [] };
    const dailyFees = result.items.filter((e: Item) => e.chain === chain)
      .reduce((a: number, b: Item) => a + b.total_fees, 0);
    const dailyRevenue = result.items.filter((e: Item) => e.chain === chain)
      .reduce((a: number, b: Item) => a + b.total_revenue, 0);
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyRevenue}`,
      timestamp
    }
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees(CHAIN.ETHEREUM),
      start: 1682121600,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: 1682121600,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: 1682121600,
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetchFees(CHAIN.POLYGON_ZKEVM),
      start: 1682121600,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM),
      start: 1682121600,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees("binance"),
      start: 1682121600,
    },
    [CHAIN.MOONBEAM]: {
      fetch: fetchFees("moonbeam"),
      start: 1682121600,
    },
    [CHAIN.ROLLUX]: {
      fetch: fetchFees(CHAIN.ROLLUX),
      start: 1682121600,
    },
    [CHAIN.LINEA]: {
      fetch: fetchFees(CHAIN.LINEA),
      start: 1682121600,
    },
     [CHAIN.MANTA]: {
      fetch: fetchFees("manta"),
      start: 1682121600,
    },
     [CHAIN.BASE]: {
      fetch: fetchFees("base"),
      start: 1682121600,
    },
     [CHAIN.AVAX]: {
      fetch: fetchFees("avalanche"),
      start: 1682121600,
    },
     [CHAIN.XDAI]: {
      fetch: fetchFees("gnosis"),
      start: 1682121600,
    },
     [CHAIN.MANTLE]: {
      fetch: fetchFees("mantle"),
      start: 1682121600,
    },
     [CHAIN.CELO]: {
      fetch: fetchFees("celo"),
      start: 1682121600,
    },
     [CHAIN.METIS]: {
      fetch: fetchFees("metis"),
      start: 1682121600,
    },
  }
}

export default adapter;

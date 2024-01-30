// import { Chain } from "@defillama/sdk/build/general"
// import { FetchResultFees, SimpleAdapter } from "../adapters/types"
// import { getBlock } from "../helpers/getBlock"
// import * as sdk from "@defillama/sdk";
// import { CHAIN } from "../helpers/chains";
// import { getPrices } from "../utils/prices";
// import { queryFlipside } from "../helpers/flipsidecrypto";

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
  const data: IData[] = (await fetchURL(url)).data;
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
      start: async () => 1682121600,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees(CHAIN.ARBITRUM),
      start: async () => 1682121600,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees(CHAIN.POLYGON),
      start: async () => 1682121600,
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetchFees(CHAIN.POLYGON_ZKEVM),
      start: async () => 1682121600,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees(CHAIN.OPTIMISM),
      start: async () => 1682121600,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees("binance"),
      start: async () => 1682121600,
    },
    [CHAIN.ROLLUX]: {
      fetch: fetchFees(CHAIN.ROLLUX),
      start: async () => 1682121600,
    },
    [CHAIN.LINEA]: {
      fetch: fetchFees(CHAIN.LINEA),
      start: async () => 1682121600,
    },
  }
}

export default adapter;

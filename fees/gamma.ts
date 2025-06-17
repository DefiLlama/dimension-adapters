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
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      timestamp
    }
  }
}

const meta = {
  methodology: {
    Fees: 'All yields are generated from liquidity providers.',
    Revenue: 'All yields are distributed to Gamma Protocol.',
    ProtocolRevenue: 'All yields are distributed to Gamma Protocol.',
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees("ethereum"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees("polygon"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetchFees("polygon_zkevm"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees("optimism"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees("arbitrum"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.BSC]: {
      fetch: fetchFees("binance"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.MOONBEAM]: {
      fetch: fetchFees("moonbeam"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.CELO]: {
      fetch: fetchFees("celo"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.AVAX]: {
      fetch: fetchFees("avalanche"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.FANTOM]: {
      fetch: fetchFees("fantom"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.MANTLE]: {
      fetch: fetchFees("mantle"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.ROLLUX]: {
      fetch: fetchFees("rollux"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.LINEA]: {
      fetch: fetchFees("linea"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.BASE]: {
      fetch: fetchFees("base"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.KAVA]: {
      fetch: fetchFees("kava"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.OP_BNB]: {
      fetch: fetchFees("op_bnb"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.MANTA]: {
      fetch: fetchFees("manta"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.METIS]: {
      fetch: fetchFees("metis"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.XDAI]: {
      fetch: fetchFees("gnosis"),
      start: '2023-04-22',
      meta,
    },
    // [CHAIN.ASTRZK]: {
    //   fetch: fetchFees("astar_zkevm"),
    //   start: '2023-04-22',
    // },
    [CHAIN.IMX]: {
      fetch: fetchFees("immutable_zkevm"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.SCROLL]: {
      fetch: fetchFees("scroll"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.BLAST]: {
      fetch: fetchFees("blast"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.XLAYER]: {
      fetch: fetchFees("xlayer"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.MODE]: {
      fetch: fetchFees("mode"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.TAIKO]: {
      fetch: fetchFees("taiko"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.ROOTSTOCK]: {
      fetch: fetchFees("rootstock"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.SEI]: {
      fetch: fetchFees("sei"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.IOTAEVM]: {
      fetch: fetchFees("iota_evm"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.CORE]: {
      fetch: fetchFees("core"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.ZIRCUIT]: {
      fetch: fetchFees("zircuit"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.WC]: {
      fetch: fetchFees("worlchain"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.APECHAIN]: {
      fetch: fetchFees("apechain"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.SONIC]: {
      fetch: fetchFees("sonic"),
      start: '2023-04-22',
      meta,
    },
    [CHAIN.BOB]: {
      fetch: fetchFees("bob"),
      start: '2023-04-22',
      meta,
    },
  }
}

export default adapter;

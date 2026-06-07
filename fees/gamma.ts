import { FetchResultFees, SimpleAdapter, FetchOptions } from "../adapters/types";
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


const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const fromTimestamp = options.toTimestamp - 60 * 60 * 24
  const data: IData[] = await fetchApi(fromTimestamp);
  const dailyItem: IData | undefined = data.find((e: IData) => e.datetime.split('T')[0] === options.dateString)
  const result: IData = dailyItem || { datetime: '', items: [] };
  const dailyFees = result.items.filter((e: Item) => e.chain === options.chain)
    .reduce((a: number, b: Item) => a + b.total_fees, 0);
  const dailyRevenue = result.items.filter((e: Item) => e.chain === options.chain)
    .reduce((a: number, b: Item) => a + b.total_revenue, 0);
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}


const breakdownMethodology = {
  Fees: {
    'LP management fees': 'Performance and management fees charged on liquidity provider positions managed by Gamma across all integrated DEXs'
  },
  Revenue: {
    'Protocol revenue': 'All management fees collected are retained by Gamma Protocol'
  },
  ProtocolRevenue: {
    'Protocol revenue': 'All management fees collected are retained by Gamma Protocol'
  }
};

const adapter: SimpleAdapter = {
  fetch,
  breakdownMethodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2023-04-22',
    },
    [CHAIN.POLYGON]: {
      start: '2023-04-22',
    },
    [CHAIN.POLYGON_ZKEVM]: {
      start: '2023-04-22',
    },
    [CHAIN.OPTIMISM]: {
      start: '2023-04-22',
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-04-22',
    },
    [CHAIN.BSC]: {
      start: '2023-04-22',
    },
    [CHAIN.MOONBEAM]: {
      start: '2023-04-22',
    },
    [CHAIN.CELO]: {
      start: '2023-04-22',
    },
    [CHAIN.AVAX]: {
      start: '2023-04-22',
    },
    [CHAIN.FANTOM]: {
      start: '2023-04-22',
    },
    [CHAIN.MANTLE]: {
      start: '2023-04-22',
    },
    [CHAIN.ROLLUX]: {
      start: '2023-04-22',
    },
    [CHAIN.LINEA]: {
      start: '2023-04-22',
    },
    [CHAIN.BASE]: {
      start: '2023-04-22',
    },
    [CHAIN.KAVA]: {
      start: '2023-04-22',
    },
    [CHAIN.OP_BNB]: {
      start: '2023-04-22',
    },
    [CHAIN.MANTA]: {
      start: '2023-04-22',
    },
    [CHAIN.METIS]: {
      start: '2023-04-22',
    },
    [CHAIN.XDAI]: {
      start: '2023-04-22',
    },
    // [CHAIN.ASTRZK]: {
    //   start: '2023-04-22',
    // },
    [CHAIN.IMX]: {
      start: '2023-04-22',
    },
    [CHAIN.SCROLL]: {
      start: '2023-04-22',
    },
    [CHAIN.BLAST]: {
      start: '2023-04-22',
    },
    [CHAIN.XLAYER]: {
      start: '2023-04-22',
    },
    [CHAIN.MODE]: {
      start: '2023-04-22',
    },
    [CHAIN.TAIKO]: {
      start: '2023-04-22',
    },
    [CHAIN.ROOTSTOCK]: {
      start: '2023-04-22',
    },
    [CHAIN.SEI]: {
      start: '2023-04-22',
    },
    [CHAIN.IOTAEVM]: {
      start: '2023-04-22',
    },
    [CHAIN.CORE]: {
      start: '2023-04-22',
    },
    [CHAIN.ZIRCUIT]: {
      start: '2023-04-22',
    },
    [CHAIN.WC]: {
      start: '2023-04-22',
    },
    [CHAIN.APECHAIN]: {
      start: '2023-04-22',
    },
    [CHAIN.SONIC]: {
      start: '2023-04-22',
    },
    [CHAIN.BOB]: {
      start: '2023-04-22',
    },
  },
  methodology: {
    Fees: 'All yields are generated from liquidity providers.',
    Revenue: 'All yields are distributed to Gamma Protocol.',
    ProtocolRevenue: 'All yields are distributed to Gamma Protocol.',
  },

}

export default adapter;

import { BaseAdapter, BreakdownAdapter, DISABLED_ADAPTER_KEY, FetchOptions, FetchV2, IJSON } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

import { getGraphDimensions } from "../../helpers/getUniSubgraph"
import * as sdk from "@defillama/sdk";
import { httpGet } from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";

const endpoints = {
  [CHAIN.BSC]: "https://proxy-worker.pancake-swap.workers.dev/bsc-exchange",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exhange-eth",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/45376/exchange-v2-polygon-zkevm/version/latest",
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45376/exchange-v2-zksync/version/latest",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v2-arb",
  [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/pancakeswap/exhange-v2",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/45376/exchange-v2-base/version/latest",
  [CHAIN.OP_BNB]: `${getEnv('PANCAKESWAP_OPBNB_SUBGRAPH')}/subgraphs/name/pancakeswap/exchange-v2`
};

const stablesSwapEndpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-stableswap",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-stableswap-arb"
}

const v3Endpoint = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-eth",
  [CHAIN.POLYGON_ZKEVM]: "https://api.studio.thegraph.com/query/45376/exchange-v3-polygon-zkevm/version/latest",
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45376/exchange-v3-zksync/version/latest",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-arb",
  [CHAIN.LINEA]: "https://graph-query.linea.build/subgraphs/name/pancakeswap/exchange-v3-linea",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/45376/exchange-v3-base/version/latest",
  [CHAIN.OP_BNB]: `${getEnv('PANCAKESWAP_OPBNB_SUBGRAPH')}/subgraphs/name/pancakeswap/exchange-v3`
}

const VOLUME_USD = "volumeUSD";

const graphs = getGraphDimensions({
  graphUrls: endpoints,
  graphRequestHeaders: {
    [CHAIN.BSC]: {
      "origin": "https://pancakeswap.finance",
    },
  },
  totalVolume: {
    factory: "pancakeFactories"
  },
  dailyVolume: {
    factory: "pancakeDayData"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.25,
    ProtocolRevenue: 0.0225,
    HoldersRevenue: 0.0575,
    UserFees: 0.25,
    SupplySideRevenue: 0.17,
    Revenue: 0.08
  }
});

const graphsStableSwap = getGraphDimensions({
  graphUrls: stablesSwapEndpoints,
  totalVolume: {
    factory: "factories"
  },
  dailyVolume: {
    factory: "pancakeDayData"
  },
  feesPercent: {
    type: "volume",
    Fees: 0.25, // 0.25% volume
    ProtocolRevenue: 0.025, // 10% fees
    HoldersRevenue: 0.1, // 40% fees
    UserFees: 0.25, // 25% volume
    SupplySideRevenue: 0.125, // 50% fees
    Revenue: 0.0225 // 50% fees
  }
});

const v3Graph = getGraphDimensions({
  graphUrls: v3Endpoint,
  totalVolume: {
    factory: "factories",

  },
  dailyVolume: {
    factory: "pancakeDayData",
    field: VOLUME_USD
  },
  totalFees: {
    factory: "factories",
  },
  dailyFees: {
    factory: "pancakeDayData",
    field: "feesUSD"
  },
});

const startTimes = {
  [CHAIN.ETHEREUM]: 1664236800,
  [CHAIN.BSC]: 1619136000,
  [CHAIN.POLYGON_ZKEVM]: 1687910400,
  [CHAIN.ERA]: 1690156800,
  [CHAIN.ARBITRUM]: 1691452800,
  [CHAIN.LINEA]: 1692835200,
  [CHAIN.BASE]: 1693440000,
  [CHAIN.OP_BNB]: 1695081600
} as IJSON<number>

const stableTimes = {
  [CHAIN.BSC]: 1663718400,
  [CHAIN.ARBITRUM]: 1705363200
} as IJSON<number>

const v3StartTimes = {
  [CHAIN.BSC]: 1680307200,
  [CHAIN.ETHEREUM]: 1680307200,
  [CHAIN.POLYGON_ZKEVM]: 1686182400,
  [CHAIN.ERA]: 1690156800,
  [CHAIN.ARBITRUM]: 1691452800,
  [CHAIN.LINEA]: 1692835200,
  [CHAIN.BASE]: 1692576000,
  [CHAIN.OP_BNB]: 1693440000
} as IJSON<number>

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.0225% of each swap.",
  SupplySideRevenue: "LPs receive 0.17% of the fees.",
  HoldersRevenue: "0.0575% is used to facilitate CAKE buyback and burn.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

interface ISwapEventData {
  type: string;
  amount_x_in: string;
  amount_x_out: string;
  amount_y_in: string;
  amount_y_out: string;
  user: string;
}

const account = '0xc7efb4076dbe143cbcd98cfaaa929ecfc8f299203dfff63b95ccb6bfe19850fa';
const getToken = (i: string) => i.split('<')[1].replace('>', '').split(', ');
const APTOS_PRC = 'https://aptos-mainnet.pontem.network';

const getResources = async (account: string): Promise<any[]> => {
  const data: any = []
  let lastData: any;
  let cursor
  do {
    let url = `${APTOS_PRC}/v1/accounts/${account}/resources?limit=9999`
    if (cursor) url += '&start=' + cursor
    const res = await httpGet(url, undefined, { withMetadata: true })
    lastData = res.data
    data.push(...lastData)
    cursor = res.headers['x-aptos-cursor']
  } while (lastData.length === 9999)
  return data
}

const fetchVolume: FetchV2 = async ({ endTimestamp: timestamp, createBalances }) => {
  const fromTimestamp = timestamp - 86400;
  const toTimestamp = timestamp;
  const account_resource: any[] = (await getResources(account))
  const pools = account_resource.filter(e => e.type?.includes('swap::PairEventHolder'))
    .map((e: any) => {
      const [token0, token1] = getToken(e.type);
      return {
        type: e.type,
        token0,
        token1,
        swap_events: {
          counter: e.data.swap.counter,
          creation_num: e.data.swap.guid.id.creation_num,
        },
        timestamp: e.data.timestamp,
        counter: Number(e.data.swap.counter),
      }
    }).sort((a, b) => b.counter - a.counter)
  const creation_num = [14, 767, 702, 12, 622, 757, 1077, 1092, 5708, 2, 712, 3196]
  const logs_swap: ISwapEventData[] = (await Promise.all(pools
    .filter(e => creation_num.includes(Number(e.swap_events.creation_num)))
    .map(p => getSwapEvent(p, fromTimestamp, toTimestamp)))).flat()
  const numberOfTrade: any = {};
  // debugger
  [...new Set(logs_swap.map(e => e.user))].forEach(e => {
    numberOfTrade[e] = {};
    numberOfTrade[e]['user'] = e;
    numberOfTrade[e]['count'] = 0;
    numberOfTrade[e]['volume'] = 0;
  })
  const balances: sdk.Balances = createBalances()
  logs_swap.map((e: ISwapEventData) => {
    const [token0, token1] = getToken(e.type);
    balances.add(token0, e.amount_x_out)
    balances.add(token1, e.amount_y_out)
  })

  return {
    dailyVolume: await balances.getUSDString(),
    dailyFees: "0",
  }
}

const getSwapEvent = async (pool: any, fromTimestamp: number, toTimestamp: number): Promise<ISwapEventData[]> => {
  const limit = 100;
  const swap_events: any[] = [];
  let start = (pool.swap_events.counter - limit) < 0 ? 0 : pool.swap_events.counter - limit;
  while (true) {
    if (start < 0) break;
    const getEventByCreation = `${APTOS_PRC}/v1/accounts/${account}/events/${pool.swap_events.creation_num}?start=${start}&limit=${limit}`;
    try {
      const event: any[] = (await httpGet(getEventByCreation));
      const listSequence: number[] = event.map(e => Number(e.sequence_number))
      const lastMin = Math.min(...listSequence)
      if (lastMin >= Infinity || lastMin <= -Infinity) break;
      const lastVision = event.find(e => Number(e.sequence_number) === lastMin)?.version;
      const urlBlock = `${APTOS_PRC}/v1/blocks/by_version/${lastVision}`;
      const block = (await httpGet(urlBlock));
      const lastTimestamp = toUnixTime(block.block_timestamp);
      const lastTimestampNumber = lastTimestamp
      if (lastTimestampNumber >= fromTimestamp && lastTimestampNumber <= toTimestamp) {
        swap_events.push(...event)
      }
      if (lastTimestampNumber < fromTimestamp) {
        break;
      }
      if (start === 0) break;
      start = lastMin - (limit + 1) > 0 ? lastMin - (limit + 1) : 0;
    } catch (e: any) {
      break;
      // start = start - 26 > 0 ? start - 26 : 0;
    }
  }
  return swap_events.map(e => {
    return {
      ...e,
      type: e.type,
      ...e.data
    }
  })
}
const toUnixTime = (timestamp: string) => Number((Number(timestamp) / 1e6).toString().split('.')[0])

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    v1: {
      [DISABLED_ADAPTER_KEY]: disabledAdapter,
      [CHAIN.BSC]: {
        fetch: async ({ startTimestamp }) => {
          const totalVolume = 103394400000;
          return {
            totalVolume: `${totalVolume}`,
            timestamp: startTimestamp
          }
        },
        start: 1680307200,
      }
    },
    v2: Object.keys(endpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: graphs(chain),
        start: startTimes[chain],
        meta: {
          methodology
        }
      }
      return acc
    }, {} as BaseAdapter),
    v3: Object.keys(v3Endpoint).reduce((acc, chain) => {
      acc[chain] = {
        fetch: async (options: FetchOptions) => {
          const v3stats = await v3Graph(chain)(options)
          if (chain === CHAIN.ETHEREUM) v3stats.totalVolume = (Number(v3stats.totalVolume) - 7385565913).toString()
          return v3stats
        },
        start: v3StartTimes[chain],
      }
      return acc
    }, {} as BaseAdapter),
    stableswap: Object.keys(stablesSwapEndpoints).reduce((acc, chain) => {
      acc[chain] = {
        fetch: graphsStableSwap(chain),
        start: stableTimes[chain],
        meta: {
          methodology: {
            UserFees: "User pays 0.25% fees on each swap.",
            ProtocolRevenue: "Treasury receives 10% of the fees.",
            SupplySideRevenue: "LPs receive 50% of the fees.",
            HoldersRevenue: "A 40% of the fees is used to facilitate CAKE buyback and burn.",
            Revenue: "Revenue is 50% of the fees paid by users.",
            Fees: "All fees comes from the user fees, which is 025% of each trade."
          }
        }
      }
      return acc
    }, {} as BaseAdapter),
  },
};
adapter.breakdown.v2[CHAIN.APTOS] = {
  fetch: fetchVolume,
  start: 1699488000,
  // runAtCurrTime: true,
}

export default adapter;

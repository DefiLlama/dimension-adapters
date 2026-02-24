import { BaseAdapter, FetchOptions, FetchResultV2, FetchV2, IJSON, SimpleAdapter, Dependencies } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import * as sdk from "@defillama/sdk";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";
import { queryDune } from "../helpers/dune";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { getConfig } from "../helpers/cache";

// --- Fee config (shared V2 rates) ---

const FEE_CONFIG = {
  type: "volume" as const,
  Fees: 0.25,
  ProtocolRevenue: 0.0225,
  HoldersRevenue: 0.0575,
  UserFees: 0.25,
  SupplySideRevenue: 0.17,
  Revenue: 0.08
};

// --- Data source types ---

enum DataSource {
  GRAPH = 'graph',
  LOGS = 'logs',
  CUSTOM = 'custom',
}

interface BaseChainConfig {
  start: number | string;
  dataSource: DataSource;
}

interface GraphChainConfig extends BaseChainConfig {
  dataSource: DataSource.GRAPH;
  endpoint?: string;
  requestHeaders?: any;
}

interface LogsChainConfig extends BaseChainConfig {
  dataSource: DataSource.LOGS;
  factory: string;
}

interface CustomChainConfig extends BaseChainConfig {
  dataSource: DataSource.CUSTOM;
}

type ChainConfig = GraphChainConfig | LogsChainConfig | CustomChainConfig;

// --- Protocol config for V2 ---

const PROTOCOL_CONFIG: Record<string, ChainConfig> = {
  [CHAIN.BSC]: {
    start: '2021-04-23',
    dataSource: DataSource.CUSTOM,
  },
  [CHAIN.ETHEREUM]: {
    start: '2022-09-27',
    dataSource: DataSource.LOGS,
    factory: '0x1097053fd2ea711dad45caccc45eff7548fcb362',
  },
  [CHAIN.POLYGON_ZKEVM]: {
    start: '2023-06-28',
    dataSource: DataSource.LOGS,
    factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
  },
  [CHAIN.ERA]: {
    start: '2023-07-24',
    dataSource: DataSource.LOGS,
    factory: '0xd03D8D566183F0086d8D09A84E1e30b58Dd5619d'
  },
  [CHAIN.ARBITRUM]: {
    start: '2023-08-08',
    dataSource: DataSource.LOGS,
    factory: '0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e',
  },
  [CHAIN.LINEA]: {
    start: '2023-08-24',
    dataSource: DataSource.LOGS,
    factory: '0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e',
  },
  [CHAIN.BASE]: {
    start: '2023-08-31',
    dataSource: DataSource.LOGS,
    factory: '0x02a84c1b3bbd7401a5f7fa98a384ebc70bb5749e',
  },
  [CHAIN.OP_BNB]: {
    start: '2023-09-19',
    dataSource: DataSource.LOGS,
    factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
  },
  [CHAIN.APTOS]: {
    start: '2023-11-09',
    dataSource: DataSource.CUSTOM
  },
  [CHAIN.MONAD]: {
    start: '2025-11-23',
    dataSource: DataSource.LOGS,
    factory: '0x02a84c1b3BBD7401a5f7fa98a384EBC70bB5749E'
  },
};

// --- ABIs ---

const ABIS = {
  POOL_CREATE: 'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)',
  SWAP_EVENT: 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
};

// --- Graph setup for V2 chains with GRAPH data source ---

const createEndpointMap = () => {
  const result: IJSON<string> = {};
  Object.entries(PROTOCOL_CONFIG).forEach(([chain, config]) => {
    if (config.dataSource === DataSource.GRAPH && (config as GraphChainConfig).endpoint) {
      result[chain] = (config as GraphChainConfig).endpoint!;
    }
  });
  return result;
};

const createHeadersMap = () => {
  const result: IJSON<any> = {};
  Object.entries(PROTOCOL_CONFIG).forEach(([chain, config]) => {
    if (config.dataSource === DataSource.GRAPH && (config as GraphChainConfig).requestHeaders) {
      result[chain] = (config as GraphChainConfig).requestHeaders;
    }
  });
  return result;
};

const v2Endpoints = createEndpointMap();
const v2Headers = createHeadersMap();

const graphs = getGraphDimensions2({
  graphUrls: v2Endpoints,
  graphRequestHeaders: v2Headers,
  totalVolume: {
    factory: "pancakeFactories"
  },
  feesPercent: FEE_CONFIG
});

// --- BSC V2 Dune-based data ---

function formatAddress(address: any): string {
  return String(address).toLowerCase();
}

async function getBscTokenLists(): Promise<Array<string>> {
  const blacklisted = getDefaultDexTokensBlacklisted(CHAIN.BSC)
  const lists = [
    'https://tokens.pancakeswap.finance/pancakeswap-extended.json',
    'https://tokens.pancakeswap.finance/ondo-rwa-tokens.json',
    'https://tokens.coingecko.com/binance-smart-chain/all.json',
  ];
  let tokens: Array<string> = [];
  for (const url of lists) {
    const data = await getConfig(`pcs-token-list-bsc-${url}`, url);
    tokens = tokens.concat(
      data.tokens
        .filter((token: any) => Number(token.chainId) === 56)
        .map((token: any) => formatAddress(token.address))
    );
  }
  return tokens.filter((token: string) => !blacklisted.includes(token))
}

const PANCAKESWAP_V2_QUERY = (fromTime: number, toTime: number, whitelistedTokens: Array<string>) => {
  return `
    SELECT
        token_bought_address AS token
        , SUM(
          CASE
              WHEN token_sold_address IN (${whitelistedTokens.toString()})
              AND token_bought_address IN (${whitelistedTokens.toString()})
              THEN token_bought_amount_raw
              ELSE 0
          END
        ) AS amount
    FROM dex.trades
    WHERE blockchain = 'bnb'
      AND project = 'pancakeswap'
      AND version = '2'
      AND block_time >= FROM_UNIXTIME(${fromTime})
      AND block_time <= FROM_UNIXTIME(${toTime})
    GROUP BY
        token_bought_address
  `;
}

async function getBscV2Data(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances()
  const whitelistedTokens = await getBscTokenLists()

  const tokensAndAmounts = await queryDune('3996608', {
    fullQuery: PANCAKESWAP_V2_QUERY(options.fromTimestamp, options.toTimestamp, whitelistedTokens),
  }, options);

  for (const tokenAndAmount of tokensAndAmounts) {
    if (whitelistedTokens.includes(formatAddress(tokenAndAmount.token))) {
      dailyVolume.add(tokenAndAmount.token, tokenAndAmount.amount)
    }
  }

  return {
    dailyVolume: dailyVolume,
    dailyFees: dailyVolume.clone(0.0025),
    dailyUserFees: dailyVolume.clone(0.0025),
    dailyRevenue: dailyVolume.clone(0.0008),
    dailySupplySideRevenue: dailyVolume.clone(0.0017),
    dailyProtocolRevenue: dailyVolume.clone(0.000225),
    dailyHoldersRevenue: dailyVolume.clone(0.000575),
  }
}

// --- Aptos V2 volume ---

interface ISwapEventData {
  type: string;
  amount_x_in: string;
  amount_x_out: string;
  amount_y_in: string;
  amount_y_out: string;
  user: string;
}

const aptosAccount = '0xc7efb4076dbe143cbcd98cfaaa929ecfc8f299203dfff63b95ccb6bfe19850fa';
const getToken = (i: string) => i.split('<')[1].replace('>', '').split(', ');
const APTOS_RPC = getEnv('APTOS_RPC');

const getResources = async (account: string): Promise<any[]> => {
  const data: any = []
  let lastData: any;
  let cursor
  do {
    let url = `${APTOS_RPC}/v1/accounts/${account}/resources?limit=9999`
    if (cursor) url += '&start=' + cursor
    const res = await httpGet(url, undefined, { withMetadata: true })
    lastData = res.data
    data.push(...lastData)
    cursor = res.headers['x-aptos-cursor']
  } while (lastData.length === 9999)
  return data
}

const toUnixTime = (timestamp: string) => Number((Number(timestamp) / 1e6).toString().split('.')[0])

const getSwapEvent = async (pool: any, fromTimestamp: number, toTimestamp: number): Promise<ISwapEventData[]> => {
  const limit = 100;
  const swap_events: any[] = [];
  let start = (pool.swap_events.counter - limit) < 0 ? 0 : pool.swap_events.counter - limit;
  while (true) {
    if (start < 0) break;
    const getEventByCreation = `${APTOS_RPC}/v1/accounts/${aptosAccount}/events/${pool.swap_events.creation_num}?start=${start}&limit=${limit}`;
    try {
      const event: any[] = (await httpGet(getEventByCreation));
      const listSequence: number[] = event.map(e => Number(e.sequence_number))
      const lastMin = Math.min(...listSequence)
      if (lastMin >= Infinity || lastMin <= -Infinity) break;
      const lastVision = event.find(e => Number(e.sequence_number) === lastMin)?.version;
      const urlBlock = `${APTOS_RPC}/v1/blocks/by_version/${lastVision}`;
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

const fetchAptosVolume: FetchV2 = async ({ fromTimestamp, toTimestamp, createBalances }) => {
  const account_resource: any[] = (await getResources(aptosAccount))
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

  // fees are same as v2 on bsc
  const dailyVolume = await balances.getUSDString()
  const dailyFees = Number(dailyVolume) * FEE_CONFIG.Fees;
  const dailyRevenue = Number(dailyVolume) * FEE_CONFIG.Revenue;
  const dailyProtocolRevenue = Number(dailyVolume) * FEE_CONFIG.ProtocolRevenue;
  const dailySupplySideRevenue = Number(dailyVolume) * FEE_CONFIG.SupplySideRevenue;
  const dailyHoldersRevenue = Number(dailyVolume) * FEE_CONFIG.HoldersRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
}

// --- Fee calculation helpers ---

const calculateFeesBalances = (dailyVolume: sdk.Balances) => {
  return {
    dailyFees: dailyVolume.clone(FEE_CONFIG.Fees / 100),
    dailyUserFees: dailyVolume.clone(FEE_CONFIG.UserFees / 100),
    dailyRevenue: dailyVolume.clone(FEE_CONFIG.Revenue / 100),
    dailyProtocolRevenue: dailyVolume.clone(FEE_CONFIG.ProtocolRevenue / 100),
    dailySupplySideRevenue: dailyVolume.clone(FEE_CONFIG.SupplySideRevenue / 100),
    dailyHoldersRevenue: dailyVolume.clone(FEE_CONFIG.HoldersRevenue / 100),
  };
};

// --- Main fetch function ---

const fetchV2 = async (_t: any, _a: any, options: FetchOptions) => {
  const chainConfig = PROTOCOL_CONFIG[options.chain];

  if (chainConfig.dataSource === DataSource.LOGS) {
    const logConfig = chainConfig as LogsChainConfig;
    const adapter = getUniV2LogAdapter({
      factory: logConfig.factory,
      eventAbi: ABIS.SWAP_EVENT,
      pairCreatedAbi: ABIS.POOL_CREATE
    });
    const v2stats = await adapter(options);
    return {
      ...v2stats,
      ...calculateFeesBalances(v2stats.dailyVolume)
    };
  } else if (chainConfig.dataSource === DataSource.GRAPH) {
    const v2stats = await graphs(options);
    return v2stats;
  } else if (chainConfig.dataSource === DataSource.CUSTOM && options.chain === CHAIN.APTOS) {
    return fetchAptosVolume(options);
  } else if (chainConfig.dataSource === DataSource.CUSTOM && options.chain === CHAIN.BSC) {
    return await getBscV2Data(options);
  }
  throw new Error('Invalid data source');
}

// --- Build adapter ---

const methodology = {
  UserFees: "User pays 0.25% fees on each swap.",
  ProtocolRevenue: "Treasury receives 0.0225% of each swap.",
  SupplySideRevenue: "LPs receive 0.17% of the fees.",
  HoldersRevenue: "0.0575% is used to facilitate CAKE buyback and burn.",
  Revenue: "All revenue generated comes from user fees.",
  Fees: "All fees comes from the user."
}

const adapterObj: SimpleAdapter = {
  adapter: Object.keys(PROTOCOL_CONFIG).reduce((acc, chain) => {
    acc[chain] = {
      fetch: fetchV2,
      start: PROTOCOL_CONFIG[chain].start,
    };
    return acc;
  }, {} as BaseAdapter),
  dependencies: [Dependencies.DUNE],
  methodology,
}

export default adapterObj;

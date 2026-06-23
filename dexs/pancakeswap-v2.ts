import { BaseAdapter, FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import * as sdk from "@defillama/sdk";
import { httpGet } from "../utils/fetchURL";
import { getEnv } from "../helpers/env";
import { queryClickhouse } from "../helpers/indexer";
import { getDefaultDexTokensWhitelisted } from "../helpers/lists";
import { Row } from "@clickhouse/client";

const METRIC = {
  SWAP_FEES: 'Token Swap Fees',
  PROTOCOL_REVENUE: 'Swap Fees To Protocol',
  HOLDERS_REVENUE: 'Swap Fees To Holders',
  LP_REVENUE: 'Swap Fees To Liquidity Providers',
  BUY_BACK_AND_BURN: 'Buy Back And Burn CAKE',
}

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
  LOGS = 'logs',
  CUSTOM = 'custom',
}

interface BaseChainConfig {
  start: string;
  dataSource: DataSource;
}

interface LogsChainConfig extends BaseChainConfig {
  dataSource: DataSource.LOGS;
  factory: string;
}

interface CustomChainConfig extends BaseChainConfig {
  dataSource: DataSource.CUSTOM;
}

type ChainConfig = LogsChainConfig | CustomChainConfig;

// --- Protocol config for V2 ---

const PANCAKE_V2_BSC_FACTORY = '0xca143ce32fe78f1f7019d7d551a6402fc5350c73';
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

// --- BSC V2 data via indexer v2 (ClickHouse) ---

// keccak256("PairCreated(address,address,address,uint256)")
const PAIR_CREATED_TOPIC0 = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';
const PAIR_CREATED_SHORT_TOPIC0 = '0x0d3648bd';

// keccak256("Swap(address,uint256,uint256,uint256,uint256,address)")
const SWAP_TOPIC0 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const SWAP_SHORT_TOPIC0 = '0xd78ad95f';

const shortAddrOf = (addr: string) => addr.substring(0, 10).toLowerCase();
const padTokenTo32Bytes = (addr: string) => '0x000000000000000000000000' + addr.replace(/^0x/, '').toLowerCase();

// Inline-quote a hex value (`0x` + N hex chars). Enforces an exact length so
// nothing unexpected lands in the SQL body, even though everything we pass in
// is already produced from chain data or our own padding helpers.
const hexLiteral = (s: string, expectedHexChars: number): string => {
  if (!new RegExp(`^0x[0-9a-f]{${expectedHexChars}}$`).test(s)) {
    throw new Error(`Invalid hex literal (expected 0x + ${expectedHexChars} hex chars): ${s}`);
  }
  return `'${s}'`;
};
const hexListSql = (arr: string[], expectedHexChars: number): string =>
  arr.map(x => hexLiteral(x.toLowerCase(), expectedHexChars)).join(', ');

// Find pairs where both token0 and token1 are in the whitelist. Returns the
// pair address and indexed (32-byte-padded) token0/token1 from PairCreated.
// PREWHERE: every filter touches only ZSTD(1)-or-uncompressed columns
// (chain, short_address, short_topic0, address, topic0, topic1, topic2), so
// the ZSTD(9)-compressed `data` column is read only for matching rows when
// SELECT pulls the pair address out of it.
//
// Address lists are inlined as literals (not Array(String) query params)
// because @clickhouse/client serializes Array params into a single HTTP form
// field which Poco caps at ~64KB; a few thousand entries blow past that. The
// whitelist (~2K+ tokens on BSC) is wrapped in a WITH clause so it materializes
// once for both topic1/topic2 IN-checks. The 256KB max_query_size default is
// lifted at the call site (via clickhouse_settings HTTP param), NOT via an
// in-SQL SETTINGS clause — that one is parsed only AFTER the size check, so
// it can't raise its own ceiling.
const buildDiscoverPairsSql = (chainId: number, factory: string, paddedTokens: string[]): string => `
  WITH [${hexListSql(paddedTokens, 64)}] AS whitelist
  SELECT
    topic1 AS token0_padded,
    topic2 AS token1_padded,
    concat('0x', substring(data, 27, 40)) AS pair
  FROM evm_indexer.logs
  PREWHERE chain = ${chainId}
    AND short_address = '${shortAddrOf(factory)}'
    AND short_topic0 = '${PAIR_CREATED_SHORT_TOPIC0}'
    AND address = '${factory}'
    AND topic0 = '${PAIR_CREATED_TOPIC0}'
    AND has(whitelist, topic1)
    AND has(whitelist, topic2)
`;

// Sum amount0Out / amount1Out per pair from the Swap event payload. The data
// field is "0x" + four uint256 (amount0In, amount1In, amount0Out, amount1Out),
// so amount0Out occupies hex chars 131..194 (1-indexed substring(data, 131, 64))
// and amount1Out occupies 195..258. EVM packs uint256 big-endian, so reverse
// the bytes before reinterpretAsUInt256 (which reads little-endian).
//
// PREWHERE matches the `logs_fast_lookup` projection layout
// (chain, short_address, short_topic0, ...) so the engine prunes granules
// before touching the heavy `data` column. Address lists are inlined to
// dodge the Poco HTTP form-field size cap (see note above). The pair-address
// list can run ~5K entries (~220KB), so the caller bumps max_query_size via
// the HTTP clickhouse_settings channel (an in-SQL SETTINGS clause is parsed
// too late to help).
const buildSwapAggSql = (
  chainId: number,
  shortAddresses: string[],
  addresses: string[],
  fromTs: number,
  toTs: number,
): string => `
  SELECT
    address AS pair,
    toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 131, 64)))))) AS amount0_out,
    toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 195, 64)))))) AS amount1_out
  FROM evm_indexer.logs
  PREWHERE chain = ${chainId}
    AND short_address IN (${hexListSql(shortAddresses, 8)})
    AND short_topic0 = '${SWAP_SHORT_TOPIC0}'
    AND address IN (${hexListSql(addresses, 40)})
    AND topic0 = '${SWAP_TOPIC0}'
    AND timestamp >= toDateTime(${fromTs})
    AND timestamp <  toDateTime(${toTs})
  GROUP BY address
`;

type PairRow = Row & { pair: string; token0_padded: string; token1_padded: string };
type SwapAggRow = Row & { pair: string; amount0_out: string; amount1_out: string };

const unpadTopic = (t: string) => '0x' + String(t).slice(-40).toLowerCase();

async function getBscV2Data(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances()

  const emptyResult = (): FetchResultV2 => ({
    dailyVolume,
    dailyFees: dailyVolume.clone(0.0025),
    dailyUserFees: dailyVolume.clone(0.0025),
    dailyRevenue: dailyVolume.clone(0.0008),
    dailySupplySideRevenue: dailyVolume.clone(0.0017),
    dailyProtocolRevenue: dailyVolume.clone(0.000225),
    dailyHoldersRevenue: dailyVolume.clone(0.000575),
  });

  const whitelistedTokens = (await getDefaultDexTokensWhitelisted({ chain: options.chain })).map(t => t.toLowerCase());
  if (whitelistedTokens.length === 0) return emptyResult();

  // 4 MB ceiling for SQL parsing — the in-SQL `SETTINGS max_query_size = N`
  // clause is read only AFTER the parser hits the 256 KB default, so the
  // override has to ride on the HTTP `clickhouse_settings` channel.
  const chSettings = { max_query_size: 4194304 } as const;

  // Step 1: discover whitelisted Pancake V2 pairs
  const pairRows = await queryClickhouse<PairRow>(
    buildDiscoverPairsSql(Number(options.api.chainId), PANCAKE_V2_BSC_FACTORY, whitelistedTokens.map(padTokenTo32Bytes)),
    undefined,
    chSettings,
  );
  if (pairRows.length === 0) return emptyResult();

  const pairToTokens: Record<string, { token0: string; token1: string }> = {};
  for (const row of pairRows) {
    const pair = String(row.pair).toLowerCase();
    pairToTokens[pair] = {
      token0: unpadTopic(row.token0_padded),
      token1: unpadTopic(row.token1_padded),
    };
  }
  const pairAddresses = Object.keys(pairToTokens);
  const shortAddresses = Array.from(new Set(pairAddresses.map(shortAddrOf)));

  // Step 2: aggregate Swap event amount-out per pair for the day
  const swapRows = await queryClickhouse<SwapAggRow>(
    buildSwapAggSql(
      Number(options.api.chainId),
      shortAddresses,
      pairAddresses,
      options.fromTimestamp,
      options.toTimestamp,
    ),
    undefined,
    chSettings,
  );

  for (const row of swapRows) {
    const tokens = pairToTokens[String(row.pair).toLowerCase()];
    if (!tokens) continue;
    dailyVolume.add(tokens.token0, row.amount0_out);
    dailyVolume.add(tokens.token1, row.amount1_out);
  }

  return {
    dailyVolume,
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
  const dailyVolume = createBalances();
  dailyVolume.addUSDValue(await balances.getUSDString());
  
  const dailyFees = dailyVolume.clone(FEE_CONFIG.Fees);
  const dailyRevenue = dailyVolume.clone(FEE_CONFIG.Revenue);
  const dailyProtocolRevenue = dailyVolume.clone(FEE_CONFIG.ProtocolRevenue);
  const dailySupplySideRevenue = dailyVolume.clone(FEE_CONFIG.SupplySideRevenue);
  const dailyHoldersRevenue = dailyVolume.clone(FEE_CONFIG.HoldersRevenue);

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

const fetchV2 = async (options: FetchOptions) => {
  const chainConfig = PROTOCOL_CONFIG[options.chain];

  let v2Stats: any = {};
  
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  if (chainConfig.dataSource === DataSource.LOGS) {
    const logConfig = chainConfig as LogsChainConfig;
    const adapter = getUniV2LogAdapter({
      factory: logConfig.factory,
      eventAbi: ABIS.SWAP_EVENT,
      pairCreatedAbi: ABIS.POOL_CREATE
    });
    const logStats = await adapter(options);
    const fees = calculateFeesBalances(logStats.dailyVolume);
    v2Stats = { ...logStats, ...fees }
  } else if (chainConfig.dataSource === DataSource.CUSTOM && options.chain === CHAIN.APTOS) {
    v2Stats = await fetchAptosVolume(options);
  } else if (chainConfig.dataSource === DataSource.CUSTOM && options.chain === CHAIN.BSC) {
    v2Stats = await getBscV2Data(options);
  } else throw new Error('Invalid data source');

  dailyVolume.add(v2Stats.dailyVolume);
  dailyFees.add(v2Stats.dailyFees, METRIC.SWAP_FEES);
  dailyUserFees.add(v2Stats.dailyUserFees, METRIC.SWAP_FEES);
  dailyRevenue.add(v2Stats.dailyProtocolRevenue, METRIC.PROTOCOL_REVENUE);
  dailyRevenue.add(v2Stats.dailyHoldersRevenue, METRIC.HOLDERS_REVENUE);
  dailyProtocolRevenue.add(v2Stats.dailyProtocolRevenue, METRIC.PROTOCOL_REVENUE);
  dailySupplySideRevenue.add(v2Stats.dailySupplySideRevenue, METRIC.LP_REVENUE);
  dailyHoldersRevenue.add(v2Stats.dailyHoldersRevenue, METRIC.BUY_BACK_AND_BURN);
  
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  }
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

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'User pays 0.25% fees on each swap',
  },
  Revenue: {
    [METRIC.PROTOCOL_REVENUE]: 'Treasury receives 0.0225% of each swap.',
    [METRIC.HOLDERS_REVENUE]: '0.0575% is used to facilitate CAKE buyback and burn.',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_REVENUE]: 'Treasury receives 0.0225% of each swap.',
  },
  SupplySideRevenue: {
    [METRIC.LP_REVENUE]: 'LPs receive 0.17% of the fees.',
  },
  HoldersRevenue: {
    [METRIC.BUY_BACK_AND_BURN]: '0.0575% is used to facilitate CAKE buyback and burn.',
  },
}

const adapterObj: SimpleAdapter = {
  adapter: Object.keys(PROTOCOL_CONFIG).reduce((acc, chain) => {
    acc[chain] = {
      fetch: fetchV2,
      start: PROTOCOL_CONFIG[chain].start,
    };
    return acc;
  }, {} as BaseAdapter),
  methodology,
  breakdownMethodology,
}

export default adapterObj;

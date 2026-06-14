import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";
import { queryClickhouse } from "../helpers/indexer";
import { getDefaultDexTokensWhitelisted } from "../helpers/lists";
import { Row } from "@clickhouse/client";

type Source = 'LOGS' | 'CLICKHOUSE';

const chainConfig: Record<string, {
  factory: string;
  source: Source;
  start: string;
  feeSwitchDate?: string;
}> = {
  [CHAIN.ETHEREUM]: {
    factory: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
    source: 'CLICKHOUSE',
    start: '2020-04-19',
    feeSwitchDate: "2025-12-29",
  },
  [CHAIN.POLYGON]: {
    factory: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
    source: 'CLICKHOUSE',
    start: '2024-02-12',
    feeSwitchDate: "2026-06-02",
  },
  [CHAIN.BASE]: {
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    source: 'CLICKHOUSE',
    start: '2024-02-13',
    feeSwitchDate: "2026-03-08",
  },
  [CHAIN.OPTIMISM]: {
    factory: '0x0c3c1c532F1e39EdF36BE9Fe0bE1410313E074Bf',
    source: 'LOGS',
    start: '2024-02-13',
    feeSwitchDate: "2026-03-08",
  },
  [CHAIN.ARBITRUM]: {
    factory: '0xf1D7CC64Fb4452F05c498126312eBE29f30Fbcf9',
    source: 'CLICKHOUSE',
    start: '2024-02-08',
    feeSwitchDate: "2026-03-08",
  },
  [CHAIN.BSC]: {
    factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6',
    source: 'CLICKHOUSE',
    start: '2024-02-14',
    feeSwitchDate: "2026-06-02",
  },
  [CHAIN.UNICHAIN]: {
    factory: '0x1f98400000000000000000000000000000000002',
    source: 'CLICKHOUSE',
    start: '2025-01-24',
  },
  [CHAIN.AVAX]: {
    factory: '0x9e5A52f57b3038F1B8EeE45F28b3C1967e22799C',
    source: 'CLICKHOUSE',
    start: '2024-02-15',
  },
  [CHAIN.BLAST]: {
    factory: '0x5C346464d33F90bABaf70dB6388507CC889C1070',
    source: 'CLICKHOUSE',
    start: '2024-03-24',
  },
  [CHAIN.ZORA]: {
    // Zora isn't in evm_indexer, so fall back to the RPC-backed LOGS path.
    factory: '0x0F797dC7efaEA995bB916f268D919d0a1950eE3C',
    source: 'LOGS',
    start: '2024-02-27',
    feeSwitchDate: "2026-03-08",
  },
  [CHAIN.MONAD]: {
    factory: '0x182a927119d56008d921126764bf884221b10f59',
    source: 'LOGS',
    start: '2025-11-24',
  },
  [CHAIN.TEMPO]: {
    factory: '0xf9ec577a4e45b5278bb7cf60fcbc20c3acaef68f',
    source: 'LOGS',
    start: '2026-03-23',
  },
  [CHAIN.XLAYER]: {
    factory: '0xDf38F24fE153761634Be942F9d859f3DBA857E95',
    source: 'CLICKHOUSE',
    start: '2026-01-05',
    feeSwitchDate: "2026-03-08",
  },
}

function getLogAdapterConfig(options: FetchOptions) {
  // UNIfication has officially been executed onchain
  // https://x.com/Uniswap/status/2005018127260942798
  const feeSwitchDate = chainConfig[options.chain]?.feeSwitchDate;
  if (feeSwitchDate && options.dateString >= feeSwitchDate) {
    return {
      userFeesRatio: 1,
      revenueRatio: 0.05 / 0.3,
      protocolRevenueRatio: 0,
    }
  } else {
    return {
      userFeesRatio: 1,
      revenueRatio: 0,
      protocolRevenueRatio: 0,
    }
  }
}

// --- ClickHouse (evm_indexer) helpers ---

// keccak256("PairCreated(address,address,address,uint256)")
const PAIR_CREATED_TOPIC0 = '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31afa28d0e9';
const PAIR_CREATED_SHORT_TOPIC0 = '0x0d3648bd';

// keccak256("Swap(address,uint256,uint256,uint256,uint256,address)")
const SWAP_TOPIC0 = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
const SWAP_SHORT_TOPIC0 = '0xd78ad95f';

const shortAddrOf = (addr: string) => addr.substring(0, 10).toLowerCase();
const padTokenTo32Bytes = (addr: string) =>
  '0x000000000000000000000000' + addr.replace(/^0x/, '').toLowerCase();
const unpadTopic = (t: string) => '0x' + String(t).slice(-40).toLowerCase();

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
// Whitelist is wrapped in a WITH clause so it materializes once for both
// topic1/topic2 has() checks. max_query_size is bumped at the call site via
// HTTP clickhouse_settings (in-SQL SETTINGS is parsed too late to help).
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

// Sum amount0Out / amount1Out per pair from the V2 Swap event payload. data is
// "0x" + four uint256 (amount0In, amount1In, amount0Out, amount1Out); amount0Out
// occupies hex chars 131..194 and amount1Out 195..258. PREWHERE order matches
// the `logs_fast_lookup` projection layout (chain, short_address, short_topic0).
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

async function fetchClickhouse(options: FetchOptions, config: typeof chainConfig[string]): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances();
  const feeRates = getLogAdapterConfig(options);

  const emptyResult = (): FetchResultV2 => {
    const dailyFees = dailyVolume.clone(0.003);
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue: dailyFees.clone(1 - feeRates.revenueRatio),
      dailyRevenue: dailyFees.clone(feeRates.revenueRatio),
      dailyProtocolRevenue: 0,
    };
  };

  const whitelistedTokens = (await getDefaultDexTokensWhitelisted({ chain: options.chain })).map(t => t.toLowerCase());
  if (whitelistedTokens.length === 0) return emptyResult();

  const chSettings = { max_query_size: 4194304 } as const;
  const chainId = Number(options.api.chainId);

  // Step 1: discover whitelisted V2 pairs
  const pairRows = await queryClickhouse<PairRow>(
    buildDiscoverPairsSql(chainId, config.factory.toLowerCase(), whitelistedTokens.map(padTokenTo32Bytes)),
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

  // Step 2: aggregate per-pair Swap event amount-out for the day
  const swapRows = await queryClickhouse<SwapAggRow>(
    buildSwapAggSql(chainId, shortAddresses, pairAddresses, options.fromTimestamp, options.toTimestamp),
    undefined,
    chSettings,
  );

  for (const row of swapRows) {
    const tokens = pairToTokens[String(row.pair).toLowerCase()];
    if (!tokens) continue;
    dailyVolume.add(tokens.token0, row.amount0_out);
    dailyVolume.add(tokens.token1, row.amount1_out);
  }

  const dailyFees = dailyVolume.clone(0.003);
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees.clone(1 - feeRates.revenueRatio),
    dailyRevenue: dailyFees.clone(feeRates.revenueRatio),
    dailyProtocolRevenue: 0,
  };
}

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  if (!config) {
    throw Error(`config not found for chain ${options.chain}`);
  }

  if (config.source === 'LOGS') {
    const fetchFunction = getUniV2LogAdapter({ factory: config.factory, ...getLogAdapterConfig(options), allowReadPairs: options.chain === CHAIN.ZORA });
    return await fetchFunction(options);
  } else if (config.source === 'CLICKHOUSE') {
    return await fetchClickhouse(options, config);
  } else {
    throw Error(`source not found for chain ${options.chain}`);
  }
}

const methodology = {
  Fees: "User pays 0.3% fees on each swap.",
  UserFees: "User pays 0.3% fees on each swap.",
  Revenue: 'From 28 Dec 2025, 17% (0% before) fees on Ethereum, From 8 Mar 2026, 17% (0% before) fees on Optimism, Arbitrum, Base, Zora, XLayer chains shared to buy back and burn UNI.',
  ProtocolRevenue: 'Protocol make no revenue.',
  SupplySideRevenue: 'From 28 Dec 2025, 83% (100% before) fees on Ethereum are distributed to LPs, From 8 Mar 2026, 83% (100% before) fees on Optimism, Arbitrum, Base, Zora, XLayer chains are distributed to LPs.',
  HoldersRevenue: 'From 28 Dec 2025, 17% (0% before) fees on Ethereum shared to buy back and burn UNI, From 8 Mar 2026, 17% (0% before) fees on Optimism, Arbitrum, Base, Zora, XLayer chains shared to buy back and burn UNI (Tracked combined in Uniswap V3 adapter)',
}

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
}

export default adapter

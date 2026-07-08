import { CHAIN } from "../helpers/chains";
import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { httpPost } from "../utils/fetchURL";
import { filterPools } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";
import { getDefaultDexTokensWhitelisted } from "../helpers/lists";
import { formatAddress } from "../utils/utils";
import { ethers } from "ethers";
import { cache } from "@defillama/sdk";
import { queryClickhouse } from "../helpers/indexer";
import { Row } from "@clickhouse/client";

const methodology = {
  Fees: "Swap fees from paid by users.",
  UserFees: "User pays fees on each swap.",
  Revenue: 'From 28 Dec 2025, a portion of fees a collected to buy back and burn UNI on Ethereum, From 8 Mar 2026, on Optimism, Arbitrum, Base, WC, Zora, XLayer, From 2 Jun 2026, on Polygon, BSC, Celo.',
  ProtocolRevenue: 'Protocol make no revenue.',
  SupplySideRevenue: 'Fees distributed to LPs post protocol fee collection',
  HoldersRevenue: 'From 28 Dec 2025, a portion of fees a collected to buy back and burn UNI on Ethereum, From 8 Mar 2026, on Optimism, Arbitrum, Base, WC, Zora, XLayer, From 2 Jun 2026, on Polygon, BSC, Celo.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {},

  // revenue calculated here is combination of v2 & v3, supply side revenue can be negative when v2+v3 revenue > v3 ssr 
  // which is already compensated by v2 ssr, so cumulative holds correct
  allowNegativeValue: true,
};

const FEE_SWITCH_DATE: Record<string, string> = {
  [CHAIN.ETHEREUM]: "2025-12-29",
  [CHAIN.OPTIMISM]: "2026-03-08",
  [CHAIN.ARBITRUM]: "2026-03-08",
  [CHAIN.BASE]: "2026-03-08",
  [CHAIN.CELO]: "2026-06-02",
  [CHAIN.WC]: "2026-03-08",
  [CHAIN.ZORA]: "2026-03-08",
  [CHAIN.XLAYER]: "2026-03-08",
  [CHAIN.BSC]: "2026-06-02",
  [CHAIN.POLYGON]: "2026-06-02",
}

interface IFactoryConfig {
  factory: string;
  start: string;
  fromBlock?: number;
  usingIndexerToGetPools?: boolean;
}

const FACTORIES: Record<string, IFactoryConfig> = {
  // use on-chain events
  // [CHAIN.ZORA]: {
  //   factory: '0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb',
  //   start: '2024-08-02',
  //   fromBlock: 10320368,
  // },
  [CHAIN.CELO]: {
    factory: '0xAfE208a311B21f13EF87E33A90049fC17A7acDEc',
    start: '2022-07-08',
    fromBlock: 13916355,
  },

  // query clickhouse indexer
  [CHAIN.ETHEREUM]: {
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    start: '2021-05-05',
    fromBlock: 12369621,
    usingIndexerToGetPools: true,
  },
  [CHAIN.ARBITRUM]: {
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    start: '2021-06-02',
    fromBlock: 165,
    usingIndexerToGetPools: true,
  },
  [CHAIN.BSC]: {
    factory: '0xdB1d10011AD0Ff90774D0C6Bb92e5C5c8b4461F7',
    start: '2023-03-10',
    fromBlock: 26324014,
    usingIndexerToGetPools: true,
  },
  [CHAIN.BASE]: {
    factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    start: '2023-07-17',
    usingIndexerToGetPools: true,
  },
  [CHAIN.OPTIMISM]: {
    factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
    start: '2021-11-16',
    usingIndexerToGetPools: true,
  },
  [CHAIN.XLAYER]: {
    factory: '0x4B2ab38DBF28D31D467aA8993f6c2585981D6804',
    start: '2025-12-06',
    usingIndexerToGetPools: true,
  },
  
  // using cache
  [CHAIN.UNICHAIN]: {
    factory: '0x1f98400000000000000000000000000000000003',
    start: '2024-11-06',
  },
  [CHAIN.AVAX]: {
    factory: '0x740b1c1de25031C31FF4fC9A62f554A55cdC1baD',
    start: '2023-07-11',
  },
  [CHAIN.PLASMA]: {
    factory: '0xcb2436774C3e191c85056d248EF4260ce5f27A9D',
    start: '2025-09-09',
  },
  [CHAIN.BLAST]: {
    factory: '0x792edAdE80af5fC680d96a2eD80A44247D2Cf6Fd',
    start: '2024-03-06',
  },
  [CHAIN.NIBIRU]: {
    factory: '0x346239972d1fa486FC4a521031BC81bFB7D6e8a4',
    start: '2025-05-27',
  },
  [CHAIN.TEMPO]: {
    factory: '0x24a3d4757e330890a8b8978028c9e58e04611fd6',
    start: '2026-02-26',
  },
  [CHAIN.MEGAETH]: {
    factory: '0x3a5f0cd7d62452b7f899b2a5758bfa57be0de478',
    start: '2026-02-01',
  },
  [CHAIN.ROBINHOOD]: {
    factory: '0x1f7d7550B1b028f7571E69A784071F0205FD2EfA',
    start: '2026-05-24',
  },
  [CHAIN.WC]: {
    factory: '0x7a5028BDa40e7B173C278C5342087826455ea25a',
    start: '2024-08-02',
  },
}

const FIREPIT : Record<string, string> = {
  [CHAIN.ETHEREUM]: '0x0D5Cd355e2aBEB8fb1552F56c965B867346d6721',
  [CHAIN.UNICHAIN]: '0xe0A780E9105aC10Ee304448224Eb4A2b11A77eeB',
  [CHAIN.WC]: '0x455e844D286631566cF98D6cb2996149734618C6',
  [CHAIN.CELO]: '0x2758FbaA228D7d3c41dD139F47dab1a27bF9bc25',
  [CHAIN.ZORA]: '0x2f98eD4D04e633169FbC941BFCc54E785853b143',
  [CHAIN.XLAYER]: '0xe122E231cb52aea99690963Fd73E91e33E97468f',
  [CHAIN.ARBITRUM]: '0xB8018422bcE25D82E70cB98FdA96a4f502D89427',
  [CHAIN.OPTIMISM]: '0x94460443Ca27FFC1baeCa61165fde18346C91AbD',
  [CHAIN.BASE]: '0xFf77c0ED0B6b13A20446969107E5867abc46f53a',
  [CHAIN.BSC]: '0xa59FfbB55D91Fc32b44A06F0b9cc6036a4afbcE2',
  [CHAIN.POLYGON]: '0xa59FfbB55D91Fc32b44A06F0b9cc6036a4afbcE2',
}

const THRESHOLD_FUNCTION_ABI = 'uint256:threshold'
const RELEASED_EVENT_ABI = 'event Released (uint256 indexed nonce, address indexed recipient, address[] assets)'

async function fetchHoldersRevenue(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances()
  const firepit = FIREPIT[options.chain]
  if (!firepit || !FEE_SWITCH_DATE[options.chain] || options.dateString < FEE_SWITCH_DATE[options.chain]) {
    return dailyHoldersRevenue
  }

  const [releaseLogs, threshold] = await Promise.all([
    options.getLogs({ target: firepit, eventAbi: RELEASED_EVENT_ABI }),
    options.api.call({ target: firepit, abi: THRESHOLD_FUNCTION_ABI }),
  ])

  if (!releaseLogs.length || !threshold) return dailyHoldersRevenue

  const amount = Number(releaseLogs.length) * Number(threshold) / 1e18
  dailyHoldersRevenue.addCGToken("uniswap", amount)
  return dailyHoldersRevenue
}

// use Oku api
interface IOkuResponse {
  volume: number;
  fees: number;
}
const fetchFromOku = async (options: FetchOptions) => {
  try {
    const url = `https://omni.icarus.tools/${mappingChain(options.chain)}/cush/analyticsProtocolHistoric`;
    const body = {
      "params": [
        options.startTimestamp * 1000, //start
        options.endTimestamp * 1000, //end
        3600000 //interval
      ]
    }
    const response: IOkuResponse[] = (await httpPost(url, body)).result
    const dailyVolume = response.reduce((acc, item) => acc + item.volume, 0);
    const dailyFees = response.reduce((acc, item) => acc + item.fees, 0);
    const dailyHoldersRevenue = await fetchHoldersRevenue(options);
    const dailyRevenue = await dailyHoldersRevenue.getUSDValue();
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailySupplySideRevenue: dailyFees - dailyRevenue,
      dailyRevenue,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue,
    }
  } catch (e) {
    console.error(options.chain, e)
    return {}
  }
}
const mappingChain = (chain: string) => {
  if (chain === CHAIN.ERA) return "zksync"
  if (chain === CHAIN.ROOTSTOCK) return "rootstock"
  if (chain === CHAIN.POLYGON_ZKEVM) return "polygon-zkevm"
  if (chain === CHAIN.XDAI) return "gnosis"
  if (chain === CHAIN.LIGHTLINK_PHOENIX) return "lightlink"
  if (chain === CHAIN.SONIC) return "sonic"
  if (chain === CHAIN.ETHERLINK) return "etherlink"
  if (chain === CHAIN.NIBIRU) return "nibiru"
  if (chain === CHAIN.MONAD) return "monad"
  return chain
}

const okuChains = [
  //CHAIN.OPTIMISM,
  CHAIN.POLYGON,
  CHAIN.ERA,
  CHAIN.SEI,
  CHAIN.UNICHAIN,
  CHAIN.TAIKO,
  CHAIN.SCROLL,
  CHAIN.ROOTSTOCK,
  CHAIN.FILECOIN,
  CHAIN.BOBA,
  CHAIN.MANTLE,
  CHAIN.LINEA,
  CHAIN.XDAI,
  CHAIN.BOB,
  CHAIN.CORN,
  CHAIN.GOAT,
  CHAIN.HEMI,
  CHAIN.XDC,
  CHAIN.LIGHTLINK_PHOENIX,
  CHAIN.TELOS,
  //CHAIN.CELO,
  CHAIN.NIBIRU,
  CHAIN.MONAD,
  CHAIN.SONIC,
  CHAIN.ETHERLINK,
  CHAIN.SAGA,
  CHAIN.LENS,
  
  // CHAIN.ETHEREUM,
  // CHAIN.BSC,

  // CHAIN.BLAST,
  // CHAIN.LISK,
  // CHAIN.MOONBEAM,
  // CHAIN.POLYGON_ZKEVM,
  // CHAIN.MANTA,
]



okuChains.forEach(chain => {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: async (options: FetchOptions) => fetchFromOku(options),
  }
});


// build a custom getLog helper

const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)';
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)';

// --- ClickHouse (evm_indexer) pool discovery ---
// keccak256("PoolCreated(address,address,uint24,int24,address)")
const POOL_CREATED_TOPIC0 = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
const POOL_CREATED_SHORT_TOPIC0 = '0x783cca1c';
const chShortAddr = (a: string) => a.substring(0, 10).toLowerCase();
const chUnpadTopic = (t: string) => '0x' + String(t).slice(-40).toLowerCase();

interface PoolCreatedRow extends Row {
  token0_padded: string;
  token1_padded: string;
  fee_padded: string;
  pool: string;
}

// PoolCreated(token0, token1, uint24 fee, int24 tickSpacing, address pool):
//  - token0/token1 are indexed -> topic1/topic2 (32-byte padded)
//  - fee is indexed uint24     -> topic3 (decoded from hex in JS)
//  - data = tickSpacing (slot 0) + pool address (slot 1, right-aligned),
//    so the pool address is hex chars 91..130 of the data string.
// PREWHERE order matches the `logs_fast_lookup` projection
// (chain, short_address, short_topic0). No time bound: a pool created before
// the query window still trades within it, so all of the factory's pools are
// discovered (mirrors the on-chain PoolCreated scan / cache).
const buildDiscoverPoolsSql = (chainId: number, factory: string): string => `
  SELECT
    topic1 AS token0_padded,
    topic2 AS token1_padded,
    topic3 AS fee_padded,
    concat('0x', substring(data, 91, 40)) AS pool
  FROM evm_indexer.logs
  PREWHERE chain = ${chainId}
    AND short_address = '${chShortAddr(factory)}'
    AND short_topic0 = '${POOL_CREATED_SHORT_TOPIC0}'
    AND address = '${factory.toLowerCase()}'
    AND topic0 = '${POOL_CREATED_TOPIC0}'
`;

async function customUniswapGetLogsAdapter(props: { options: FetchOptions, factory: string, fromBlock: number, getRevenueShare?: (fee: number, options: FetchOptions) => number, onlyWhitelisedTokens?: boolean }) {
  const { options, factory, fromBlock, getRevenueShare, onlyWhitelisedTokens } = props;
  
  const whitelistedTokens: Array<string> | undefined = onlyWhitelisedTokens ? await getDefaultDexTokensWhitelisted({ chain: options.chain }) : undefined;
  
  const pairObject: IJSON<string[]> = {}
  const fees: any = {}
  const revenueShares: any = {}

  // try to get from cache first
  const cacheKey = `tvl-adapter-cache/cache/logs/${options.chain}/${factory.toLowerCase()}.json`
  const iface = new ethers.Interface([poolCreatedEvent])
  let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (logs && logs.length > 0) {
    // bad rpcs return bad log with undefined format, filter them out
    logs = logs.map((log: any) => iface.parseLog(log)?.args).filter((log: any) => !!log)
  
    logs.forEach((log: any) => {
      pairObject[log.pool] = [log.token0, log.token1]
      fees[log.pool] = (log.fee?.toString() || 0) / 1e6 // seem some protocol v3 forks does not have fee in the log when not use defaultPoolCreatedEvent
      revenueShares[log.pool] = getRevenueShare ? getRevenueShare(Number(log.fee?.toString() || 0) / 1e6, options) : 0
    })
  } else {
    if (FACTORIES[options.chain].usingIndexerToGetPools) {
      // query pools from the clickhouse indexer (evm_indexer.logs PoolCreated)
      const poolRows = await queryClickhouse<PoolCreatedRow>(
        buildDiscoverPoolsSql(Number(options.api.chainId), factory.toLowerCase()),
      )
      poolRows.forEach((row) => {
        const token0 = chUnpadTopic(row.token0_padded)
        const token1 = chUnpadTopic(row.token1_padded)
        // filter out pools without whitelisted tokens (same as the on-chain path)
        if (whitelistedTokens && (!whitelistedTokens.includes(formatAddress(token0)) || !whitelistedTokens.includes(formatAddress(token1)))) return;

        const pool = String(row.pool).toLowerCase()
        const fee = (parseInt(String(row.fee_padded), 16) || 0) / 1e6
        pairObject[pool] = [token0, token1]
        fees[pool] = fee
        revenueShares[pool] = getRevenueShare ? getRevenueShare(fee, options) : 0
      })
    } else {
      // query on-chain
      if (!FACTORIES[options.chain].fromBlock) throw Error(`gettting pools from factory PoolCreated events but missing fromBlock config chain ${options.chain} factory ${factory}`)
      const poolCreatedLogs = await props.options.getLogs({
        target: factory,
        eventAbi: poolCreatedEvent,
        fromBlock: fromBlock,
        cacheInCloud: true,
      })
      poolCreatedLogs.forEach((log: any) => {
        // filter out pools without whitelisted tokens
        if (whitelistedTokens && (!whitelistedTokens.includes(formatAddress(log.token0)) || !whitelistedTokens.includes(formatAddress(log.token1)))) return;
        
        pairObject[log.pool] = [log.token0, log.token1]
        fees[log.pool] = (log.fee?.toString() || 0) / 1e6
        revenueShares[log.pool] = getRevenueShare ? getRevenueShare(Number(log.fee?.toString() || 0) / 1e6, options) : 0
      })
    }
  }
  
  const filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances })
  
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const allLogs = await options.getLogs({ targets: Object.keys(filteredPairs), eventAbi: poolSwapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = Object.keys(filteredPairs)[index]
    const [token0, token1] = pairObject[pair]
    const fee = fees[pair]
    const revenueRatio = revenueShares[pair]
    logs.forEach((log: any) => {
      addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
      addOneToken({ chain: options.chain, balances: dailySupplySideRevenue, token0, token1, amount0: log.amount0.toString() * (fee - revenueRatio), amount1: log.amount1.toString() * (fee - revenueRatio) })
    })
  })

  const dailyHoldersRevenue = await fetchHoldersRevenue(options)
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue : dailyHoldersRevenue, dailySupplySideRevenue, dailyProtocolRevenue: 0, dailyHoldersRevenue }
}

function getRevenueShare(fee: number, options: FetchOptions): number {
  if (!FEE_SWITCH_DATE[options.chain] || options.dateString < FEE_SWITCH_DATE[options.chain]) return 0;
  if (fee === 0.0001) return 0.000025;
  if (fee === 0.0005) return 0.000125;
  if (fee === 0.003) return 0.0005;
  if (fee === 0.01) return 0.001666;
  return 0;
}

// use getUniV3LogAdapter
for (const [chain, factory] of Object.entries(FACTORIES)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: async (options: FetchOptions) => {
      return await customUniswapGetLogsAdapter({
        options,
        factory: factory.factory,
        fromBlock: factory.fromBlock as number,
        getRevenueShare,
      })
    },
    start: factory.start,
  };
}

// export const UNISWAP_V3_QUERY = async (options: FetchOptions) => {
//   const tokens = await getDefaultDexTokensWhitelisted({ chain: options.chain });
//   const cleanVolumeExpr = tokens.length === 0
//     ? 'amount_usd'
//     : `CASE 
//               WHEN token_sold_address IN (${tokens.toString()})
//               AND token_bought_address IN (${tokens.toString()})
//               THEN amount_usd
//               ELSE 0
//           END`;
//   return `
//     SELECT
//         project_contract_address AS pool
//         , SUM(${cleanVolumeExpr}) AS clean_volume_usd
//         , SUM(amount_usd) AS total_volume_usd 
//     FROM dex.trades
//     WHERE blockchain = '${options.chain}'
//       AND project = 'uniswap'
//       AND version = '3'
//       AND block_time >= FROM_UNIXTIME(${options.fromTimestamp})
//       AND block_time <= FROM_UNIXTIME(${options.toTimestamp})
//     GROUP BY
//       project_contract_address
//   `;
// }

// async function fetchDune(options: FetchOptions) {
//   const dailyVolume = options.createBalances();
//   const dailyFees = options.createBalances();

//   const poolsAndVolumes = await queryDune('3996608', {
//     fullQuery: await UNISWAP_V3_QUERY(options),
//   }, options);
//   const poolFees = await options.api.multiCall({
//     abi: 'uint256:fee',
//     calls: poolsAndVolumes.map((item: any) => item.pool),
//     permitFailure: true,
//   })
//   for (let i = 0; i < poolsAndVolumes.length; i++) {
//     if (poolsAndVolumes[i].clean_volume_usd !== null && poolsAndVolumes[i].total_volume_usd !== null) {
//       const fee = poolFees[i] ? Number(poolFees[i] / 1e6) : 0
//       // const revenueRatio = getRevenueShare(fee, options)
//       // add clean volume, exclude blacklist token
//       dailyVolume.addUSDValue(poolsAndVolumes[i].clean_volume_usd)
//       dailyFees.addUSDValue(Number(poolsAndVolumes[i].total_volume_usd) * fee)
//     }
//   }

//   const dailyHoldersRevenue = await fetchHoldersRevenue(options)

//   const dailySupplySideRevenue = dailyFees.clone()
//   dailySupplySideRevenue.subtract(dailyHoldersRevenue)
//   return {
//     dailyVolume,
//     dailyFees,
//     dailyUserFees: dailyFees,
//     dailySupplySideRevenue,
//     dailyRevenue: dailyHoldersRevenue,
//     dailyProtocolRevenue: 0,
//     dailyHoldersRevenue,
//   }
// }

// (adapter.adapter as BaseAdapter)[CHAIN.ARBITRUM] = {
//   fetch: async (options: FetchOptions) => {
//     return await fetchDune(options);
//   },
// };

// (adapter.adapter as BaseAdapter)[CHAIN.BASE] = {
//   fetch: async (options: FetchOptions) => {
//     return await fetchDune(options);
//   },
// };

// (adapter.adapter as BaseAdapter)[CHAIN.OPTIMISM] = {
//   fetch: async (options: FetchOptions) => {
//     return await fetchDune(options);
//   },
// };

// (adapter.adapter as BaseAdapter)[CHAIN.WC] = {
//   fetch: async (options: FetchOptions) => {
//     return await fetchDune(options);
//   },
// };

// (adapter.adapter as BaseAdapter)[CHAIN.ZORA] = {
//   fetch: async (options: FetchOptions) => {
//     return await fetchDune(options);
//   },
// };

// (adapter.adapter as BaseAdapter)[CHAIN.CELO] = {
//   fetch: async (options: FetchOptions) => {
//     return await fetchDune(options);
//   },
// };

// (adapter.adapter as BaseAdapter)[CHAIN.XLAYER] = {
//   fetch: async (options: FetchOptions) => {
//     return await fetchDune(options);
//   },
// };

export default adapter;

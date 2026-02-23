// import { FetchOptions, SimpleAdapter } from "../adapters/types";
// import { httpGet } from "../utils/fetchURL";

// const adapter: SimpleAdapter = {
//   version: 1,
//   adapter: {
//   },
// };

// const chains = [
//   "ethereum", "optimism", "base", "arbitrum", "polygon", "blast", "zora", "wc",
//   "ink", "soneium", "avax", "bsc", "unichain"
// ]

// chains.forEach(chain => adapter.adapter[chain] = { fetch: fetch as any })

// export default adapter;

// const dataCache = {} as any

// async function fetch(_: any, _1: any, { api, startOfDay, }: FetchOptions) {
//   switch (api.chain) {
//     case 'unichain': api.chainId = 130; break;
//   }
//   const endpoint = `https://interface.gateway.uniswap.org/v2/uniswap.explore.v1.ExploreStatsService/ExploreStats?connect=v1&encoding=json&message=%7B%22chainId%22%3A%22${api.chainId}%22%7D`

//   try {
//     if (!dataCache[endpoint]) dataCache[endpoint] = await httpGet(endpoint, {
//       headers: {
//         'origin': 'https://app.uniswap.org',
//       }
//     })
//     const res = await dataCache[endpoint]
//     const datapoint = res.stats.historicalProtocolVolume.Month.v4.find((i: any) => i.timestamp === startOfDay)

//     if (!datapoint) throw new Error('No datapoint found for given timestamp: ' + startOfDay)

//     let volumeUSD = datapoint.value

//     // remove bad data from farming/spaming trading
//     if (api.chain === 'bsc' && startOfDay === 1749340800) {
//       // 11B volume from KOGE - 0xe6DF05CE8C8301223373CF5B969AFCb1498c5528
//       volumeUSD -= 11_000_000_000
//     }

//     return { dailyVolume: volumeUSD }

//   } catch (e) {
//     api.log(`Uniswap v4: Failed to fetch data for ${api.chain}`)
//     return { dailyVolume: '0' }
//   }

// }

import * as sdk from "@defillama/sdk";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from '../helpers/coreAssets.json';
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { formatAddress } from "../utils/utils";

interface IUniswapConfig {
  poolManager: string;
  positionManager: string;
  source: 'LOGS';
  start: string;
  blacklistPoolIds?: Array<string>;
}

interface IPool {
  poolId: string;
  poolKey: string;
  currency0: string;
  currency1: string;
}

const SwapEvent = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
const FunctionPoolKeys = 'function poolKeys(bytes25) view returns(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)';

const Configs: Record<string, IUniswapConfig> = {
  [CHAIN.ETHEREUM]: {
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    positionManager: '0xbd216513d74c8cf14cf4747e6aaa6420ff64ee9e',
    source: 'LOGS',
    start: '2025-01-24',
    blacklistPoolIds: [
      '0x78f394840909614a7a1213503e4207d7e62f4a07af85561fc420e7ee6d22d6ce',
      '0xAF2AD381E7EA687D397077F93D4F71352247CC8975E0A96A15AFF9D2EA19716E', //TARA/USDT
      '0xAB3C835C894B0FABCF7D2F44A6322217DECEB6B6E5F7B0A7706A9D085935539F', //TARA/USDC
    ],
  },
  [CHAIN.UNICHAIN]: {
    poolManager: '0x1f98400000000000000000000000000000000004',
    positionManager: '0x4529a01c7a0410167c5740c487a8de60232617bf',
    source: 'LOGS',
    start: '2025-01-24',
  },
  [CHAIN.OPTIMISM]: {
    poolManager: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
    positionManager: '0x3c3ea4b57a46241e54610e5f022e5c45859a1017',
    source: 'LOGS',
    start: '2025-01-24',
  },
  [CHAIN.BASE]: {
    poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b',
    positionManager: '0x7c5f5a4bbd8fd63184577525326123b519429bdc',
    source: 'LOGS',
    start: '2025-01-24',
  },
  [CHAIN.ARBITRUM]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
    positionManager: '0xd88f38f930b7952f2db2432cb002e7abbf3dd869',
    source: 'LOGS',
    start: '2025-01-24',
  },
  [CHAIN.POLYGON]: {
    poolManager: '0x67366782805870060151383f4bbff9dab53e5cd6',
    positionManager: '0x1ec2ebf4f37e7363fdfe3551602425af0b3ceef9',
    source: 'LOGS',
    start: '2025-01-24',
  },
  [CHAIN.BLAST]: {
    poolManager: '0x1631559198a9e474033433b2958dabc135ab6446',
    source: 'LOGS',
    positionManager: '0x4ad2f4cca2682cbb5b950d660dd458a1d3f1baad',
    start: '2025-01-24',
  },
  [CHAIN.ZORA]: {
    poolManager: '0x0575338e4c17006ae181b47900a84404247ca30f',
    source: 'LOGS',
    positionManager: '0xf66c7b99e2040f0d9b326b3b7c152e9663543d63',
    start: '2025-01-24',
  },
  [CHAIN.WC]: {
    poolManager: '0xb1860d529182ac3bc1f51fa2abd56662b7d13f33',
    source: 'LOGS',
    positionManager: '0xc585e0f504613b5fbf874f21af14c65260fb41fa',
    start: '2025-01-24',
  },
  [CHAIN.INK]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
    source: 'LOGS',
    positionManager: '0x1b35d13a2e2528f192637f14b05f0dc0e7deb566',
    start: '2025-01-29',
  },
  [CHAIN.SONEIUM]: {
    poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
    source: 'LOGS',
    positionManager: '0x1b35d13a2e2528f192637f14b05f0dc0e7deb566',
    start: '2025-01-29',
  },
  [CHAIN.AVAX]: {
    poolManager: '0x06380c0e0912312b5150364b9dc4542ba0dbbc85',
    source: 'LOGS',
    positionManager: '0xb74b1f14d2754acfcbbe1a221023a5cf50ab8acd',
    start: '2025-01-24',
  },
  [CHAIN.BSC]: {
    poolManager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
    source: 'LOGS',
    positionManager: '0x7a4a5c919ae2541aed11041a1aeee68f1287f95b',
    start: '2025-01-24',
  },
  [CHAIN.MONAD]: {
    poolManager: '0x188d586ddcf52439676ca21a244753fa19f9ea8e',
    source: 'LOGS',
    positionManager: '0x5b7eC4a94fF9beDb700fb82aB09d5846972F4016',
    start: '2025-11-23',
  },
  [CHAIN.XLAYER]: {
    poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32',
    source: 'LOGS',
    positionManager: '0xcf1eafc6928dc385a342e7c6491d371d2871458b',
    start: '2026-01-07'
  }
}

// export const UNISWAP_V4_DUNE_QUERY = (fromTime: number, toTime: number) => {
//   return `
//     WITH transactions AS (
//       SELECT
//         swaps.chain AS chain,
//         pools.currency0 AS token,
//         ABS(swaps.amount0) AS amount,
//         ABS(swaps.amount0) * swaps.fee / 1000000 AS feeAmount
//       FROM uniswap_v4_multichain.poolmanager_evt_swap AS swaps
//       INNER JOIN uniswap_v4_multichain.poolmanager_evt_initialize AS pools
//         ON swaps.chain = pools.chain AND swaps.id = pools.id
//       WHERE
//         swaps.evt_block_time <= from_unixtime(${toTime}) AND swaps.evt_block_time >= from_unixtime(${fromTime})
//         AND (
//           (swaps.chain = 'ethereum' AND swaps.contract_address = 0x000000000004444c5dc75cb358380d2e3de08a90)
//           OR (swaps.chain = 'base' AND swaps.contract_address = 0x498581ff718922c3f8e6a244956af099b2652b2b)
//           OR (swaps.chain = 'unichain' AND swaps.contract_address = 0x1f98400000000000000000000000000000000004)
//           OR (swaps.chain = 'optimism' AND swaps.contract_address = 0x9a13f98cb987694c9f086b1f5eb990eea8264ec3)
//           OR (swaps.chain = 'arbitrum' AND swaps.contract_address = 0x360e68faccca8ca495c1b759fd9eee466db9fb32)
//           OR (swaps.chain = 'polygon' AND swaps.contract_address = 0x67366782805870060151383f4bbff9dab53e5cd6)
//           OR (swaps.chain = 'blast' AND swaps.contract_address = 0x1631559198a9e474033433b2958dabc135ab6446)
//           OR (swaps.chain = 'zora' AND swaps.contract_address = 0x0575338e4c17006ae181b47900a84404247ca30f)
//           OR (swaps.chain = 'worldchain' AND swaps.contract_address = 0xb1860d529182ac3bc1f51fa2abd56662b7d13f33)
//           OR (swaps.chain = 'ink' AND swaps.contract_address = 0x360e68faccca8ca495c1b759fd9eee466db9fb32)
//           OR (swaps.chain = 'avalanche_c' AND swaps.contract_address = 0x06380c0e0912312b5150364b9dc4542ba0dbbc85)
//           OR (swaps.chain = 'bnb' AND swaps.contract_address = 0x28e2ea090877bf75740558f6bfb36a5ffee9e9df)
//         )
//     )
//     SELECT
//       chain,
//       token,
//       SUM(amount) AS totalSwapAmount,
//       SUM(feeAmount) AS totalSwapFee
//     FROM transactions
//     GROUP BY chain, token
//   `;
// }

// async function prefetchWithDune(options: FetchOptions) {
//   return await queryDune('3996608',{
//     fullQuery: UNISWAP_V4_DUNE_QUERY(options.fromTimestamp, options.toTimestamp),
//   });
// }

function getPoolKey(poolId: string): string {
  return poolId.slice(0, 52);
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyVolume = options.createBalances()

  const config = Configs[options.chain];
  if (!config) {
    throw Error(`config not found for chain ${options.chain}`);
  }

  if (config.source === 'LOGS') {
    const events = await sdk.getEventLogs({
      chain: options.chain,
      target: config.poolManager,
      eventAbi: SwapEvent,
      fromBlock: Number(options.fromApi.block),
      toBlock: Number(options.toApi.block),
      maxBlockRange: 10000,
      onlyArgs: true,
    });

    if (events.length > 0) {
      const pools: {[key: string]: IPool | null} = {}
      for (const event of events) {
        if (config.blacklistPoolIds && config.blacklistPoolIds.includes(event.id)) {
          // ignore blacklist pools
          continue;
        }
        pools[event.id] = null
      }

      // query pools info
      const poolIds = Object.keys(pools)
      const poolKeys = await options.api.multiCall({
        abi: FunctionPoolKeys,
        calls: poolIds.map(poolId => {
          return {
            target: config.positionManager,
            params: [getPoolKey(poolId)],
          }
        }),
        permitFailure: true,
      })

      for (let i = 0; i < poolIds.length; i++) {
        if (poolKeys[i]) {
          // uniswap v4 supports hooks execute before and after swap
          // so poolManager may be emit Swap event without the liquidity pool was even existed
          // these logics are likely can be ignored because it didn't work as LP or swap from users
          // to check a valid liquidity pool, we need atleast one token is not null address
          if (poolKeys[i].currency0 !== ADDRESSES.null || poolKeys[i].currency1 !== ADDRESSES.null) {
            pools[poolIds[i]] = {
              poolId: poolIds[i],
              poolKey: getPoolKey(poolIds[i]),
              currency0: String(poolKeys[i].currency0),
              currency1: String(poolKeys[i].currency1),
            }
          }
        }
      }
      
      for (const event of events) {
        const poolId = String(event.id)
        if (pools[poolId] as IPool) {
          const blacklistTokens = new Set(getDefaultDexTokensBlacklisted(options.chain))
          if (blacklistTokens.has(formatAddress((pools[poolId] as IPool).currency0)) || blacklistTokens.has(formatAddress((pools[poolId] as IPool).currency1))) {
            continue;
          }

          const token = (pools[poolId] as IPool).currency0
          dailyFees.add(token, Math.abs(Number(event.amount0)) * (Number(event.fee) / 1e6))
          dailyVolume.add(token, Math.abs(Number(event.amount0)))
        }
      }      
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {},
  // prefetch: prefetchWithDune,
  methodology: {
    Fees: 'Swap fees paid by users.',
    UserFees: 'Swap fees paid by users.',
    Revenue: 'Protocol make no revenue.',
    ProtocolRevenue: 'Protocol make no revenue.',
    SupplySideRevenue: 'All fees are distributed to LPs.',
    HoldersRevenue: 'No revenue for UNI holders.',
  },
  fetch,
};

for (const [chain, config] of Object.entries(Configs)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    start: config.start,
  }
}

export default adapter;

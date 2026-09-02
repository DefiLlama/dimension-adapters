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

// async function fetch(options: FetchOptions) {
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
import { queryDune } from "../helpers/dune";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { isCoreAsset } from "../helpers/prices";
import {
  getEstablishedTokens, washDayStart, WASH_DUST_USD, WASH_MIN_TRADES, WASH_MIN_USD,
  WASH_TRADES_PER_EOA, WASH_USD_MIN_TRADES_PER_EOA, WASH_USD_PER_EOA,
} from "../helpers/uniswap";
import { formatAddress } from "../utils/utils";
import { ethers } from "ethers";

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
      '0xaf2ad381e7ea687d397077f93d4f71352247cc8975e0a96a15aff9d2ea19716e', //TARA/USDT
      '0xab3c835c894b0fabcf7d2f44a6322217deceb6b6e5f7b0a7706a9d085935539f', //TARA/USDC
      '0x3A1687AF1B8C0ABAA67BE1F17DF378CA69BDA27C2EEA008BCD7BF30A3D293EA0', //DOT/USDC
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
  },
  [CHAIN.CELO]: {
    poolManager: '0x288dc841a52fca2707c6947b3a777c5e56cd87bc',
    source: 'LOGS',
    positionManager: '0xf7965f3981e4d5bc383bfbcb61501763e9068ca9',
    start: '2025-08-22',
  },
  [CHAIN.MEGAETH]: {
    poolManager: '0xacb7e78fa05d562e0a5d3089ec896d57d057d38e',
    source: 'LOGS',
    positionManager: '0x9ae0921e981aaa7308f176f8d4f9129b9247c89d',
    start: '2026-01-30',
  },
  [CHAIN.TEMPO]: {
    poolManager: '0x33620f62c5b9b2086dd6b62f4a297a9f30347029',
    source: 'LOGS',
    positionManager: '0x3fc79444f8eacc1894775493ff3fa41f1e35ce11',
    start: '2026-02-24',
  },
  [CHAIN.ROBINHOOD]: {
    poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951',
    positionManager: '0x58daec3116aae6d93017baaea7749052e8a04fa7',
    source: 'LOGS',
    start: '2026-01-01',
  },
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

// Protocol fee (UNIfication fee switch, live on v4 from 2026-07-27) is stored per
// pool in PoolManager slot0 as a uint24: low 12 bits = zeroForOne fee, high 12
// bits = oneForZero fee, both in pips (1e6 = 100%, max 1000 = 0.1%). It is taken
// from the swap input before the LP fee, and the Swap event's `fee` already is
// the combined rate (protocol + LP - protocol*LP). Read at the window end block
// via extsload so refills reproduce the rate that applied on that day.
// Layout: v4-core Slot0.sol (PROTOCOL_FEE_OFFSET = 184), StateLibrary.sol (POOLS_SLOT = 6).
const EXTSLOAD_ABI = 'function extsload(bytes32 slot) view returns (bytes32)'
const POOLS_SLOT = ethers.zeroPadValue('0x06', 32)
function slot0Slot(poolId: string): string {
  return ethers.keccak256(ethers.concat([poolId, POOLS_SLOT]))
}
async function getProtocolFees(options: FetchOptions, poolManager: string, poolIds: string[]): Promise<Record<string, { zeroForOne: number; oneForZero: number }>> {
  const slots: any[] = await options.api.multiCall({
    abi: EXTSLOAD_ABI,
    calls: poolIds.map(poolId => ({ target: poolManager, params: [slot0Slot(poolId)] })),
    permitFailure: true,
  })
  const fees: Record<string, { zeroForOne: number; oneForZero: number }> = {}
  poolIds.forEach((poolId, i) => {
    if (!slots[i]) return
    const protocolFee = Number((BigInt(slots[i]) >> 184n) & 0xffffffn)
    fees[poolId] = { zeroForOne: protocolFee & 0xfff, oneForZero: protocolFee >> 12 }
  })
  return fees
}

// Wash-trading filter. The scam here is a fake-ticker token (several unrelated
// contracts all called "OpenAI"/"Claude") paired against real USDC, churned by a
// handful of bots for a day or two, then rugged. The core-asset pricing from
// #8376 actively validates them because the USDC leg is genuine, so each lands
// ~$150M of fake volume. Flags 19.1% of v4 volume over 30d, 78.9% on Base.
// Thresholds live in helpers/uniswap.ts.
//
// Turnover, the Swap log's `sender`, and repeated trade sizes were all measured
// and none separate wash from a hot memecoin launch - only EOA concentration
// does, which needs tx.from, hence Dune. Concentration alone also can't tell
// wash from MM/relayer churn on a real token, so flagged pools whose sides are
// all established (core asset or CoinGecko-listed) are spared, and priced-but-
// dust pools (creator-coin bot churn) are never flagged - see helpers/uniswap.ts.
//
// Live, a pool only trips once it clears the daily floor, so its first hours can
// still land; refilling the day drops them.

// uniswap_v4_multichain's own chain slugs. Chains absent from Dune (zora,
// blast, soneium, megaeth) simply get no filter.
const DUNE_CHAIN: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.BASE]: 'base',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.BSC]: 'bnb',
  [CHAIN.AVAX]: 'avalanche_c',
  [CHAIN.UNICHAIN]: 'unichain',
  [CHAIN.WC]: 'worldchain',
  [CHAIN.INK]: 'ink',
  [CHAIN.CELO]: 'celo',
  [CHAIN.XLAYER]: 'xlayer',
  [CHAIN.MONAD]: 'monad',
  [CHAIN.TEMPO]: 'tempo',
  [CHAIN.ROBINHOOD]: 'robinhood',
};

// Counts come from raw Swap events because dex.trades misses ~7% of pool-days
// (anything it can't price); USD comes from dex.trades, where `maker` is the v4
// pool id. Lets a Dune failure throw - reporting unfiltered would republish the
// wash volume as real.
const prefetch: any = async (options: FetchOptions) => {
  const dayStart = washDayStart(options);
  const chains = Object.values(DUNE_CHAIN).map(c => `'${c}'`).join(',');
  const fullQuery = `
    WITH ev AS (
      SELECT chain, id, COUNT(*) AS trades, COUNT(DISTINCT evt_tx_from) AS eoas
      FROM uniswap_v4_multichain.poolmanager_evt_swap
      WHERE chain IN (${chains})
        AND evt_block_time >= from_unixtime(${dayStart})
        AND evt_block_time < from_unixtime(${dayStart + 86400})
      GROUP BY chain, id
    ),
    usd AS (
      SELECT blockchain, maker, SUM(amount_usd) AS usd
      FROM dex.trades
      WHERE blockchain IN (${chains})
        AND project = 'uniswap'
        AND version = '4'
        AND block_time >= from_unixtime(${dayStart})
        AND block_time < from_unixtime(${dayStart + 86400})
      GROUP BY blockchain, maker
    )
    SELECT ev.chain, CAST(ev.id AS VARCHAR) AS id
    FROM ev
    LEFT JOIN usd u ON u.blockchain = ev.chain AND u.maker = ev.id
    WHERE ((
      ev.trades >= ${WASH_MIN_TRADES}
      AND ev.trades / CAST(ev.eoas AS DOUBLE) >= ${WASH_TRADES_PER_EOA}
    ) OR (
      COALESCE(u.usd, 0) >= ${WASH_MIN_USD}
      AND COALESCE(u.usd, 0) / CAST(ev.eoas AS DOUBLE) >= ${WASH_USD_PER_EOA}
      AND ev.trades / CAST(ev.eoas AS DOUBLE) >= ${WASH_USD_MIN_TRADES_PER_EOA}
    ))
    -- priced-but-dust pools are noise either way; NULL usd (unpriced by Dune) stays flagged
    AND NOT (u.usd IS NOT NULL AND u.usd < ${WASH_DUST_USD})`;

  const rows: any[] = await queryDune('3996608', { fullQuery }, options);
  const washPools: Record<string, Set<string>> = {};
  for (const row of rows) {
    if (!row.chain || !row.id) continue;
    (washPools[row.chain] ??= new Set()).add(String(row.id).toLowerCase());
  }
  return { washPools };
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances()
  const dailyVolume = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

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
      const skipPools = new Set((config.blacklistPoolIds ?? []).map(i => i.toLowerCase()))

      const pools: { [key: string]: IPool | null } = {}
      for (const event of events) {
        if (skipPools.has(String(event.id).toLowerCase())) {
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

      const blacklistTokens = new Set(getDefaultDexTokensBlacklisted(options.chain))
      const protocolFees = await getProtocolFees(options, config.poolManager, Object.keys(pools).filter(id => pools[id]))
      const washPools = options.preFetchedResults?.washPools?.[DUNE_CHAIN[options.chain]]
      // flagged pools whose sides are all established (core or CG-listed) are
      // spared - one batched price lookup, see getEstablishedTokens
      let establishedTokens = new Set<string>()
      if (washPools?.size) {
        const flaggedTokens = Object.values(pools)
          .filter((p): p is IPool => !!p && washPools.has(p.poolId.toLowerCase()))
          .flatMap(p => [p.currency0, p.currency1])
        if (flaggedTokens.length) establishedTokens = await getEstablishedTokens(options.chain, flaggedTokens)
      }
      for (const event of events) {
        const poolId = String(event.id)
        if (pools[poolId] as IPool) {
          const { currency0, currency1 } = pools[poolId] as IPool
          if (blacklistTokens.has(formatAddress(currency0)) || blacklistTokens.has(formatAddress(currency1))) {
            continue;
          }

          if (washPools?.has(poolId.toLowerCase())
            && !(establishedTokens.has(currency0.toLowerCase()) && establishedTokens.has(currency1.toLowerCase()))) {
            continue;
          }

          // price via the native coin (currency0 is the zero address in native pools)
          // or a core asset where possible, so long-tail tokens with thin liquidity
          // don't set the USD value - same preference addOneToken applies for v2/v3
          const useToken0 = currency0 === ADDRESSES.null || isCoreAsset(options.chain, currency0) || !isCoreAsset(options.chain, currency1)
          const token = useToken0 ? currency0 : currency1
          const amount = Math.abs(Number(useToken0 ? event.amount0 : event.amount1))
          // swap deltas are from the swapper's view: negative = paid in, so
          // amount0 < 0 is a zeroForOne swap and picks that direction's protocol fee.
          // Both rates are applied to the priced side (same approximation as the
          // fee line above), protocol fee is a share of the same gross amount.
          const zeroForOne = Number(event.amount0) < 0
          const pf = protocolFees[poolId]
          const protocolPips = pf ? (zeroForOne ? pf.zeroForOne : pf.oneForZero) : 0
          const swapPips = Number(event.fee)
          dailyFees.add(token, amount * (swapPips / 1e6))
          dailyRevenue.add(token, amount * (protocolPips / 1e6))
          dailySupplySideRevenue.add(token, amount * ((swapPips - protocolPips) / 1e6))
          dailyVolume.add(token, amount)
        }
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue, // all protocol fees fund the UNI buyback and burn (UNIfication)
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {},
  prefetch,
  methodology: {
    Volume: 'Swap volume, excluding wash trading: pools whose daily trades come from too few distinct addresses to be organic, unless every pool token is a core asset or CoinGecko-listed.',
    Fees: 'Swap fees paid by traders: the pool LP fee plus, since the v4 fee switch (27 Jul 2026), the per-pool protocol fee taken from the swap input.',
    UserFees: 'Swap fees paid by traders.',
    Revenue: 'Per-pool protocol fee read from the PoolManager (0 before the 27 Jul 2026 fee switch), all of it used to buy back and burn UNI.',
    ProtocolRevenue: 'Protocol treasury keeps nothing, protocol fees go to the UNI buyback and burn.',
    SupplySideRevenue: 'LP fee share of swap fees (100% of fees before the 27 Jul 2026 fee switch).',
    HoldersRevenue: 'Protocol fees used to buy back and burn UNI (since 27 Jul 2026).',
  },
  fetch,
};

for (const [chain, config] of Object.entries(Configs)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    start: config.start,
  }
}

export default adapter;

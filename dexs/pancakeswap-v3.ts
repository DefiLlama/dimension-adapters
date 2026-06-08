import { CHAIN } from "../helpers/chains";
import { getDefaultDexTokensWhitelisted } from "../helpers/lists";
import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from '../helpers/uniswap';
import { queryClickhouse } from "../helpers/indexer";
import { queryDune } from "../helpers/dune";
import { Row } from "@clickhouse/client";
import axios from "axios";

const METRIC = {
  SWAP_FEES: 'Token Swap Fees',
  PROTOCOL_REVENUE: 'Swap Fees To Protocol',
  HOLDERS_REVENUE: 'Swap Fees To Holders',
  LP_REVENUE: 'Swap Fees To Liquidity Providers',
  BUY_BACK_AND_BURN: 'Buy Back And Burn CAKE',
}

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

interface Ifactory {
  address: string;
  start: string;
  blacklistTokens?: Array<string>;
}

const factories: {[key: string]: Ifactory} = {
  [CHAIN.BSC]: {
    start: '2023-04-01',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
  [CHAIN.ETHEREUM]: {
    start: '2023-04-01',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.POLYGON_ZKEVM]: {
    start: '2023-06-29',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
  [CHAIN.ERA]: {
    start: '2024-01-01',
    address: '0x1bb72e0cbbea93c08f535fc7856e0338d7f7a8ab',
  },
  [CHAIN.ARBITRUM]: {
    start: '2023-08-08',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.LINEA]: {
    start: '2023-08-24',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.BASE]: {
    start: '2023-09-01',
    address: '0x0bfbcf9fa4f9c56b0f40a671ad40e0805a091865',
  },
  [CHAIN.OP_BNB]: {
    start: '2024-01-01',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
  },
  [CHAIN.MONAD]: {
    start: '2025-11-23',
    address: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865'
  }
}

export const PANCAKESWAP_V3_QUERY_SOLANA = (fromTime: number, toTime: number) => {
  return `
    SELECT
      project_program_id AS pool
      , SUM(amount_usd) AS volume_usd
    FROM dex_solana.trades
    WHERE project = 'pancakeswap'
      AND version = 3
      AND block_time >= FROM_UNIXTIME(${fromTime})
      AND block_time <= FROM_UNIXTIME(${toTime})
    GROUP BY
      project_program_id
  `;
}

// Source: https://docs.pancakeswap.finance/trade/trading-faq/swap-faq#what-will-be-the-trading-fee-breakdown-for-v3-exchange
function getProtocolRevenueRatio(fee: number): number {
  if (fee === 0.0001) return 0.18; // 18% swap fee
  if (fee === 0.0005) return 0.19; // 19% swap fee
  if (fee === 0.0025) return 0.09; // 9% swap fee
  if (fee === 0.01) return 0.09; // 9% swap fee
  return 0;
}

function getHolderRevenueRatio(fee: number): number {
  if (fee === 0.0001) return 0.15; // 15% swap fee
  if (fee === 0.0005) return 0.15; // 15% swap fee
  if (fee === 0.0025) return 0.23; // 23% swap fee
  if (fee === 0.01) return 0.23; // 23% swap fee
  return 0;
}

// --- BSC V3 data via indexer v2 (ClickHouse) ---

// keccak256("PoolCreated(address,address,uint24,int24,address)")
const POOL_CREATED_TOPIC0 = '0x783cca1c0412dd0d695e784568c96da2e9c22ff989357a2e8b1d9b2b4e6b7118';
const POOL_CREATED_SHORT_TOPIC0 = '0x783cca1c';

// keccak256("Swap(address,address,int256,int256,uint160,uint128,int24,uint128,uint128)")
// Unique to PancakeV3 (different from UniV3 Swap because of the extra
// protocolFeesToken0/1 fields), so a topic0-only filter cleanly isolates all
// PancakeV3 swaps without needing a per-pool address IN-list.
const V3_SWAP_TOPIC0 = '0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83';
const V3_SWAP_SHORT_TOPIC0 = '0x19b47279';

const shortAddrOf = (addr: string) => addr.substring(0, 10).toLowerCase();
const unpadTopic = (t: string) => '0x' + String(t).slice(-40).toLowerCase();

// One combined SQL: aggregate per-pool Swap input amounts and JOIN with the
// factory's PoolCreated events to enrich each row with token0/token1/fee. The
// JOIN runs over ~3K active-pool rows on the inner side (the Swap aggregate
// CTE) and the factory's ~136K PoolCreated rows on the outer side.
//
// Decode notes:
// - PancakeV3 Swap data layout: amount0 (int256), amount1 (int256), then 5
//   more slots (sqrtPriceX96, liquidity, tick, protocolFeesToken0/1).
//   We only need slots 0-1, so substring(data, 3..66) and substring(data, 67..130).
// - greatest(amount, 0) selects the INPUT side of the swap (one of amount0
//   or amount1 is positive per swap; the other is negative for the output).
//   Summing per-token across swaps gives input-side volume without double-
//   counting (each swap contributes to exactly one token's running sum).
// - PoolCreated data layout: tickSpacing (int24 in 32-byte slot), then pool
//   address right-aligned in 32-byte slot starting at byte 32. The pool
//   address occupies hex positions 91-130 of the data string (after 0x prefix).
const buildBscV3DataSql = (chainId: number, factory: string, fromTs: number, toTs: number): string => `
  WITH swap_agg AS (
    SELECT
      address AS pool,
      SUM(greatest(reinterpretAsInt256(reverse(unhex(substring(data, 3, 64)))), toInt256(0))) AS amount0_in,
      SUM(greatest(reinterpretAsInt256(reverse(unhex(substring(data, 67, 64)))), toInt256(0))) AS amount1_in
    FROM evm_indexer.logs
    PREWHERE chain = ${chainId}
      AND short_topic0 = '${V3_SWAP_SHORT_TOPIC0}'
      AND topic0 = '${V3_SWAP_TOPIC0}'
      AND timestamp >= toDateTime(${fromTs})
      AND timestamp <  toDateTime(${toTs})
    GROUP BY address
  )
  SELECT
    s.pool AS pool,
    toString(s.amount0_in) AS amount0_in,
    toString(s.amount1_in) AS amount1_in,
    p.token0_padded AS token0_padded,
    p.token1_padded AS token1_padded,
    p.fee_padded AS fee_padded
  FROM swap_agg s
  INNER JOIN (
    SELECT
      concat('0x', substring(data, 91, 40)) AS pool,
      topic1 AS token0_padded,
      topic2 AS token1_padded,
      topic3 AS fee_padded
    FROM evm_indexer.logs
    PREWHERE chain = ${chainId}
      AND short_address = '${shortAddrOf(factory)}'
      AND short_topic0 = '${POOL_CREATED_SHORT_TOPIC0}'
      AND address = '${factory}'
      AND topic0 = '${POOL_CREATED_TOPIC0}'
  ) p ON p.pool = s.pool
`;

type BscV3Row = Row & {
  pool: string;
  amount0_in: string;
  amount1_in: string;
  token0_padded: string;
  token1_padded: string;
  fee_padded: string;
};

const FEE_DIVISOR = 1_000_000n;
const RATIO_SCALE = 1_000_000n;
const ratioToScaled = (r: number) => BigInt(Math.round(r * Number(RATIO_SCALE)));

const fetchBsc = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const whitelist = new Set(
    (await getDefaultDexTokensWhitelisted({ chain: options.chain })).map(t => t.toLowerCase()),
  );
  const blacklist = new Set([
    '0x95e7c70b58790a1cbd377bc403cd7e9be7e0afb1', // YSL old token
  ]);

  const rows = await queryClickhouse<BscV3Row>(
    buildBscV3DataSql(
      Number(options.api.chainId),
      factories[options.chain].address.toLowerCase(),
      options.fromTimestamp,
      options.toTimestamp,
    ),
  );

  for (const row of rows) {
    const token0 = unpadTopic(row.token0_padded);
    const token1 = unpadTopic(row.token1_padded);
    const feeRaw = BigInt(parseInt(String(row.fee_padded).slice(2), 16));   // uint24
    const feeTier = Number(feeRaw) / 1e6;

    const amount0In = BigInt(row.amount0_in);
    const amount1In = BigInt(row.amount1_in);

    // Volume: ONLY count pools where both tokens are whitelisted (mirrors the
    // old Dune `clean_volume_usd` semantics).
    if (whitelist.has(token0) && whitelist.has(token1)) {
      dailyVolume.add(token0, amount0In);
      dailyVolume.add(token1, amount1In);
    }

    if (blacklist.has(token0) || blacklist.has(token1)) continue;

    // Fees / revenue: count ALL pools (mirrors the old `total_volume_usd * fee`
    // path). Per-pool fee_tier × revenue ratio derived from PancakeSwap's
    // per-tier protocol/holders split.
    const fee0 = (amount0In * feeRaw) / FEE_DIVISOR;
    const fee1 = (amount1In * feeRaw) / FEE_DIVISOR;
    dailyFees.add(token0, fee0);
    dailyFees.add(token1, fee1);

    const protocolR = getProtocolRevenueRatio(feeTier);
    const holdersR = getHolderRevenueRatio(feeTier);
    const revenueR = protocolR + holdersR;
    const supplyR = 1 - revenueR;

    const protocolScaled = ratioToScaled(protocolR);
    const holdersScaled = ratioToScaled(holdersR);
    const revenueScaled = ratioToScaled(revenueR);
    const supplyScaled = ratioToScaled(supplyR);

    dailyRevenue.add(token0, (fee0 * revenueScaled) / RATIO_SCALE);
    dailyRevenue.add(token1, (fee1 * revenueScaled) / RATIO_SCALE);
    dailyProtocolRevenue.add(token0, (fee0 * protocolScaled) / RATIO_SCALE);
    dailyProtocolRevenue.add(token1, (fee1 * protocolScaled) / RATIO_SCALE);
    dailyHoldersRevenue.add(token0, (fee0 * holdersScaled) / RATIO_SCALE);
    dailyHoldersRevenue.add(token1, (fee1 * holdersScaled) / RATIO_SCALE);
    dailySupplySideRevenue.add(token0, (fee0 * supplyScaled) / RATIO_SCALE);
    dailySupplySideRevenue.add(token1, (fee1 * supplyScaled) / RATIO_SCALE);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const buildEvmFetcher = (factory: string) => {
  const evmAdapter = getUniV3LogAdapter({
    factory,
    swapEvent: poolSwapEvent,
    userFeesRatio: 1,
    getRevenueRatio: ({ poolFeeTier }: UniGetRevenueRatioProps) => {
      const _protocolRevenueRatio = getProtocolRevenueRatio(poolFeeTier);
      const _holdersRevenueRatio = getHolderRevenueRatio(poolFeeTier);
      return {
        _revenueRatio: _protocolRevenueRatio + _holdersRevenueRatio,
        _protocolRevenueRatio,
        _holdersRevenueRatio,
      };
    },
  })
  return async (options: FetchOptions) => evmAdapter(options)
}

const pancakeSolanaExplorer = 'https://sol-explorer.pancakeswap.com/api/cached/v1/pools/info/list?poolType=concentrated&poolSortField=default&order=desc'
const blacklistPools = [
  'EbkGwrT4zf7Hczrn23zyoPJHThd2NHguJnyWiJe9wf9D',
];

const fetchSolanaV3 = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  let dailyRevenue = options.createBalances();
  let dailyProtocolRevenue = options.createBalances();
  let dailyHoldersRevenue = options.createBalances();
  let dailySupplySideRevenue = options.createBalances();

  let page = 1;
  let allPools: Array<any> = [];
  do {
    const response = await axios.get(`${pancakeSolanaExplorer}&pageSize=100&page=${page}`);
    const pools = response.data.data;
    if (pools.length == 0) {
      break;
    }
    allPools = allPools.concat(pools);

    page += 1;
  } while(true)
  
  // ONLY use Dune query for solana when refill history data
  let poolsAndVolumes: any = null;
  const todayTimestamp = Math.floor(new Date().getTime() / 1000);
  if (options.startOfDay < todayTimestamp - 48 * 3600) {
    poolsAndVolumes = await queryDune('3996608', {
      fullQuery: PANCAKESWAP_V3_QUERY_SOLANA(options.fromTimestamp, options.toTimestamp),
    }, options);
  }
  
  for (const pool of allPools.filter(pool => !blacklistPools.includes(pool.id))) {
    const feeRate = pool.feeRate ? Number(pool.feeRate) : 0

    let volume = 0
    let fee = 0
    if (options.startOfDay < todayTimestamp - 48 * 3600) {
      const item = poolsAndVolumes.find((i: any) => i.pool === pool.id)
      if (item) {
        volume = Number(item.volume_usd)
        fee = volume * feeRate
      }
    } else {
      volume = Number(pool.day.volume)
      fee = Number(pool.day.volumeFee)
    }

    dailyVolume.addUSDValue(volume);
    dailyFees.addUSDValue(fee);
    
    const protocolRevenueRatio = getProtocolRevenueRatio(feeRate);
    const holdersRevenueRatio = getHolderRevenueRatio(feeRate);
    const revenueRatio = protocolRevenueRatio + holdersRevenueRatio;
    const supplySideRevenueRatio = 1 - revenueRatio;

    dailyProtocolRevenue = dailyFees.clone(protocolRevenueRatio)
    dailyHoldersRevenue = dailyFees.clone(holdersRevenueRatio)
    dailySupplySideRevenue = dailyFees.clone(supplySideRevenueRatio)
    
    dailyRevenue = dailyProtocolRevenue.clone(1)
    dailyRevenue.add(dailyHoldersRevenue)
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

async function fetch(options: FetchOptions) {
  let v2Stats: any = {};
  
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  
  if (options.chain === CHAIN.BSC) {
    v2Stats = await fetchBsc(options);
  } else if (options.chain === CHAIN.SOLANA) {
    v2Stats = await fetchSolanaV3(options);
  } else {
    v2Stats = await buildEvmFetcher(factories[options.chain].address)(options);
  }

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

const methodology = {
  Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
  UserFees: "All trading fees paid by users",
  Revenue: "Pancakeswap collects amount of swap fees for Treasury and buy back CAKE.",
  SupplySideRevenue: "Fees distributed to LPs",
  ProtocolRevenue: "Swap fees collected by Pancakeswap - distribute to Treasury",
  HoldersRevenue: "Swap fees collected to buyback and burn CAKE: 15% fees in 0.01%, 0.05% tier pools, 23% fees in 0.25%, 1% tier pools",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools',
  },
  Revenue: {
    [METRIC.PROTOCOL_REVENUE]: 'Swap fees collected by Pancakeswap - distribute to Treasury',
    [METRIC.HOLDERS_REVENUE]: 'Swap fees collected to buyback and burn CAKE: 15% fees in 0.01%, 0.05% tier pools, 23% fees in 0.25%, 1% tier pools',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_REVENUE]: 'Swap fees collected by Pancakeswap - distribute to Treasury',
  },
  SupplySideRevenue: {
    [METRIC.LP_REVENUE]: 'Fees distributed to LPs',
  },
  HoldersRevenue: {
    [METRIC.BUY_BACK_AND_BURN]: 'Swap fees collected to buyback and burn CAKE: 15% fees in 0.01%, 0.05% tier pools, 23% fees in 0.25%, 1% tier pools',
  },
}

const adapter: SimpleAdapter = {
  version: 1,
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-07-11',
    },
  },
};

for (const [chain, config] of Object.entries(factories)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch,
    start: config.start,
  }
}

export default adapter;

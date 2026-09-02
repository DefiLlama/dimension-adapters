import { CHAIN } from "../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../adapters/types";
import { addOneToken } from "../helpers/prices";
import { queryDune } from "../helpers/dune";
import { httpPost } from "../utils/fetchURL";
import {
  getEstablishedTokens, getUniV3LogAdapter, washDayStart, WASH_DUST_USD, WASH_MIN_TRADES,
  WASH_MIN_USD, WASH_TRADES_PER_EOA, WASH_USD_MIN_TRADES_PER_EOA, WASH_USD_PER_EOA,
} from "../helpers/uniswap";

// Hybrid variant of old dexs/uniswap-v3.ts.
// Each chain is described once in chainConfig { blockchain, start, fetch }:
//  - fetchFromDune: pulls raw per-pool token amounts from Dune dex.trades and
//    prices them with DefiLlama (stores token breakdown; DefiLlama's <$10k-TVL
//    rule drops scam/unpriceable tokens, guarding against price manipulation).
//  - fetchFromOku: long-tail chains Dune lacks, via the Oku API.
// `blockchain` is the source's own chain slug (Dune name / Oku slug), so both
// fetchers just read config.blockchain. Buyback/holders-revenue is shared with
// the on-chain adapter.

// Protocol fee (UNIfication fee switch) is read per pool from slot0.feeProtocol:
// low 4 bits = denominator for token0-input swaps, high 4 bits for token1-input
// swaps (0 = off; 4 = 1/4 of the LP fee on 0.01%/0.05% tiers, 6 = 1/6 on
// 0.30%/1% tiers). Read at the window end block so refills reproduce the day.
const SLOT0_ABI = 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)'
const protocolShare = (denominator: number) => denominator ? 1 / denominator : 0

// raw per-pool, per-token traded amount from dex.trades, for one or more Dune
// blockchains. UNNEST explodes each swap's bought + sold legs into one row each,
// so SUM per token gives that token's total traded amount; addOneToken later
// counts one (priceable) side as volume. No token whitelist: DefiLlama pricing
// (+ <$10k-TVL rule) drops unpriceable tokens, and fetchWashPools drops pools
// whose flow is too concentrated to be organic.
function buildQuery(blockchains: string[], options: FetchOptions): string {
  const inList = blockchains.map((b) => `'${b}'`).join(',');
  return `
    SELECT blockchain, project_contract_address AS pool, t.token, CAST(SUM(t.amount) AS VARCHAR) AS amount
    FROM dex.trades
    CROSS JOIN UNNEST(
      ARRAY[token_bought_address, token_sold_address],
      ARRAY[token_bought_amount_raw, token_sold_amount_raw]
    ) AS t (token, amount)
    WHERE blockchain IN (${inList})
      AND project = 'uniswap'
      AND version = '3'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY blockchain, project_contract_address, t.token`;
}

// Same wash test the v4 adapter runs (see there). v3 is barely exposed - 0.4% of
// volume vs 19.1% - but it's one extra Dune query and stops the scam factories
// migrating here once v4 is filtered. Measured over the whole UTC day.
async function fetchWashPools(blockchains: string[], options: FetchOptions): Promise<Record<string, Set<string>>> {
  const inList = blockchains.map((b) => `'${b}'`).join(',');
  const dayStart = washDayStart(options);
  // v3 pools are their own contracts, so project_contract_address is the pool
  // and amount_usd is on the same rows - no join needed, unlike v4.
  const fullQuery = `
    SELECT blockchain, project_contract_address AS pool
    FROM dex.trades
    WHERE blockchain IN (${inList})
      AND project = 'uniswap'
      AND version = '3'
      AND block_time >= from_unixtime(${dayStart})
      AND block_time < from_unixtime(${dayStart + 86400})
    GROUP BY blockchain, project_contract_address
    HAVING ((
      COUNT(*) >= ${WASH_MIN_TRADES}
      AND COUNT(*) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_TRADES_PER_EOA}
    ) OR (
      COALESCE(SUM(amount_usd), 0) >= ${WASH_MIN_USD}
      AND COALESCE(SUM(amount_usd), 0) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_USD_PER_EOA}
      AND COUNT(*) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_USD_MIN_TRADES_PER_EOA}
    ))
    -- priced-but-dust pools are noise either way; NULL usd (unpriceable) stays flagged
    AND NOT (SUM(amount_usd) IS NOT NULL AND SUM(amount_usd) < ${WASH_DUST_USD})`;

  // extraUIDKey keeps DUNE_BULK_MODE from UNION ALLing this 2-column query with
  // the 4-column volume query of the same module - the shapes don't match
  const rows: any[] = await queryDune('3996608', { fullQuery }, options, { extraUIDKey: 'wash' });
  const washPools: Record<string, Set<string>> = {};
  for (const row of rows) {
    if (!row.blockchain || !row.pool) continue;
    (washPools[row.blockchain] ??= new Set()).add(String(row.pool).toLowerCase());
  }
  return washPools;
}

// queryDune fetches at most this many rows; a combined query at/over the cap is
// probably truncated, so we bail and let each chain query its own slice.
const DUNE_ROW_LIMIT = 32000;

// Pull every Dune chain in one query so a run makes a single Dune call instead
// of ~24. Result is grouped per chain and handed to each fetch via
// options.preFetchedResults. Returns null (→ per-chain fallback) if truncated.
const prefetch: any = async (options: FetchOptions) => {
  const blockchains = Object.values(chainConfig)
    .filter((c) => c.fetch === fetchFromDune)
    .map((c) => c.blockchain);
  const [rows, washPools] = await Promise.all([
    queryDune('3996608', { fullQuery: buildQuery(blockchains, options) }, options) as Promise<any[]>,
    fetchWashPools(blockchains, options),
  ]);
  if (rows.length >= DUNE_ROW_LIMIT) {
    console.error(`uniswap-v3: prefetch returned ${rows.length} rows (>= ${DUNE_ROW_LIMIT} cap), falling back to per-chain queries`);
    // null byChain sends each chain to its own query; the wash list still applies
    return { byChain: null, washPools };
  }
  const byChain: Record<string, any[]> = {};
  for (const r of rows) {
    if (!r.blockchain) continue;
    (byChain[r.blockchain] ??= []).push(r);
  }
  return { byChain, washPools };
}

async function fetchFromDune(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const { blockchain } = chainConfig[options.chain];
  // use the prefetched all-chains result when present, else query just this chain
  const byChain = options.preFetchedResults?.byChain;
  const rows: any[] = byChain
    ? (byChain[blockchain] ?? [])
    : await queryDune('3996608', { fullQuery: buildQuery([blockchain], options) }, options);

  // group by pool -> its (up to 2) tokens and their summed raw amounts
  const byPool: Record<string, { tokens: string[]; amounts: string[] }> = {};
  for (const r of rows) {
    if (!r.pool || !r.token || !r.amount) continue;
    const p = (byPool[r.pool] ??= { tokens: [], amounts: [] });
    p.tokens.push(r.token);
    p.amounts.push(r.amount);
  }

  // drop wash pools, except ones where both sides are established (core asset
  // or CoinGecko-listed) - see getEstablishedTokens. Done after grouping
  // because it needs both sides; one batched price lookup for all flagged pools.
  const washPools: Set<string> = options.preFetchedResults?.washPools?.[blockchain] ?? new Set();
  const flagged = Object.keys(byPool).filter((pool) => washPools.has(pool.toLowerCase()));
  if (flagged.length) {
    const established = await getEstablishedTokens(options.chain, flagged.flatMap((pool) => byPool[pool].tokens));
    for (const pool of flagged) {
      const { tokens } = byPool[pool];
      if (tokens.length >= 2 && tokens.every((t) => established.has(t.toLowerCase()))) continue;
      delete byPool[pool];
    }
  }

  const pools = Object.keys(byPool);

  // permitFailure doesn't cover a fully-dead-RPC chunk (sdk multiCall throws on it),
  // so guard: without fee tiers we keep volume and report 0 fees for this chain.
  let poolFees: any[] = await options.api.multiCall({ abi: 'uint256:fee', calls: pools, permitFailure: true });
  const slot0s: any[] = await options.api.multiCall({ abi: SLOT0_ABI, calls: pools, permitFailure: true });
  const dailyRevenue = options.createBalances();

  pools.forEach((pool, i) => {
    const { tokens, amounts } = byPool[pool];
    const token0 = tokens[0];
    const token1 = tokens[1] ?? tokens[0];
    const amount0 = amounts[0];
    const amount1 = amounts[1] ?? '0';
    // one priceable side = swap volume (mirrors the on-chain adapter)
    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 });
    const fee = poolFees[i] ? Number(poolFees[i]) / 1e6 : 0;
    if (!fee) return;
    addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: Number(amount0) * fee, amount1: Number(amount1) * fee });
    // token0 amounts carry the token0-input protocol denominator and vice versa
    const feeProtocol = Number(slot0s[i]?.feeProtocol ?? 0);
    const share0 = protocolShare(feeProtocol & 0xf);
    const share1 = protocolShare(feeProtocol >> 4);
    if (share0 || share1) addOneToken({ chain: options.chain, balances: dailyRevenue, token0, token1, amount0: Number(amount0) * fee * share0, amount1: Number(amount1) * fee * share1 });
  });

  const dailySupplySideRevenue = (await dailyFees.getUSDValue()) - (await dailyRevenue.getUSDValue());

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: dailyRevenue, // all protocol fees fund the UNI buyback and burn (UNIfication)
    dailySupplySideRevenue,
  }
}

interface IOkuResponse { volume: number; fees: number; }

async function fetchFromOku(options: FetchOptions) {
  const { blockchain } = chainConfig[options.chain];
  const url = `https://omni.icarus.tools/${blockchain}/cush/analyticsProtocolHistoric`;
  const body = { params: [options.startTimestamp * 1000, options.endTimestamp * 1000, 3600000] };
  let response: IOkuResponse[] | undefined;
  try {
    response = (await httpPost(url, body))?.result;
  } catch (e) {
    console.error(`uniswap-v3-dune: Oku request failed on ${options.chain}`, (e as any)?.message);
  }
  // Oku returns no `result` for some windows/chains; degrade to empty instead of crashing.
  if (!Array.isArray(response)) return {};

  const dailyVolume = response.reduce((acc, item) => acc + item.volume, 0);
  const dailyFees = response.reduce((acc, item) => acc + item.fees, 0);

  // no fee switch on the Oku-served chains, all fees stay with LPs
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

const factoryConfig: Record<string, string> ={
  [CHAIN.OG]: "0xcb2436774C3e191c85056d248EF4260ce5f27A9D",
}

async function fetchFromLogs(options: FetchOptions) {
  const factory = factoryConfig[options.chain];
  if (!factory) {
    throw new Error(`uniswap-v3: factory not found for chain ${options.chain}`);
  }

  const { dailyVolume, dailyFees, dailyUserFees } = await getUniV3LogAdapter({
    factory,
    userFeesRatio: 1,
    revenueRatio: 0,
    protocolRevenueRatio: 0,
  })(options);

  // no fee switch on 0G, all fees stay with LPs
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  };
}

// One entry per chain. blockchain = the source's own slug (Dune dex.trades name
// or Oku slug). start = first uni-v3 data on that source:
//  - Dune rows: MIN(block_time) in dex.trades
//  - Oku rows:  first month with volume in analyticsProtocolHistoric
const chainConfig: Record<string, { blockchain: string; start: string; fetch: FetchV2 }> = {
  // Dune dex.trades
  [CHAIN.ETHEREUM]: { blockchain: 'ethereum', start: '2021-05-04', fetch: fetchFromDune },
  [CHAIN.ARBITRUM]: { blockchain: 'arbitrum', start: '2021-06-01', fetch: fetchFromDune },
  [CHAIN.OPTIMISM]: { blockchain: 'optimism', start: '2021-11-11', fetch: fetchFromDune },
  [CHAIN.POLYGON]: { blockchain: 'polygon', start: '2021-12-20', fetch: fetchFromDune },
  [CHAIN.CELO]: { blockchain: 'celo', start: '2023-01-20', fetch: fetchFromDune },
  [CHAIN.BSC]: { blockchain: 'bnb', start: '2023-02-16', fetch: fetchFromDune },
  [CHAIN.AVAX]: { blockchain: 'avalanche_c', start: '2023-06-21', fetch: fetchFromDune },
  [CHAIN.BASE]: { blockchain: 'base', start: '2023-07-31', fetch: fetchFromDune },
  [CHAIN.ERA]: { blockchain: 'zksync', start: '2023-08-31', fetch: fetchFromDune },
  [CHAIN.SCROLL]: { blockchain: 'scroll', start: '2023-10-14', fetch: fetchFromDune },
  [CHAIN.LINEA]: { blockchain: 'linea', start: '2023-11-11', fetch: fetchFromDune },
  [CHAIN.XDAI]: { blockchain: 'gnosis', start: '2023-11-28', fetch: fetchFromDune },
  [CHAIN.BLAST]: { blockchain: 'blast', start: '2024-03-05', fetch: fetchFromDune },
  [CHAIN.ZORA]: { blockchain: 'zora', start: '2024-03-26', fetch: fetchFromDune },
  [CHAIN.MANTLE]: { blockchain: 'mantle', start: '2024-05-16', fetch: fetchFromDune },
  [CHAIN.WC]: { blockchain: 'worldchain', start: '2024-08-28', fetch: fetchFromDune },
  [CHAIN.INK]: { blockchain: 'ink', start: '2024-12-20', fetch: fetchFromDune },
  [CHAIN.SONIC]: { blockchain: 'sonic', start: '2024-12-27', fetch: fetchFromDune },
  [CHAIN.UNICHAIN]: { blockchain: 'unichain', start: '2025-01-24', fetch: fetchFromDune },
  [CHAIN.PLASMA]: { blockchain: 'plasma', start: '2025-09-12', fetch: fetchFromDune },
  [CHAIN.MONAD]: { blockchain: 'monad', start: '2025-11-07', fetch: fetchFromDune },
  [CHAIN.XLAYER]: { blockchain: 'xlayer', start: '2026-01-05', fetch: fetchFromDune },
  [CHAIN.TEMPO]: { blockchain: 'tempo', start: '2026-03-23', fetch: fetchFromDune },
  [CHAIN.ROBINHOOD]: { blockchain: 'robinhood', start: '2026-05-22', fetch: fetchFromDune },

  // Oku API (chains Dune has no uni-v3 data for)
  [CHAIN.BOBA]: { blockchain: 'boba', start: '2023-07-22', fetch: fetchFromOku },
  [CHAIN.ROOTSTOCK]: { blockchain: 'rootstock', start: '2023-11-19', fetch: fetchFromOku },
  [CHAIN.FILECOIN]: { blockchain: 'filecoin', start: '2024-02-17', fetch: fetchFromOku },
  [CHAIN.SEI]: { blockchain: 'sei', start: '2024-05-17', fetch: fetchFromOku },
  [CHAIN.BOB]: { blockchain: 'bob', start: '2024-08-15', fetch: fetchFromOku },
  [CHAIN.GOAT]: { blockchain: 'goat', start: '2025-02-11', fetch: fetchFromOku },
  [CHAIN.HEMI]: { blockchain: 'hemi', start: '2025-02-11', fetch: fetchFromOku },
  [CHAIN.SAGA]: { blockchain: 'saga', start: '2025-02-11', fetch: fetchFromOku },
  [CHAIN.XDC]: { blockchain: 'xdc', start: '2025-04-12', fetch: fetchFromOku },
  [CHAIN.NIBIRU]: { blockchain: 'nibiru', start: '2025-05-12', fetch: fetchFromOku },
  [CHAIN.ETHERLINK]: { blockchain: 'etherlink', start: '2025-05-12', fetch: fetchFromOku },

  // On-chain logs (no Dune dex.trades or Oku API coverage)
  [CHAIN.OG]: { blockchain: '0g', start: '2025-09-24', fetch: fetchFromLogs },
}

const methodology = {
  Volume: "Swap volume, excluding wash trading: pools whose daily trades come from too few distinct addresses to be organic, unless every pool token is a core asset or CoinGecko-listed.",
  Fees: "Swap fees paid by traders, per pool fee tier.",
  UserFees: "Swap fees paid by traders.",
  Revenue: 'Per-pool protocol share of swap fees read from the pool (1/4 of fees on 0.01% and 0.05% tiers, 1/6 on 0.30% and 1% tiers where the fee switch is on: Ethereum since 28 Dec 2025, Optimism, Arbitrum, Base, World Chain, Zora, X Layer since 8 Mar 2026, Polygon, BSC, Celo since 2 Jun 2026, Robinhood since 27 Jul 2026), all of it used to buy back and burn UNI.',
  ProtocolRevenue: 'Protocol treasury keeps nothing, protocol fees go to the UNI buyback and burn.',
  SupplySideRevenue: 'Swap fees left to LPs after the protocol share.',
  HoldersRevenue: 'Protocol share of swap fees used to buy back and burn UNI.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: chainConfig,
  prefetch,
}

export default adapter;

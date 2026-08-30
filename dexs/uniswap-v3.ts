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

const HOLDERS_REVENUE_CONFIG: Record<string, { feeSwitchDate: string | null; firepit: string | null }> = {
  [CHAIN.ETHEREUM]: { feeSwitchDate: "2025-12-29", firepit: '0x0D5Cd355e2aBEB8fb1552F56c965B867346d6721' },
  [CHAIN.OPTIMISM]: { feeSwitchDate: "2026-03-08", firepit: '0x94460443Ca27FFC1baeCa61165fde18346C91AbD' },
  [CHAIN.ARBITRUM]: { feeSwitchDate: "2026-03-08", firepit: '0xB8018422bcE25D82E70cB98FdA96a4f502D89427' },
  [CHAIN.BASE]: { feeSwitchDate: "2026-03-08", firepit: '0xFf77c0ED0B6b13A20446969107E5867abc46f53a' },
  [CHAIN.CELO]: { feeSwitchDate: "2026-06-02", firepit: '0x2758FbaA228D7d3c41dD139F47dab1a27bF9bc25' },
  [CHAIN.WC]: { feeSwitchDate: "2026-03-08", firepit: '0x455e844D286631566cF98D6cb2996149734618C6' },
  [CHAIN.ZORA]: { feeSwitchDate: "2026-03-08", firepit: '0x2f98eD4D04e633169FbC941BFCc54E785853b143' },
  [CHAIN.XLAYER]: { feeSwitchDate: "2026-03-08", firepit: '0xe122E231cb52aea99690963Fd73E91e33E97468f' },
  [CHAIN.BSC]: { feeSwitchDate: "2026-06-02", firepit: '0xa59FfbB55D91Fc32b44A06F0b9cc6036a4afbcE2' },
  [CHAIN.POLYGON]: { feeSwitchDate: "2026-06-02", firepit: '0xa59FfbB55D91Fc32b44A06F0b9cc6036a4afbcE2' },
  [CHAIN.ROBINHOOD]: { feeSwitchDate: "2026-07-27", firepit: '0x7A8F74C2585F84C781F951B7F2FF21337D5B630B' },
  [CHAIN.UNICHAIN]: { feeSwitchDate: "2026-01-09", firepit: '0xe0A780E9105aC10Ee304448224Eb4A2b11A77eeB' },
}

const THRESHOLD_FUNCTION_ABI = 'uint256:threshold'
const RELEASED_EVENT_ABI = 'event Released (uint256 indexed nonce, address indexed recipient, address[] assets)'

async function fetchHoldersRevenue(options: FetchOptions) {
  const dailyHoldersRevenue = options.createBalances()
  const { feeSwitchDate, firepit } = HOLDERS_REVENUE_CONFIG[options.chain] ?? {}
  if (!firepit || !feeSwitchDate || options.dateString < feeSwitchDate) {
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

  pools.forEach((pool, i) => {
    const { tokens, amounts } = byPool[pool];
    const token0 = tokens[0];
    const token1 = tokens[1] ?? tokens[0];
    const amount0 = amounts[0];
    const amount1 = amounts[1] ?? '0';
    // one priceable side = swap volume (mirrors the on-chain adapter)
    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 });
    const fee = poolFees[i] ? Number(poolFees[i]) / 1e6 : 0;
    if (fee) addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: Number(amount0) * fee, amount1: Number(amount1) * fee });
  });

  const dailyHoldersRevenue = await fetchHoldersRevenue(options);
  const dailyRevenue = await dailyHoldersRevenue.getUSDValue();
  const dailySupplySideRevenue = (await dailyFees.getUSDValue()) - dailyRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
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

  const dailyHoldersRevenue = await fetchHoldersRevenue(options);
  const feesToLps = (await dailyFees.getUSDValue()) - (await dailyHoldersRevenue.getUSDValue());
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue(feesToLps, "LP fees");

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
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
  Fees: "Swap fees from paid by users.",
  UserFees: "User pays fees on each swap.",
  Revenue: 'From 28 Dec 2025, a portion of fees a collected to buy back and burn UNI on Ethereum, From 8 Mar 2026, on Optimism, Arbitrum, Base, WC, Zora, XLayer, From 2 Jun 2026, on Polygon, BSC, Celo, From 27 Jul 2026, on Robinhood',
  ProtocolRevenue: 'Protocol make no revenue.',
  SupplySideRevenue: 'Fees distributed to LPs post protocol fee collection',
  HoldersRevenue: 'From 28 Dec 2025, a portion of fees a collected to buy back and burn UNI on Ethereum, From 8 Mar 2026, on Optimism, Arbitrum, Base, WC, Zora, XLayer, From 2 Jun 2026, on Polygon, BSC, Celo, From 27 Jul 2026, on Robinhood',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: chainConfig,
  prefetch,
  // supply side can be negative on days revenue (v2+v3 buyback) exceeds v3 fees
  allowNegativeValue: true,
}

export default adapter;

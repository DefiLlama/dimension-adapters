// Changes to this helper's revenue logic require further approval before merging:
// Trueo markets depend on the Uniswap and Aero revenue it feeds (uniswap-v2/v3/v4, aerodrome, aerodrome-slipstream, velodrome, velodrome-v2).

import ADDRESSES from './coreAssets.json'

import { Balances, ChainApi, cache, coins } from "@defillama/sdk";
import { BaseAdapter, FetchOptions, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { addOneToken, isCoreAsset } from "./prices";
import { queryDune, queryDuneResult } from "./dune";
import { CHAIN } from "./chains";
import { DUNE_DEX_BLACKLIST_TABLE } from "./lists";
import { ethers } from "ethers";
import { toPositionedLogArgs } from "./logs";

const ZERO_ADDRESS = ADDRESSES.null;

// Wash-trade detection shared by the uniswap v3/v4 adapters: a pool is flagged
// when a day's flow comes from too few distinct addresses to be organic.
// Always measured over the whole UTC day - both adapters run hourly, and over a
// one-hour window a wash pool's fixed address set makes the ratios collapse.

// Test A: trades per EOA. Catches bot pools of any size, including unpriced ones.
export const WASH_MIN_TRADES = 500;
export const WASH_TRADES_PER_EOA = 100;

// Test B (ORed with A): USD per EOA. Fake-ticker pools move $725k-$3.9M per
// address vs ~$95k for the busiest organic pool measured; A misses most of them
// because they use fewer, larger trades. The trades/EOA floor is what keeps
// Ethereum PYUSD/USDS ($1.5M per address, 3 trades each) out of it.
export const WASH_MIN_USD = 1_000_000;
export const WASH_USD_PER_EOA = 500_000;
export const WASH_USD_MIN_TRADES_PER_EOA = 30;

// Priced-but-dust pools are never flagged: bot churn on Zora creator coins and
// the like trips test A while moving negligible USD, so dropping them buys no
// accuracy and mislabels legit long-tail activity. Pools dex.trades cannot
// price at all (SUM(amount_usd) IS NULL) stay flagged - catching those is what
// test A is for.
export const WASH_DUST_USD = 25_000;

// UTC day containing the inclusive end snapshot.
export function washDayStart(options: FetchOptions): number {
  return Math.floor((options.endTimestamp - 1) / 86400) * 86400;
}

// The day's wash-flagged pool set for one project+chain, for adapters whose
// pools are their own contracts in dex.trades (uniswap-v3 style). The caller's
// prefetch stores it and fetch drops those pools unless getEstablishedTokens
// clears every side. A Dune failure throws - reporting unfiltered would
// republish the wash volume as real.
export async function getWashPools(options: FetchOptions, { blockchain, project, version }: { blockchain: string; project: string; version?: string }): Promise<Set<string>> {
  const dayStart = washDayStart(options);
  const fullQuery = `
    SELECT CAST(project_contract_address AS VARCHAR) AS pool
    FROM dex.trades
    WHERE blockchain = '${blockchain}'
      AND project = '${project}'
      ${version ? `AND version = '${version}'` : ''}
      AND block_time >= from_unixtime(${dayStart})
      AND block_time < from_unixtime(${dayStart + 86400})
    GROUP BY project_contract_address
    HAVING ((
      COUNT(*) >= ${WASH_MIN_TRADES}
      AND COUNT(*) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_TRADES_PER_EOA}
    ) OR (
      COALESCE(SUM(amount_usd), 0) >= ${WASH_MIN_USD}
      AND COALESCE(SUM(amount_usd), 0) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_USD_PER_EOA}
      AND COUNT(*) / CAST(COUNT(DISTINCT tx_from) AS DOUBLE) >= ${WASH_USD_MIN_TRADES_PER_EOA}
    ))
    AND NOT (SUM(amount_usd) IS NOT NULL AND SUM(amount_usd) < ${WASH_DUST_USD})`;

  const rows: any[] = await queryDune('3996608', { fullQuery }, options, { extraUIDKey: 'wash' });
  return new Set(rows.map((r) => String(r.pool ?? '').toLowerCase()).filter(Boolean));
}

// Never flag a pool whose every side is established, meaning either
//  - a core asset: concentrated flow on a major/stable pair is just arb bots
//    (xlayer stablecoin pools peak at 90 trades/EOA, optimism native/USDC at
//    51), or
//  - a CoinGecko-listed token per our own price feed: a real project (SOSO,
//    DUAL, SBC...) whose MM/relayer churn is concentrated but not fake, and a
//    day-one rug cannot get a CG listing. Listed tokens price at confidence
//    0.99; the fake-ticker tokens return no price at all. Current listing also
//    exonerates past days on refills - a token listed today was real then too.
// Dune has no equivalent signal: prices.day covers anything that trades
// (source='dex.trades', fakes included) and its coinpaprika subset is ~200
// tokens per chain. A price-API failure throws rather than guessing either way.
export async function getEstablishedTokens(chain: string, tokens: string[]): Promise<Set<string>> {
  const established = new Set<string>();
  const unknown = new Set<string>();
  for (const token of tokens.map(t => t.toLowerCase())) {
    if (token === ZERO_ADDRESS || isCoreAsset(chain, token)) established.add(token);
    else unknown.add(token);
  }
  const priceData = await coins.getPrices([...unknown].map(t => `${chain}:${t}`), 'now');
  for (const [key, info] of Object.entries(priceData) as [string, any][]) {
    if ((info?.confidence ?? 0) >= 0.9) established.add(key.split(':')[1].toLowerCase());
  }
  return established;
}

// UNI burn (fee switch), split across v2 / v3 / v4.
//
// How swap fees end up as burned UNI (contracts: github.com/Uniswap/protocol-fees,
// flow checked on-chain on Robinhood, 16-22 Nov 2026):
//  1. Accrual, where the fee is earned.
//     v2: 1/6 of the 0.3% fee. It stays in the pair and is minted to the chain's
//         TokenJar as LP tokens the next time liquidity is added or removed.
//     v3: a fraction of the swap fee set per fee tier (1/4 on 0.01% and 0.05%,
//         1/6 on 0.3% and 1%), held inside each pool.
//     v4: a per-pool rate set by a policy contract, held inside the PoolManager.
//  2. Burn. Anyone can pay `threshold` UNI to the chain's Firepit and take up to
//     20 assets, the full balance of each, out of the TokenJar. Burners do it all
//     in one tx: collect v3 and v4 fees into the jar (collect is permissionless on
//     both fee adapters), take the assets, and redeem any v2 LP they took. About
//     100% of v3/v4 fee value reaches the jar inside a release tx on every chain
//     (64% for v3 on Ethereum).
//  3. The UNI goes to the burn address, through the bridge on L2s.
//
// The burn carries no version and its size is fixed, so each version's share is
// what the burner took from it on the burn's day (see uniBurnInflowsSql).
// tokenJar is firepit.TOKEN_JAR(), poolManager is the chain's v4 PoolManager (dexs/uniswap-v4.ts).
// noV2Listing: uniswap-v2 does not report the chain, so its share stays on v3.
export const UNI_BURN_CONFIG: Record<string, { feeSwitchDate: string; firepit: string; tokenJar: string; poolManager: string; duneChain: string; noV2Listing?: boolean }> = {
  [CHAIN.ETHEREUM]: { feeSwitchDate: "2025-12-29", firepit: '0x0D5Cd355e2aBEB8fb1552F56c965B867346d6721', tokenJar: '0xf38521f130fcCF29dB1961597bc5d2B60F995f85', poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90', duneChain: 'ethereum' },
  [CHAIN.OPTIMISM]: { feeSwitchDate: "2026-03-08", firepit: '0x94460443Ca27FFC1baeCa61165fde18346C91AbD', tokenJar: '0xb13285DF724ea75f3f1E9912010B7e491dCd5EE3', poolManager: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3', duneChain: 'optimism' },
  [CHAIN.ARBITRUM]: { feeSwitchDate: "2026-03-08", firepit: '0xB8018422bcE25D82E70cB98FdA96a4f502D89427', tokenJar: '0x95E337C5B155385945D407f5396387D0c2a3A263', poolManager: '0x360e68faccca8ca495c1b759fd9eee466db9fb32', duneChain: 'arbitrum' },
  [CHAIN.BASE]: { feeSwitchDate: "2026-03-08", firepit: '0xFf77c0ED0B6b13A20446969107E5867abc46f53a', tokenJar: '0x9bD25e67bF390437C8fAF480AC735a27BcF6168c', poolManager: '0x498581ff718922c3f8e6a244956af099b2652b2b', duneChain: 'base' },
  [CHAIN.CELO]: { feeSwitchDate: "2026-06-02", firepit: '0x2758FbaA228D7d3c41dD139F47dab1a27bF9bc25', tokenJar: '0x190c22c5085640D1cB60CeC88a4F736Acb59bb6B', poolManager: '0x288dc841a52fca2707c6947b3a777c5e56cd87bc', duneChain: 'celo', noV2Listing: true },
  [CHAIN.WC]: { feeSwitchDate: "2026-03-08", firepit: '0x455e844D286631566cF98D6cb2996149734618C6', tokenJar: '0xbDb82c2dE7D8748A3e499e771604ef8ef8544918', poolManager: '0xb1860d529182ac3bc1f51fa2abd56662b7d13f33', duneChain: 'worldchain', noV2Listing: true },
  [CHAIN.ZORA]: { feeSwitchDate: "2026-03-08", firepit: '0x2f98eD4D04e633169FbC941BFCc54E785853b143', tokenJar: '0x4753C137002D802f45302b118E265c41140e73C2', poolManager: '0x0575338e4c17006ae181b47900a84404247ca30f', duneChain: 'zora' },
  [CHAIN.XLAYER]: { feeSwitchDate: "2026-03-08", firepit: '0xe122E231cb52aea99690963Fd73E91e33E97468f', tokenJar: '0x8Dd8B6D56e4a4A158EDbBfE7f2f703B8FFC1a754', poolManager: '0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32', duneChain: 'xlayer' },
  [CHAIN.BSC]: { feeSwitchDate: "2026-06-02", firepit: '0xa59FfbB55D91Fc32b44A06F0b9cc6036a4afbcE2', tokenJar: '0xc6Ae6373CEcc9e595A6C8b9fe581925a8c84f70A', poolManager: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df', duneChain: 'bnb' },
  [CHAIN.POLYGON]: { feeSwitchDate: "2026-06-02", firepit: '0xa59FfbB55D91Fc32b44A06F0b9cc6036a4afbcE2', tokenJar: '0xc6Ae6373CEcc9e595A6C8b9fe581925a8c84f70A', poolManager: '0x67366782805870060151383f4bbff9dab53e5cd6', duneChain: 'polygon' },
  [CHAIN.ROBINHOOD]: { feeSwitchDate: "2026-07-27", firepit: '0x7A8F74C2585F84C781F951B7F2FF21337D5B630B', tokenJar: '0x2aC03e14Cfe755426DaAEe0a4994184Ce81482F8', poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', duneChain: 'robinhood' },
  // The jar here is fed by Unichain sequencer fees (FeeSplitter predeploy 0x4300c0d3...0004), not by
  // pool protocol fees, so the whole burn stays on v3 as it was before the split.
  [CHAIN.UNICHAIN]: { feeSwitchDate: "2026-01-09", firepit: '0xe0A780E9105aC10Ee304448224Eb4A2b11A77eeB', tokenJar: '0xD576BDF6b560079a4c204f7644e556DbB19140b5', poolManager: '0x1f98400000000000000000000000000000000004', duneChain: 'unichain' },
  // Releaser from github.com/Uniswap/protocol-fees .records/Arc.json; fee switch relayed 2026-10-05 (tx 0x2d42e5e9...5c49), first Released 2026-10-18
  [CHAIN.ARC]: { feeSwitchDate: "2026-10-05", firepit: '0xe1Adf3f130Abf616a7aB04AEeBf8D0470F6B6a16', tokenJar: '0xfd39ac616e630e9db03EFB2c9a4Fe63eDB949233', poolManager: '0x8366a39cc670b4001a1121b8f6a443a643e40951', duneChain: 'arc' },
}

export type UniVersion = 'v2' | 'v3' | 'v4';
const UNI_BURN_LABEL = 'Fees Used To Burn UNI';
// Saved Dune query holding uniBurnInflowsSql for every day since the first fee
// switch (toDay = current_date). Refills read its stored result, which runs
// nothing on Dune; rerun the saved query to extend it before a refill.
const UNI_BURN_HISTORY_QUERY_ID = '9181964';

// USD the burners took from each version, one row per day and chain, for the days
// in [fromDay, toDay) (SQL date expressions).
//  v4: transfers into the TokenJar sent by the PoolManager.
//  v3: every other transfer into the jar, since v3 pools pay it themselves.
//  v2: what a pair paid out when the burner redeemed LP it took from the jar,
//      which burners do in the release tx itself. A redeemed pair is a token
//      that leaves the jar, is burned in the same tx, and whose own contract
//      pays out exactly two other tokens. If only one side has a price the pair
//      counts as twice that side.
// Known limit: a burner that also swaps through a pair it is redeeming adds the
// swap output to that pair's v2 figure.
export function uniBurnInflowsSql(fromDay: string, toDay: string): string {
  const configs = Object.values(UNI_BURN_CONFIG);
  const chains = configs.map((c) => `'${c.duneChain}'`).join(', ');
  const scanned = (alias: string) => `${alias}.blockchain IN (${chains}) AND ${alias}.block_date >= ${fromDay} AND ${alias}.block_date < ${toDay}`;
  const notBlacklisted = (alias: string, b: string) => `LEFT JOIN ${DUNE_DEX_BLACKLIST_TABLE} ${b} ON ${b}.address = ${alias}.contract_address AND ${b}.chain IN ('any', ${alias}.blockchain)`;
  return `
    WITH cfg (blockchain, jar, pool_manager) AS (
      VALUES ${configs.map((c) => `('${c.duneChain}', ${c.tokenJar.toLowerCase()}, ${c.poolManager.toLowerCase()})`).join(', ')}
    ), paid_in AS (
      SELECT t.blockchain, t.block_date AS day,
        SUM(CASE WHEN t."from" = c.pool_manager THEN t.amount_usd END) AS v4,
        SUM(CASE WHEN t."from" NOT IN (c.pool_manager, ${ZERO_ADDRESS}) THEN t.amount_usd END) AS v3
      FROM tokens.transfers t
      JOIN cfg c ON c.blockchain = t.blockchain AND c.jar = t."to"
      ${notBlacklisted('t', 'b')}
      WHERE ${scanned('t')} AND b.address IS NULL
      GROUP BY 1, 2
    ), released AS (
      SELECT o.blockchain, o.block_date, o.tx_hash, o.contract_address AS token
      FROM tokens.transfers o
      JOIN cfg c ON c.blockchain = o.blockchain AND c.jar = o."from"
      WHERE ${scanned('o')}
    ), redeemed AS (
      SELECT r.blockchain, r.block_date AS day, r.tx_hash, r.token,
        CASE WHEN p.contract_address <> r.token THEN p.contract_address END AS underlying,
        MAX(CASE WHEN p.contract_address = r.token AND p."to" = ${ZERO_ADDRESS} THEN 1 ELSE 0 END) AS lp_burned,
        SUM(CASE WHEN p.contract_address <> r.token THEN p.amount_usd END) AS usd
      FROM released r
      JOIN tokens.transfers p ON p.blockchain = r.blockchain AND p.block_date = r.block_date AND p.tx_hash = r.tx_hash
        AND (p."from" = r.token OR p.contract_address = r.token)
      ${notBlacklisted('p', 'b')}
      WHERE ${scanned('p')} AND p.contract_address <> ${ZERO_ADDRESS} AND b.address IS NULL
      GROUP BY 1, 2, 3, 4, 5
    ), v2 AS (
      SELECT blockchain, day, SUM(pair_usd) AS v2
      FROM (
        SELECT blockchain, day, CASE WHEN COUNT(usd) >= 2 THEN SUM(usd) ELSE 2 * MAX(usd) END AS pair_usd
        FROM redeemed GROUP BY blockchain, day, tx_hash, token
        HAVING MAX(lp_burned) = 1 AND COUNT(underlying) = 2
      )
      GROUP BY 1, 2
    )
    SELECT CAST(COALESCE(i.day, v.day) AS VARCHAR) AS day, COALESCE(i.blockchain, v.blockchain) AS blockchain,
      COALESCE(v.v2, 0) AS v2, COALESCE(i.v3, 0) AS v3, COALESCE(i.v4, 0) AS v4
    FROM paid_in i
    FULL OUTER JOIN v2 v ON v.blockchain = i.blockchain AND v.day = i.day`;
}

// One lookup per UTC day per process, shared by every chain and hourly window of
// that day. A day that ended over two days ago is read from the saved result;
// recent days, and days the saved result does not reach yet, run the SQL for
// that one day only.
const uniBurnInflowsByDay: Record<string, Promise<Record<string, Record<string, number>>>> = {};
function fetchUniBurnInflows(options: FetchOptions): Promise<Record<string, Record<string, number>>> {
  const dayStart = washDayStart(options);
  const day = new Date(dayStart * 1000).toISOString().slice(0, 10);
  return uniBurnInflowsByDay[day] ??= (async () => {
    let rows: any[] = [];
    if (dayStart + 3 * 86400 < Date.now() / 1000) rows = await queryDuneResult(options, UNI_BURN_HISTORY_QUERY_ID, `day = '${day}'`);
    // extraUIDKey keeps DUNE_BULK_MODE from UNION ALLing this with the module's other queries
    if (!rows.length) rows = await queryDune('3996608', { fullQuery: uniBurnInflowsSql(`DATE '${day}'`, `DATE '${day}' + INTERVAL '1' DAY`) }, options, { extraUIDKey: 'uni-burn' });
    const inflows: Record<string, Record<string, number>> = {};
    for (const row of rows) inflows[row.blockchain] = { v2: Number(row.v2 ?? 0), v3: Number(row.v3 ?? 0), v4: Number(row.v4 ?? 0) };
    return inflows;
  })().catch((e) => { delete uniBurnInflowsByDay[day]; throw e; });
}

// This version's share of the UNI burned in the window (Released events x threshold).
// The burn itself is read on-chain and the three versions' shares of the day add
// up to 1, so v2 + v3 + v4 always equals the chain's burn.
export async function getUniBurn(options: FetchOptions, version: UniVersion): Promise<Balances> {
  const dailyHoldersRevenue = options.createBalances();
  const config = UNI_BURN_CONFIG[options.chain];
  if (!config || options.dateString < config.feeSwitchDate) return dailyHoldersRevenue;

  const [releaseLogs, threshold] = await Promise.all([
    options.getLogs({ target: config.firepit, eventAbi: 'event Released (uint256 indexed nonce, address indexed recipient, address[] assets)' }),
    options.api.call({ target: config.firepit, abi: 'uint256:threshold' }),
  ]);
  if (!releaseLogs.length || !threshold) return dailyHoldersRevenue;

  // only a window with a burn needs the split, so Dune is not touched otherwise
  const { v2 = 0, v3 = 0, v4 = 0 } = (await fetchUniBurnInflows(options))[config.duneChain] ?? {};
  const usd: Record<UniVersion, number> = config.noV2Listing ? { v2: 0, v3: v3 + v2, v4 } : { v2, v3, v4 };
  const total = usd.v2 + usd.v3 + usd.v4;
  // nothing priced was taken that day: the whole burn stays on v3, as it was before the split
  const share = total > 0 ? usd[version] / total : Number(version === 'v3');
  dailyHoldersRevenue.addCGToken("uniswap", releaseLogs.length * Number(threshold) / 1e18 * share, UNI_BURN_LABEL);
  return dailyHoldersRevenue;
}

// Revenue fields shared by the three adapters: the version's burn share is holders
// revenue and the rest of its swap fees stays with LPs.
export async function getUniBurnRevenue(options: FetchOptions, version: UniVersion, dailyFees: Balances) {
  const dailyHoldersRevenue = await getUniBurn(options, version);
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addUSDValue((await dailyFees.getUSDValue()) - (await dailyHoldersRevenue.getUSDValue()), 'Swap Fees To Liquidity Providers');
  return { dailyRevenue: dailyHoldersRevenue, dailyProtocolRevenue: 0, dailyHoldersRevenue, dailySupplySideRevenue };
}

// Uniswap v4 flash accounting lets one transaction add liquidity, swap through it
// and remove it again with the deltas cancelling, so the PoolManager emits Swap
// logs for tokens nobody holds: a 1-tick position in a freshly minted token
// paired with ETH/USDC, "swapped" for $100M+ with zero value sent and no real
// token moving (optimism 0xc4a48a865abad9390c0718e1b9374f327ba47a17b4cb356346ab2c0066b4d7d4:
// 178k ETH of Swap logs, tx value 0, only the fake token transferred). The cheaper
// variant keeps a pre-funded fake-token position in a fee-0 pool and round-trips
// through it inside one tx. Both leave the same fingerprint inside one tx and one
// pool: the swaps net to ~0 on both tokens, or liquidity was both added and
// removed. Such groups are dropped. Cost: ~0.1% of organic volume (a same-tx
// round trip through one pool has no legitimate use; JIT hooks that add and
// remove around a user's swap are negligible). Keyed by tx hash + pool id.
export function getPhantomSwapKeys(swaps: any[], liquidityMods: any[]): Set<string> {
  const abs = (x: bigint) => x < 0n ? -x : x
  const groups: Record<string, { n: number; net0: bigint; gross0: bigint; net1: bigint; gross1: bigint }> = {}
  for (const log of swaps) {
    const g = groups[phantomSwapKey(log)] ??= { n: 0, net0: 0n, gross0: 0n, net1: 0n, gross1: 0n }
    const a0 = BigInt(String(log.args.amount0)), a1 = BigInt(String(log.args.amount1))
    g.n++; g.net0 += a0; g.gross0 += abs(a0); g.net1 += a1; g.gross1 += abs(a1)
  }
  const liquidity: Record<string, { add?: boolean; remove?: boolean }> = {}
  for (const log of liquidityMods) {
    const l = liquidity[phantomSwapKey(log)] ??= {}
    if (BigInt(String(log.args.liquidityDelta)) > 0n) l.add = true; else l.remove = true
  }
  const phantom = new Set<string>()
  for (const [key, g] of Object.entries(groups)) {
    // |net| <= 1% of gross on both tokens: the fee is all that fails to cancel
    const roundTrip = g.n >= 2 && abs(g.net0) * 100n <= g.gross0 && abs(g.net1) * 100n <= g.gross1
    if (roundTrip || (liquidity[key]?.add && liquidity[key]?.remove)) phantom.add(key)
  }
  return phantom
}

export function phantomSwapKey(log: any): string {
  return `${log.transactionHash}:${log.args.id}`.toLowerCase()
}

// Fail fast above 10% failed balance calls to tolerate isolated RPC errors without
// reporting a mostly-failed batch of pools as legitimately empty. See PR #8565 for the
// original all-or-nothing precedent this threshold replaces.
const MAX_FAILED_BALANCE_CALL_RATIO = 0.1
const MAX_BALANCE_CALL_RETRIES = 2

// Of the given core-asset tokens, the ones the price API can actually price. A core
// asset without price support must not take the single-sided shortcut below: its side
// values to 0, doubling still gives 0, and the pair would be dropped even when the
// other side is priceable. On API failure returns empty (every pair takes the
// two-sided path, same as before this optimization).
async function getPricedCoreTokens(chain: string, tokens: string[]): Promise<Set<string>> {
  try {
    const priceData = await coins.getPrices(tokens.map(t => `${chain}:${t}`), 'now')
    return new Set(Object.keys(priceData).map(key => key.split(':')[1].toLowerCase()))
  } catch (e) {
    return new Set()
  }
}

export async function filterPools({ api, pairs, createBalances, maxPairSize = 42, minUSDValue = 200, enforceBalanceFailureRatio = false }: { api: ChainApi, pairs: IJSON<string[]>, createBalances: any, maxPairSize?: number, minUSDValue?: number, enforceBalanceFailureRatio?: boolean }): Promise<IJSON<number>> {
  const chain = api.chain

  const coreTokens = new Set<string>()
  Object.values(pairs).forEach(tokens => tokens.forEach(t => { if (isCoreAsset(chain, t)) coreTokens.add(t.toLowerCase()) }))
  const pricedCoreTokens = await getPricedCoreTokens(chain, [...coreTokens])

  // A pair holding a priced core asset needs only that side's balance: in an AMM both
  // sides hold equal value, so pool value ~= 2x the core side. Only pairs without a
  // priced core asset need both balances (and both tokens priced).
  const balanceCalls: { target: string, params: string }[] = []
  const pairHasPricedCore: IJSON<boolean> = {}
  for (const [pair, tokens] of Object.entries(pairs)) {
    const coreToken = tokens.find(t => pricedCoreTokens.has(t.toLowerCase()))
    if (coreToken) {
      pairHasPricedCore[pair] = true
      if (coreToken !== ZERO_ADDRESS) balanceCalls.push({ target: coreToken, params: pair })
    } else {
      tokens.forEach(t => { if (t !== ZERO_ADDRESS) balanceCalls.push({ target: t, params: pair }) })
    }
  }

  const res = await api.multiCall({ abi: 'erc20:balanceOf', calls: balanceCalls, permitFailure: true, })

  // Retry failed calls to separate infra failure from deterministic reverts:
  // - every call still fails after the retries -> the RPC is dead, throw
  // - the retries fixed some calls (flaky/rate-limited RPC) and too many still fail -> throw
  // - the retries fixed nothing while the rest of the batch succeeds -> the failures are
  //   deterministic (broken token contracts, seen on hyperliquid) and count as zero
  let failedIndices = res.map((bal, i) => bal == null ? i : -1).filter((i) => i > -1)
  let retryFixed = 0
  for (let attempt = 0; attempt < MAX_BALANCE_CALL_RETRIES && failedIndices.length; attempt++) {
    const retried = await api.multiCall({ abi: 'erc20:balanceOf', calls: failedIndices.map((i) => balanceCalls[i]), permitFailure: true, })
    retried.forEach((bal, j) => { if (bal != null) { res[failedIndices[j]] = bal; retryFixed++ } })
    failedIndices = failedIndices.filter((_, j) => retried[j] == null)
  }
  const failedCalls = failedIndices.length
  const rpcIsDead = balanceCalls.length > 0 && failedCalls === balanceCalls.length
  const rpcIsFlaky = (retryFixed > 0 || enforceBalanceFailureRatio) && failedCalls / balanceCalls.length > MAX_FAILED_BALANCE_CALL_RATIO
  if (rpcIsDead || rpcIsFlaky)
    throw new Error(`filterPools: ${failedCalls}/${balanceCalls.length} pooled balance calls failed on ${api.chain}, refusing to report ${Object.keys(pairs).length} pools as (partly) empty`)
  const balances: Balances = createBalances()
  const pairBalances: IJSON<Balances> = {}
  res.forEach((bal, i) => {
    balances.add(balanceCalls[i].target, bal)
    if (!pairBalances[balanceCalls[i].params]) {
      pairBalances[balanceCalls[i].params] = createBalances()
    }
    pairBalances[balanceCalls[i].params].add(balanceCalls[i].target, bal ?? 0)
  })
  // we do this to cache price results
  await balances.getUSDValue()
  const filteredPairs: IJSON<number> = {}
  for (const pair of Object.keys(pairs)) {
    if (!pairBalances[pair]) continue;
    let pooledValue = await pairBalances[pair].getUSDValue()
    if (pairHasPricedCore[pair]) pooledValue *= 2
    if (pooledValue < minUSDValue)
      continue;
    filteredPairs[pair] = pooledValue
  }

  if (Object.keys(filteredPairs).length < maxPairSize)
    return filteredPairs

  // if there are more than 21 pools, we need to filter out the ones with the lowest value
  const sortedPairs = Object.entries(filteredPairs).sort((a, b) => b[1] - a[1]).slice(0, maxPairSize)
  return Object.fromEntries(sortedPairs)
}

const v2SyncEvent = 'event Sync(uint112 reserve0, uint112 reserve1)'

// Per-pair logs in pairIds order. scanLogsByTopic replaces the getLogs per pair with one scan of the
// event topic over the window, kept to these pairs (logs from other contracts are dropped).
async function getPairLogs({ getLogs, pairIds, eventAbi, onlyArgs = true, scanLogsByTopic = false }: { getLogs: FetchOptions['getLogs'], pairIds: string[], eventAbi: string, onlyArgs?: boolean, scanLogsByTopic?: boolean }): Promise<any[][]> {
  if (!scanLogsByTopic) return getLogs({ targets: pairIds, eventAbi, flatten: false, onlyArgs })
  const pairIndex: IJSON<number> = {}
  pairIds.forEach((pair, i) => { pairIndex[pair.toLowerCase()] = i })
  const pairLogs: any[][] = pairIds.map(() => [])
  const logs = await getLogs({ noTarget: true, eventAbi, onlyArgs: false })
  for (const log of logs) {
    const i = pairIndex[String(log.address).toLowerCase()]
    if (i !== undefined) pairLogs[i].push(onlyArgs ? log.args : log)
  }
  return pairLogs
}

// filterPools for chains whose public RPCs serve logs but have pruned past state, so the
// balanceOf calls at the window's block fail. A pair's reserves after its last Sync in the
// window are its balances at the window end, the same point-in-time value filterPools reads.
// Every UniV2 swap emits Sync, so a pair with no Sync in the window had no swap to count.
async function filterPoolsBySyncReserves({ fetchOptions, pairs, maxPairSize = 42, minUSDValue = 200, scanLogsByTopic }: { fetchOptions: FetchOptions, pairs: IJSON<string[]>, maxPairSize?: number, minUSDValue?: number, scanLogsByTopic?: boolean }): Promise<IJSON<number>> {
  const { chain, createBalances, getLogs } = fetchOptions
  const pairIds = Object.keys(pairs)
  if (!pairIds.length) return {}

  const coreTokens = new Set<string>()
  Object.values(pairs).forEach(tokens => tokens.forEach(t => { if (isCoreAsset(chain, t)) coreTokens.add(t.toLowerCase()) }))
  const pricedCoreTokens = await getPricedCoreTokens(chain, [...coreTokens])

  const syncLogs = await getPairLogs({ getLogs, pairIds, eventAbi: v2SyncEvent, onlyArgs: false, scanLogsByTopic })
  const balances: Balances = createBalances()
  const pairBalances: IJSON<Balances> = {}
  const pairHasPricedCore: IJSON<boolean> = {}
  syncLogs.forEach((logs: any[], i: number) => {
    if (!logs?.length) return
    const pair = pairIds[i]
    const last = logs.map(toPositionedLogArgs).sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)[0]
    const reserves = [last.reserve0, last.reserve1]
    const tokens = pairs[pair]
    // valued like filterPools: 2x the priced core side when the pair has one, else both sides
    const coreIndex = tokens.findIndex(t => pricedCoreTokens.has(t.toLowerCase()))
    pairHasPricedCore[pair] = coreIndex > -1
    pairBalances[pair] = createBalances()
    tokens.forEach((token, j) => {
      if (coreIndex > -1 && j !== coreIndex) return
      balances.add(token, reserves[j])
      pairBalances[pair].add(token, reserves[j])
    })
  })
  // we do this to cache price results
  await balances.getUSDValue()
  const filteredPairs: IJSON<number> = {}
  for (const pair of Object.keys(pairBalances)) {
    let pooledValue = await pairBalances[pair].getUSDValue()
    if (pairHasPricedCore[pair]) pooledValue *= 2
    if (pooledValue < minUSDValue) continue
    filteredPairs[pair] = pooledValue
  }

  const sortedPairs = Object.entries(filteredPairs).sort((a, b) => b[1] - a[1]).slice(0, maxPairSize)
  return Object.fromEntries(sortedPairs)
}

// drop pairs where either side is a blacklisted token (see helpers/lists.ts)
function filterBlacklistedTokens(pairObject: IJSON<string[]>, blacklistTokens?: string[]): IJSON<string[]> {
  if (!blacklistTokens?.length) return pairObject
  const blacklist = new Set(blacklistTokens.map(i => i.toLowerCase()))
  const filtered: IJSON<string[]> = {}
  for (const [pair, tokens] of Object.entries(pairObject)) {
    if (tokens.some(token => blacklist.has(String(token).toLowerCase()))) continue
    filtered[pair] = tokens
  }
  return filtered
}

function filterBlacklistedPools(pairObject: IJSON<string[]>, blacklistPools?: string[]): IJSON<string[]> {
  if (!blacklistPools?.length) return pairObject

  const blacklistPoolsSet = new Set(blacklistPools.map(i => i.toLowerCase()))
  const pairsToFilter: typeof pairObject = { ...pairObject }
  Object.keys(pairsToFilter).forEach(pair => {
    if (blacklistPoolsSet.has(pair.toLowerCase())) delete pairsToFilter[pair]
  })
  return pairsToFilter
}

const defaultV2SwapEvent = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'
const notifyRewardEvent = 'event NotifyReward(address indexed from,address indexed reward,uint256 indexed epoch,uint256 amount)';

export const getUniV2LogAdapter: any = (v2Config: UniV2Config): FetchV2 => {
  let { factory, fees = 0.003, swapEvent = defaultV2SwapEvent, stableFees = 1 / 10000, voter, maxPairSize, customLogic, blacklistedAddresses, userFeesRatio, revenueRatio, protocolRevenueRatio, holdersRevenueRatio, blacklistPools, blacklistTokens, allowReadPairs, enforceBalanceFailureRatio, useSyncReserves, scanLogsByTopic } = v2Config
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, chain, api } = fetchOptions
    let blacklistedAddressesSet: any
    if (blacklistedAddresses) {
      blacklistedAddressesSet = new Set(blacklistedAddresses.map(i => i.toLowerCase()))
    }

    if (!chain) throw new Error('Wrong version?')


    factory = factory.toLowerCase()
    const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`

    let { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true })
    if (!pairs?.length) {
      if (!allowReadPairs) {
        throw new Error('No pairs found, is there TVL adapter for this already?')
      } else {
        const pairLength = await fetchOptions.api.call({ target: factory, abi: 'uint256:allPairsLength' })
        if (pairLength && Number(pairLength) > 0) {
          const calls = []
          for (let i = 0; i < Number(pairLength); i++) {
            calls.push({ target: factory, params: [i] })
          }
          pairs = await fetchOptions.api.multiCall({ abi: 'function allPairs(uint256) public view returns (address)', calls })
          token0s = await fetchOptions.api.multiCall({ abi: 'address:token0', calls: pairs })
          token1s = await fetchOptions.api.multiCall({ abi: 'address:token1', calls: pairs })
        }
      }
    }

    const pairObject: IJSON<string[]> = {}
    pairs.forEach((pair: string, i: number) => {
      pairObject[pair] = [token0s[i], token1s[i]]
    })
    const dailyVolume = createBalances()
    const swapFees = createBalances()
    const blacklistPoolsSet = blacklistPools ? new Set(blacklistPools.map(i => i.toLowerCase())) : null
    const pairsToFilter = filterBlacklistedPools(filterBlacklistedTokens(pairObject, blacklistTokens), blacklistPools)
    const filteredPairs = useSyncReserves
      ? await filterPoolsBySyncReserves({ fetchOptions, pairs: pairsToFilter, maxPairSize, scanLogsByTopic })
      : await filterPools({ api, pairs: pairsToFilter, createBalances, maxPairSize, enforceBalanceFailureRatio })
    const pairIds = Object.keys(filteredPairs)
    api.log(`uniV2RunLog: Filtered to ${pairIds.length}/${pairs.length} pairs Factory: ${factory} Chain: ${chain}`)
    const isStablePair = await api.multiCall({ abi: 'bool:stable', calls: pairIds, permitFailure: true })

    if (!pairIds.length) return {
      dailyVolume,
      dailyFees: swapFees,
      dailyUserFees: userFeesRatio !== undefined ? 0 : undefined,
      dailyRevenue: revenueRatio !== undefined ? 0 : undefined,
      dailySupplySideRevenue: revenueRatio !== undefined ? 0 : undefined,
      dailyProtocolRevenue: protocolRevenueRatio !== undefined ? 0 : undefined,
      dailyHoldersRevenue: holdersRevenueRatio !== undefined ? 0 : undefined,
    }

    const allLogs = await getPairLogs({ getLogs, pairIds, eventAbi: swapEvent, scanLogsByTopic })
    allLogs.map((logs: any, index) => {
      if (!logs.length) return;
      const pair = pairIds[index]
      if (blacklistPoolsSet && blacklistPoolsSet.has(pair.toLowerCase())) return;
      let _fees = isStablePair[index] ? stableFees : fees
      const [token0, token1] = pairObject[pair]
      logs.forEach((log: any) => {
        if (blacklistedAddressesSet) {
          if (
            blacklistedAddressesSet.has(log.sender.toLowerCase()) ||
            blacklistedAddressesSet.has(log.to.toLowerCase()))
            return;
        }
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
        addOneToken({ chain, balances: swapFees, token0, token1, amount0: Number(log.amount0In) * _fees, amount1: Number(log.amount1In) * _fees })
        addOneToken({ chain, balances: swapFees, token0, token1, amount0: Number(log.amount0Out) * _fees, amount1: Number(log.amount1Out) * _fees })
      })
    })

    if (customLogic)
      return customLogic({ pairObject, dailyVolume, dailyFees: swapFees, filteredPairs, fetchOptions })

    const dailyFees = swapFees.clone(1, 'Token Swap Fees');

    if (voter) {
      const dailyBribesRevenue = createBalances()
      const bribeContracts: string[] = await api.multiCall({ abi: 'function gauges(address) view returns (address)', calls: pairIds, target: voter })
      let feesVotingReward: string[] = await api.multiCall({ abi: 'address:feesVotingReward', calls: bribeContracts, permitFailure: true })
      if (feesVotingReward.filter((e: any) => e).length === 0) {
        api.log('No feesVotingReward found, trying bribes')
        feesVotingReward = bribeContracts
      }
      api.log(bribeContracts.length, 'bribes contracts found')

      const logs = await getLogs({ targets: feesVotingReward.filter(i => i !== ZERO_ADDRESS), eventAbi: notifyRewardEvent, })

      logs.map((e: any) => {
        dailyBribesRevenue.add(e.reward, e.amount)
      })

      dailyFees.add(dailyBribesRevenue, 'Bribes Rewards')

      return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees }
    }

    const response: any = { dailyVolume, dailyFees }

    if (revenueRatio || revenueRatio === 0) {
      response.dailyRevenue = dailyFees.clone(revenueRatio, 'Protocol fees')
      response.dailySupplySideRevenue = dailyFees.clone(1 - revenueRatio, 'LP fees')
    }
    if (v2Config.hasOwnProperty('userFeesRatio')) response.dailyUserFees = dailyFees.clone(userFeesRatio, 'Trading fees')
    if (v2Config.hasOwnProperty('protocolRevenueRatio')) response.dailyProtocolRevenue = dailyFees.clone(protocolRevenueRatio, 'Protocol fees')
    if (v2Config.hasOwnProperty('holdersRevenueRatio')) response.dailyHoldersRevenue = dailyFees.clone(holdersRevenueRatio, 'Tokenholder fees')

    return response
  }
  return fetch
}

export const defaultV3SwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'
const defaultPoolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const defaultAlgebraV3PoolCreatedEvent = 'event Pool (address indexed token0, address indexed token1, address pool)'
const defaultFeeChangeEvent = 'event SetFee(uint24 feeOld, uint24 feeNew)'
// Algebra Constants.COMMUNITY_FEE_DENOMINATOR, same on V1.9 and Integral
const COMMUNITY_FEE_DENOMINATOR = 1e3

export const getUniV3LogAdapter: any = ({ factory, poolCreatedEvent, swapEvent = defaultV3SwapEvent, customLogic, isAlgebraV3 = false, isAlgebraV2 = false, feeFromSlot0 = false, feeChangeEvent = defaultFeeChangeEvent, userFeesRatio, revenueRatio, protocolRevenueRatio, holdersRevenueRatio, blacklistPools, blacklistTokens, blacklistedAddresses, pools, getRevenueRatio, dynamicProtocolFees = false, algebraCommunityFee = false, noStateReads = false, protocolFeesInSwapEvent = false }: UniV3Config): FetchV2 => {
  const blacklistedAddressesSet = blacklistedAddresses ? new Set(blacklistedAddresses.map(i => i.toLowerCase())) : null
  if (noStateReads && (!factory || isAlgebraV3 || isAlgebraV2 || algebraCommunityFee || dynamicProtocolFees || feeFromSlot0))
    throw new Error('noStateReads needs factory pools whose fee tier is in the PoolCreated log, every other option reads pool state')
  const fetch: FetchV2 = async (fetchOptions) => {
    const { createBalances, getLogs, chain, api } = fetchOptions
    const pairObject: IJSON<string[]> = {}
    const fees: any = {}
    const feeTimelines: IJSON<{ blockNumber: number, logIndex: number, fee: number }[]> = {}
    const communityFees: IJSON<number> = {}

    if (!chain) throw new Error('Wrong version?')

    if (factory) {

      // Determine which event to use based on parameters
      // If poolCreatedEvent is explicitly passed, use it
      // Otherwise, use algebra default for algebra or standard default for others
      const eventToUse = poolCreatedEvent ?? (isAlgebraV3 ? defaultAlgebraV3PoolCreatedEvent : defaultPoolCreatedEvent)

      factory = factory.toLowerCase()
      const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${factory}.json`
      const iface = new ethers.Interface([eventToUse])
      let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
      if (!logs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')

      // bad rpcs return bad log with undefined format, filter them out
      logs = logs.map((log: any) => iface.parseLog(log)?.args).filter((log: any) => !!log)

      logs.forEach((log: any) => {
        pairObject[log.pool] = [log.token0, log.token1]
        fees[log.pool] = (log.fee?.toString() || 0) / 1e6 // seem some protocol v3 forks does not have fee in the log when not use defaultPoolCreatedEvent
      })

      if (isAlgebraV3) {
        let _fees = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: logs.map((log: any) => log.pool), permitFailure: true })
        _fees.forEach((fee: any, i: number) => { if (fee != null) fees[logs[i].pool] = fee / 1e6 })
      }
      if (isAlgebraV2) {
        let _states = await api.multiCall({ abi: 'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint16 communityFeeToken0, uint16 communityFeeToken1, bool unlocked)', calls: logs.map((log: any) => log.pool), permitFailure: true })
        _states.forEach((state: any, i: number) => { if (state != null) fees[logs[i].pool] = Number(state.fee) / 1e6 })
      }

      // share of swap fees the protocol keeps, stored in the pool's globalState:
      // 6th value on Algebra V1/V1.9 pools, 5th on Algebra Integral pools
      if (algebraCommunityFee) {
        const abi = isAlgebraV3
          ? 'function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee)'
          : 'function globalState() view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint16 communityFee)'
        const _states = await api.multiCall({ abi, calls: logs.map((log: any) => log.pool), permitFailure: true })
        _states.forEach((state: any, i: number) => {
          if (state == null) return
          communityFees[logs[i].pool] = Number(state.communityFee) / COMMUNITY_FEE_DENOMINATOR
          // some Integral pools have no fee() method; the current fee is the 3rd globalState field
          if (isAlgebraV3 && !fees[logs[i].pool]) fees[logs[i].pool] = Number(state.fee) / 1e6
        })
      }
    } else if (Array.isArray(pools)) {

      pools = pools.map(i => i.toLowerCase())
      const _fees = await api.multiCall({ abi: 'function fee() view returns (uint24)', calls: pools, permitFailure: true })
      const token0s = await api.multiCall({ abi: 'address:token0', calls: pools, permitFailure: true })
      const token1s = await api.multiCall({ abi: 'address:token1', calls: pools, permitFailure: true })
      pools.forEach((pool: string, i: number) => {
        if (!token0s[i] || !token1s[i] || !_fees[i]) return; // skip if any call failed
        fees[pool] = _fees[i] / 1e6
        pairObject[pool] = [token0s[i], token1s[i]]
      })
    } else {
      throw new Error('Either factory or pools must be provided in the config')
    }

    const blacklistPoolsSet = blacklistPools ? new Set(blacklistPools.map(i => i.toLowerCase())) : null
    const pairsToFilter = filterBlacklistedPools(filterBlacklistedTokens(pairObject, blacklistTokens), blacklistPools)
    let filteredPairs: IJSON<number>
    let poolSwapLogs: IJSON<any[]> | undefined
    if (noStateReads) {
      // No balanceOf filter: scan the window's swaps by topic and keep the factory's own pools (PoolCreated cache) that
      // hold a core asset. addOneToken then prices only that core leg, so no long-tail token is ever priced.
      const corePools: IJSON<string> = {}
      for (const [pool, tokens] of Object.entries(pairsToFilter))
        if (tokens.some(t => isCoreAsset(chain, t))) corePools[pool.toLowerCase()] = pool
      const swapLogs = await getLogs({ noTarget: true, eventAbi: swapEvent, onlyArgs: false })
      poolSwapLogs = {}
      for (const log of swapLogs) {
        const pool = corePools[String(log.address).toLowerCase()]
        if (pool) (poolSwapLogs[pool] ??= []).push(log.args)
      }
      filteredPairs = Object.fromEntries(Object.keys(poolSwapLogs).map(pool => [pool, 0]))
    } else {
      filteredPairs = await filterPools({ api, pairs: pairsToFilter, createBalances })
    }
    const dailyVolume = createBalances()
    const swapFees = createBalances()
    const revenue = createBalances()
    const supplySideRevenue = createBalances()
    const protocolRevenue = createBalances()
    const holdersRevenue = createBalances()

    let revenueEnabled = false;
    let protocolRevenueEnabled = false;
    let holdersRevenueEnabled = false;

    if (!Object.keys(filteredPairs).length) return {
      dailyVolume,
      dailyFees: swapFees,
      dailyUserFees: userFeesRatio !== undefined ? 0 : undefined,
      dailyRevenue: revenueRatio !== undefined || getRevenueRatio ? 0 : undefined,
      dailySupplySideRevenue: revenueRatio !== undefined || getRevenueRatio ? 0 : undefined,
      dailyProtocolRevenue: protocolRevenueRatio !== undefined || getRevenueRatio ? 0 : undefined,
      dailyHoldersRevenue: holdersRevenueRatio !== undefined || getRevenueRatio ? 0 : undefined,
    }

    const pairs = Object.keys(filteredPairs)
    const protocolFeeRatios: IJSON<{ token0: number, token1: number }> = {}

    if (dynamicProtocolFees) {
      const slot0Results = await api.multiCall({
        abi: "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
        calls: pairs,
        permitFailure: true,
      })

      slot0Results.forEach((slot0: any, i: number) => {
        // a failed read leaves the ratio undefined, so getRevenueRatio can reject it instead of seeing feeProtocol = 0
        if (!slot0) return
        const feeProtocol = Number(slot0.feeProtocol)
        const token0Denominator = feeProtocol & 0x0f
        const token1Denominator = (feeProtocol >> 4) & 0x0f

        protocolFeeRatios[pairs[i]] = {
          token0: token0Denominator > 0 ? 1 / token0Denominator : 0,
          token1: token1Denominator > 0 ? 1 / token1Denominator : 0,
        }
      })
    }

    if (feeFromSlot0) {
      const slot0Abi = 'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint24 fee, bool unlocked)'
      const readSlots = async (slotApi: ChainApi) => {
        const _slots = await slotApi.multiCall({ abi: slot0Abi, calls: pairs, permitFailure: true })
        const retryIndexes = pairs.map((_: string, i: number) => i).filter((i: number) => _slots[i] == null)
        if (retryIndexes.length) {
          const _retries = await slotApi.multiCall({ abi: slot0Abi, calls: retryIndexes.map((i: number) => pairs[i]), permitFailure: true })
          retryIndexes.forEach((i: number, j: number) => { _slots[i] = _retries[j] })
        }
        return _slots
      }
      const _slots = await readSlots(api)
      const unread = pairs.filter((_: string, i: number) => _slots[i] == null)
      if (unread.length) throw new Error(`slot0 unreadable on ${unread.length} of ${pairs.length} pools, the fee in the pool creation log is a tick spacing and cannot be used instead: first ${unread[0]}`)
      _slots.forEach((slot: any, i: number) => { fees[pairs[i]] = Number(slot.fee) / 1e6 })

      const openingSlots = await readSlots(new ChainApi({ chain, block: (await fetchOptions.getFromBlock()) - 1 }))
      const changeLogs = await getLogs({ targets: pairs, eventAbi: feeChangeEvent, flatten: false, onlyArgs: false })
      changeLogs.forEach((logs: any[], i: number) => {
        const pair = pairs[i]
        const openingFee = openingSlots[i] == null ? undefined : Number(openingSlots[i].fee) / 1e6
        if (!logs?.length) {
          if (openingFee !== undefined && openingFee !== fees[pair]) throw new Error(`fee change logs missing on ${pair}: fee went from ${openingFee} to ${fees[pair]} in the window but no change was logged`)
          return
        }
        const positions = new Set()
        const changes = logs.map(toPositionedLogArgs)
          .filter((change: any) => {
            const position = `${change.blockNumber}:${change.logIndex}`
            if (positions.has(position)) return false
            positions.add(position)
            return true
          })
          .sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
        const chained = changes.every((change: any, j: number) => j === 0 || Number(change.feeOld) === Number(changes[j - 1].feeNew))
        const opensAtOpeningFee = openingFee === undefined || Number(changes[0].feeOld) / 1e6 === openingFee
        const closesAtClosingFee = Number(changes[changes.length - 1].feeNew) / 1e6 === fees[pair]
        if (!chained || !opensAtOpeningFee || !closesAtClosingFee) throw new Error(`fee change logs incomplete on ${pair}: ${changes.length} changes do not link the opening fee ${openingFee} to the closing fee ${fees[pair]}`)
        feeTimelines[pair] = [
          { blockNumber: -1, logIndex: -1, fee: Number(changes[0].feeOld) / 1e6 },
          ...changes.map((change: any) => ({ blockNumber: change.blockNumber, logIndex: change.logIndex, fee: Number(change.feeNew) / 1e6 })),
        ]
      })
    }

    const hasFeeTimelines = Object.keys(feeTimelines).length > 0
    const feeAt = (timeline: { blockNumber: number, logIndex: number, fee: number }[], blockNumber: number, logIndex: number) => {
      let fee = timeline[0].fee
      for (const change of timeline.slice(1)) {
        if (change.blockNumber > blockNumber || (change.blockNumber === blockNumber && change.logIndex > logIndex)) break
        fee = change.fee
      }
      return fee
    }

    const allLogs = poolSwapLogs ? pairs.map(pair => poolSwapLogs![pair]) : await getLogs({ targets: pairs, eventAbi: swapEvent, flatten: false, ...(hasFeeTimelines ? { onlyArgs: false } : {}) })

    allLogs.map((rawLogs: any, index) => {
      if (!rawLogs.length) return;
      const pair = pairs[index]
      if (blacklistPoolsSet && blacklistPoolsSet.has(pair.toLowerCase())) return;
      const logs = hasFeeTimelines ? rawLogs.map(toPositionedLogArgs) : rawLogs
      const [token0, token1] = pairObject[pair]
      const feeTier = fees[pair]
      const feeTimeline = feeTimelines[pair]

      let pairRevenueRatio = revenueRatio;
      let pairProtocolRevenueRatio = protocolRevenueRatio;
      let pairHoldersRevenueRatio = holdersRevenueRatio;

      // only use custom revenue ratio when revenueRatio is not set
      if (revenueRatio === undefined && getRevenueRatio && !protocolFeesInSwapEvent) {
        const { _revenueRatio, _protocolRevenueRatio, _holdersRevenueRatio } = getRevenueRatio({
          options: fetchOptions,
          poolFeeTier: feeTier,
          protocolFeeRatioToken0: dynamicProtocolFees ? protocolFeeRatios[pair]?.token0 : undefined,
          protocolFeeRatioToken1: dynamicProtocolFees ? protocolFeeRatios[pair]?.token1 : undefined,
          communityFeeRatio: algebraCommunityFee ? communityFees[pair] : undefined,
        })

        if (!pairRevenueRatio) pairRevenueRatio = _revenueRatio;
        if (!pairProtocolRevenueRatio && _protocolRevenueRatio) pairProtocolRevenueRatio = _protocolRevenueRatio;
        if (!pairHoldersRevenueRatio && _holdersRevenueRatio) pairHoldersRevenueRatio = _holdersRevenueRatio;
      }

      logs.forEach((log: any) => {
        if (blacklistedAddressesSet) {
          if (log.sender === undefined || log.recipient === undefined) throw new Error('blacklistedAddresses needs a swap event with sender and recipient fields')
          if (blacklistedAddressesSet.has(log.sender.toLowerCase()) || blacklistedAddressesSet.has(log.recipient.toLowerCase())) return
        }
        const swapFeeTier = feeTimeline ? feeAt(feeTimeline, log.blockNumber, log.logIndex) : feeTier
        if (protocolFeesInSwapEvent && revenueRatio === undefined && getRevenueRatio) {
          // the Swap log carries the protocol fee taken from the input token, so the cut in force at this swap is read from it
          const isInput0 = BigInt(log.amount0) > 0n
          const protocolFee = isInput0 ? log.protocolFeesToken0 : log.protocolFeesToken1
          if (protocolFee === undefined) throw new Error('protocolFeesInSwapEvent needs a swap event with protocolFeesToken0/1 fields')
          const inputFee = Number(isInput0 ? log.amount0 : log.amount1) * swapFeeTier
          const ratios = getRevenueRatio({ options: fetchOptions, poolFeeTier: swapFeeTier, protocolFeeRatio: inputFee > 0 ? Number(protocolFee) / inputFee : 0 })
          pairRevenueRatio = ratios._revenueRatio
          pairProtocolRevenueRatio = ratios._protocolRevenueRatio
          pairHoldersRevenueRatio = ratios._holdersRevenueRatio
        }
        addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
        const { token: _token, amount: _feeAmount } = addOneToken({ chain, balances: swapFees, token0, token1, amount0: log.amount0.toString() * swapFeeTier, amount1: log.amount1.toString() * swapFeeTier })

        if (pairRevenueRatio || pairRevenueRatio === 0) {
          revenueEnabled = true;
          revenue.add(_token, _feeAmount * pairRevenueRatio);
          supplySideRevenue.add(_token, _feeAmount * (1 - pairRevenueRatio));
        }
        if (pairProtocolRevenueRatio || pairProtocolRevenueRatio === 0) {
          protocolRevenueEnabled = true;
          protocolRevenue.add(_token, _feeAmount * pairProtocolRevenueRatio);
        }
        if (pairHoldersRevenueRatio || pairHoldersRevenueRatio === 0) {
          holdersRevenueEnabled = true;
          holdersRevenue.add(_token, _feeAmount * pairHoldersRevenueRatio);
        }
      })
    })

    if (customLogic) {
      return customLogic({ pairObject, dailyVolume, dailyFees: swapFees, filteredPairs, fetchOptions })
    }

    const dailyFees = swapFees.clone(1, 'Token Swap Fees')
    const response: any = { dailyVolume, dailyFees }

    if (userFeesRatio || userFeesRatio === 0) response.dailyUserFees = dailyFees.clone(userFeesRatio, 'Trading fees')

    if (revenueEnabled) {
      response.dailyRevenue = revenue.clone(1, 'Protocol fees');
      response.dailySupplySideRevenue = supplySideRevenue.clone(1, 'LP fees');
    }

    if (protocolRevenueEnabled) response.dailyProtocolRevenue = protocolRevenue.clone(1, 'Protocol fees')
    if (holdersRevenueEnabled) response.dailyHoldersRevenue = holdersRevenue.clone(1, 'Tokenholder fees')

    return response
  }
  return fetch
}

type UniV2Config = {
  factory: string,
  fees?: number,
  swapEvent?: string,
  stableFees?: number,
  voter?: string,
  maxPairSize?: number,
  customLogic?: any,
  start?: string,
  blacklistedAddresses?: string[],
  userFeesRatio?: number,
  revenueRatio?: number,
  protocolRevenueRatio?: number,
  holdersRevenueRatio?: number,
  blacklistPools?: Array<string>,
  blacklistTokens?: Array<string>, // pairs holding any of these tokens are skipped
  allowReadPairs?: boolean;
  enforceBalanceFailureRatio?: boolean;
  // value pairs from their Sync reserves instead of balanceOf at the window's block, for chains whose RPCs have no archive state
  useSyncReserves?: boolean;
  // fetch Sync/Swap logs with one topic scan per window kept to the factory's pairs, not one getLogs per pair:
  // for quiet chains off the logs indexer whose public RPCs reject a burst of per-pair requests
  scanLogsByTopic?: boolean;
}

export interface UniGetRevenueRatioProps {
  options: FetchOptions;
  poolFeeTier: number;
  // protocolFeesInSwapEvent: share of this swap's fee the protocol took, read from the Swap log
  protocolFeeRatio?: number;
  protocolFeeRatioToken0?: number;
  protocolFeeRatioToken1?: number;
  // Algebra community fee, as a share of the pool's swap fees
  communityFeeRatio?: number;
}

type UniV3Config = {
  factory: string,
  poolCreatedEvent?: string,
  swapEvent?: string,
  customLogic?: any,
  isAlgebraV3?: boolean,
  isAlgebraV2?: boolean,
  feeFromSlot0?: boolean,
  feeChangeEvent?: string,
  userFeesRatio?: number,
  revenueRatio?: number,
  protocolRevenueRatio?: number,
  holdersRevenueRatio?: number,
  start?: string,
  deadFrom?: string,
  blacklistPools?: Array<string>,
  blacklistTokens?: Array<string>, // pools holding any of these tokens are skipped
  blacklistedAddresses?: string[], // swaps whose sender or recipient is listed are skipped (volume and fees)
  pools?: string[], // alternative to providing factory
  dynamicProtocolFees?: boolean,
  // read each Algebra pool's community fee and pass it to getRevenueRatio
  algebraCommunityFee?: boolean,
  // for chains whose public RPCs keep no historical state, so no eth_call at the window block works: skips the pooled-balance
  // filter and counts the core-asset leg of swaps in every factory pool holding a core asset (pool list + swap logs only)
  noStateReads?: boolean,
  // PancakeV3: the Swap event logs the protocol fee taken per swap; getRevenueRatio is called per swap with protocolFeeRatio
  protocolFeesInSwapEvent?: boolean,

  // support to get custom revenue ratio from given pool fee tier
  getRevenueRatio?: (props: UniGetRevenueRatioProps) => { _revenueRatio: number, _protocolRevenueRatio?: number, _holdersRevenueRatio?: number };
}

export function uniV2Exports(config: IJSON<UniV2Config>, { runAsV1 = false, pullHourly = true, ...otherRootOptions } = {}) {
  const exportObject: BaseAdapter = {}


  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = { fetch: getUniV2LogAdapter(chainConfig), start: chainConfig.start }
  })


  if (runAsV1)
    return { adapter: exportObject, version: 1, } as SimpleAdapter


  return { ...otherRootOptions, adapter: exportObject, version: 2, pullHourly, } as SimpleAdapter
}

export function uniV3Exports(config: IJSON<UniV3Config>, { runAsV1 = false, swapEvent, pullHourly = true, ...otherRootOptions }: {
  runAsV1?: boolean,
  swapEvent?: string,
  pullHourly?: boolean,
  [key: string]: any
} = {}) {
  const exportObject: BaseAdapter = {}

  Object.entries(config).map(([chain, chainConfig]) => {
    if (swapEvent) chainConfig.swapEvent = swapEvent
    const fetch: any = getUniV3LogAdapter(chainConfig)
    exportObject[chain] = { fetch, start: chainConfig.start }
    if (chainConfig.deadFrom) exportObject[chain].deadFrom = chainConfig.deadFrom
  })

  if (runAsV1)
    return { adapter: exportObject, version: 1 } as SimpleAdapter


  return { ...otherRootOptions, adapter: exportObject, version: 2, pullHourly, } as SimpleAdapter
}


export async function filterPools2({ fetchOptions, pairs, token0s, token1s, minUSDValue, maxPairSize }: any) {
  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })
  const res = await filterPools({ ...fetchOptions, pairs: pairObject, minUSDValue, maxPairSize })
  pairs = []
  token0s = []
  token1s = []
  Object.keys(res).forEach((pair: any) => {
    pairs.push(pair)
    const [token0, token1] = pairObject[pair]
    token0s.push(token0)
    token1s.push(token1)
  })
  return { pairs, token0s, token1s, pairObject, }
}

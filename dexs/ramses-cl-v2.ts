import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request from "graphql-request";
import { METRIC } from "../helpers/metrics";

// Shared by the Ramses CL, Legacy and DLMM listings (dexs/ramses-legacy-v2.ts, dexs/ramses-dlmm.ts).
type RamsesProduct = "cl" | "legacy" | "dlmm";

interface ChainConfig {
  // Kingdom indexer path: https://gateway.kingdom.dev/<path>/subgraph/v1/graphql
  path: string;
  chainId: number;
  // Time from which every CL, Legacy and DLMM treasury fee recipient is a Ramses holder module
  // (Sarcophagus or Buyback Module). Without it the treasury share stays protocol revenue.
  holderTreasuryFrom?: number;
}

// One listing's entry for a chain: passed as `adapter` and read by that listing's fetch.
type ProductChainConfig = ChainConfig & { start: string };

const chainConfig: Record<string, ChainConfig & { start: Partial<Record<RamsesProduct, string>> }> = {
  [CHAIN.HYPERLIQUID]: { path: "hyperevm", chainId: 999, start: { cl: "2025-11-08", legacy: "2025-11-08" } },
  [CHAIN.ARBITRUM]: { path: "arbitrum", chainId: 42161, start: { cl: "2026-01-13", legacy: "2026-01-28" } },
  [CHAIN.POLYGON]: { path: "polygon", chainId: 137, start: { cl: "2026-01-28", legacy: "2026-01-28" } },
  // Robinhood Chain mainnet: https://docs.robinhood.com/chain/connecting/
  [CHAIN.ROBINHOOD]: {
    path: "robinhood",
    chainId: 4663,
    start: { cl: "2026-07-22", legacy: "2026-07-22", dlmm: "2026-07-22" },
    // 2026-08-16 20:26:47 UTC: treasury recipients moved from the team multisig to the Sarcophagus
    // 0x712567e71a93fb111510a790caf3469677aaba3e in https://robin.etherscan.io/tx/0xb342eb98f58cd72a07ff8f1805d02b20e118e6699597114c725848cbadd72ddf
    // 2026-10-14 21:41:43 UTC: moved to the Buyback Module 0x74f1e8be68ae7bf24bc387ee1a900d5bc23317a3 in
    // https://robin.etherscan.io/tx/0x4e5df9d3d5f14c0cb26ad6731ab4e9f3c11bfb72dcbee0de455ce46b2d99aff1 (both are holder modules)
    holderTreasuryFrom: 1786912007,
  },
  [CHAIN.ELYSIUM]: {
    path: "elysium",
    chainId: 99901,
    start: { cl: "2026-10-31", legacy: "2026-10-30", dlmm: "2026-11-09" },
    // 2026-10-30 00:21:15 UTC, before the first swap: treasury recipients set to the Buyback Module
    // 0xE565310BAa582C768a77a3BB7F86a892eF07D04e in tx 0x1d9a19e3f7f2d6b300454a22f8d0595e36e52c49a094b65f7efd8d3167a10d4b
    holderTreasuryFrom: 1793319675,
  },
};

const productConfig: Record<RamsesProduct, { hourData: string; tokenVolumes: string[]; bribePool: string }> = {
  // tokenVolumes are the hour's swap volume in each pool token, set whether or not the subgraph could price the swap.
  cl: { hourData: "ClPoolHourData", tokenVolumes: ["volumeToken0", "volumeToken1"], bribePool: "clPool" },
  legacy: { hourData: "LegacyPoolHourData", tokenVolumes: ["volumeToken0", "volumeToken1"], bribePool: "legacyPool" },
  dlmm: { hourData: "DLMMPoolHourData", tokenVolumes: ["volumeTokenX", "volumeTokenY"], bribePool: "dlmmPool" },
};

const HOUR = 3600;
const DAY = 24 * HOUR;
const PAGE_SIZE = 1000;
// Voter, treasury and total fees are separately rounded decimal strings; when voter + treasury is all of the
// fee, their parsed sum can exceed the total by float rounding. The allowance is a chosen one part per billion
// of the row's fees with a $1 floor ($0.001 on a $1m row, $1e-9 on sub-dollar rows): enough for independently
// rounded splits, too small to overallocate materially.
const PARTITION_TOLERANCE = 1e-9;

type Row = Record<string, any> & { id: string };

function endpoint(chain: ChainConfig) {
  return `https://gateway.kingdom.dev/${chain.path}/subgraph/v1/graphql`;
}

function parseAmount(row: Row, field: string) {
  const value = row[field];
  const amount = typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid ${field} "${value}" in Ramses row ${row.id}`);
  return amount;
}

// Keyset pagination on the unique id keeps pages stable while the indexer appends rows.
async function fetchAll(chain: ChainConfig, root: string, where: string, fields: string): Promise<Row[]> {
  const rows: Row[] = [];
  let lastId = "";
  while (true) {
    const query = `query ($lastId: String!, $limit: Int!) {
      rows: ${root}(where: { chainId: { _eq: ${chain.chainId} }, ${where}, id: { _gt: $lastId } }, order_by: { id: asc }, limit: $limit) { id ${fields} }
    }`;
    const { rows: page } = await request<{ rows: Row[] }>(endpoint(chain), query, { lastId, limit: PAGE_SIZE });
    if (!Array.isArray(page)) throw new Error(`Ramses ${root} query returned no rows array`);
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
    lastId = page[page.length - 1].id;
  }
}

// An empty result is only a real zero once the indexer has processed every block before the window end.
async function assertIndexedThrough(chain: ChainConfig, endTimestamp: number) {
  const { _meta } = await request<{ _meta: { chainId: number; isReady: boolean; progressBlockTime: string }[] }>(
    endpoint(chain), `{ _meta { chainId isReady progressBlockTime } }`);
  const meta = _meta?.find((m) => m.chainId === chain.chainId);
  const progress = meta ? Date.parse(meta.progressBlockTime) / 1e3 : NaN;
  if (!meta?.isReady || !(progress >= endTimestamp))
    throw new Error(`Ramses ${chain.path} indexer is at ${meta?.progressBlockTime}, before window end ${endTimestamp}`);
}

/**
 * USD value of the external bribes on one product's pools in the window. VoteBribe.amount is already divided by
 * token decimals, and each bribe is valued at the subgraph TokenDayData price of its own UTC day. A positive bribe
 * without a valid positive price for that day throws, so an unpriced bribe is never stored as $0.
 */
async function fetchBribesUSD(chain: ChainConfig, product: RamsesProduct, startTimestamp: number, endTimestamp: number) {
  const bribes = await fetchAll(chain, "VoteBribe",
    `${productConfig[product].bribePool}: { _is_null: false }, timestamp: { _gte: "${startTimestamp}", _lt: "${endTimestamp}" }`,
    "amount token timestamp");
  if (!bribes.length) return 0;

  const priceId = (bribe: Row) => `${chain.chainId}:${bribe.token}:${Math.floor(Number(bribe.timestamp) / DAY) * DAY}`;
  const ids = Array.from(new Set(bribes.map(priceId)));
  const { prices } = await request<{ prices: Row[] }>(endpoint(chain),
    `query ($ids: [String!]!) { prices: TokenDayData(where: { id: { _in: $ids } }) { id priceUSD } }`, { ids });
  if (!Array.isArray(prices)) throw new Error(`Ramses TokenDayData query returned no prices array`);
  const priceById = new Map(prices.map((price) => [price.id, parseAmount(price, "priceUSD")]));

  return bribes.reduce((total, bribe) => {
    const amount = parseAmount(bribe, "amount");
    const price = priceById.get(priceId(bribe));
    if (price === undefined) throw new Error(`Missing TokenDayData ${priceId(bribe)} for Ramses bribe ${bribe.id}`);
    if (amount > 0 && price === 0) throw new Error(`Zero TokenDayData price ${priceId(bribe)} for Ramses bribe ${bribe.id}`);
    return total + amount * price;
  }, 0);
}

async function fetchProduct(options: FetchOptions, product: RamsesProduct, chain: ChainConfig) {
  const startTimestamp = Math.ceil(options.startTimestamp / HOUR) * HOUR;
  const endTimestamp = Math.ceil(options.endTimestamp / HOUR) * HOUR;
  if (endTimestamp <= startTimestamp)
    throw new Error(`Ramses window [${options.startTimestamp}, ${options.endTimestamp}) contains no whole hour`);
  await assertIndexedThrough(chain, endTimestamp);

  const { hourData, tokenVolumes } = productConfig[product];
  const hours = await fetchAll(chain, hourData,
    `startOfHour: { _gte: ${startTimestamp}, _lt: ${endTimestamp} }`,
    `startOfHour volumeUSD ${tokenVolumes.join(" ")} feesUSD voterFeesUSD treasuryFeesUSD`);

  const holderFrom = chain.holderTreasuryFrom;
  let hasTokenVolume = false;
  let volume = 0, fees = 0, voterFees = 0, holderTreasuryFees = 0, protocolTreasuryFees = 0, lpFees = 0;
  for (const row of hours) {
    if (tokenVolumes.some((field) => parseAmount(row, field) > 0)) hasTokenVolume = true;
    const rowFees = parseAmount(row, "feesUSD");
    const rowVoterFees = parseAmount(row, "voterFeesUSD");
    const rowTreasuryFees = parseAmount(row, "treasuryFeesUSD");
    const rowLpFees = rowFees - rowVoterFees - rowTreasuryFees;
    if (rowLpFees < -PARTITION_TOLERANCE * Math.max(rowFees, 1))
      throw new Error(`Ramses row ${row.id} voter + treasury fees exceed total fees`);

    // Hourly buckets do not split fees by recipient, so the hour containing holderTreasuryFrom is prorated by time;
    // hours wholly before it give 0 and hours wholly after give 1.
    const holderShare = holderFrom === undefined ? 0 : Math.min(1, Math.max(0, (row.startOfHour + HOUR - holderFrom) / HOUR));

    volume += parseAmount(row, "volumeUSD");
    fees += rowFees;
    voterFees += rowVoterFees;
    holderTreasuryFees += rowTreasuryFees * holderShare;
    protocolTreasuryFees += rowTreasuryFees * (1 - holderShare);
    lpFees += Math.max(rowLpFees, 0);
  }
  // Swaps in pools whose tokens the subgraph cannot price stay out of the USD totals. When no swap in the window
  // is priced, a 0 would hide real activity, as with the first Elysium Legacy swaps (amountUSD 0).
  if (hasTokenVolume && volume === 0)
    throw new Error(`Ramses ${product} on ${chain.path} has swaps in [${startTimestamp}, ${endTimestamp}) but the subgraph priced none of them`);
  const bribesUSD = await fetchBribesUSD(chain, product, startTimestamp, endTimestamp);

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
  dailyFees.addUSDValue(bribesUSD, "Bribes");
  dailyUserFees.addUSDValue(fees, METRIC.SWAP_FEES);
  for (const balances of [dailyRevenue, dailyHoldersRevenue]) {
    balances.addUSDValue(voterFees + holderTreasuryFees, "Swap Fees to holders");
    balances.addUSDValue(bribesUSD, "Bribes to holders");
  }
  for (const balances of [dailyRevenue, dailyProtocolRevenue]) {
    balances.addUSDValue(protocolTreasuryFees, "Swap Fees to protocol");
  }
  dailySupplySideRevenue.addUSDValue(lpFees, "Swap Fees to LPs");

  return {
    dailyVolume: volume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Volume: "USD value of swaps in Ramses pools, read from the Ramses subgraph; swaps the subgraph could not price in USD are excluded.",
  Fees: "Swap fees paid by traders plus external bribes paid to voters of the pools. Swap fees count only swaps the Ramses subgraph priced in USD; bribes are valued at the subgraph token price on the bribe day.",
  UserFees: "Swap fees paid by traders on swaps the Ramses subgraph priced in USD; unpriced swaps and bribes are not included.",
  Revenue: "Voter and treasury shares of swap fees, allocated when each fee accrues, plus external bribes paid to voters. Swap fees count only swaps the Ramses subgraph priced in USD.",
  ProtocolRevenue: "Treasury share of swap fees that accrued while the treasury recipient was not a Ramses holder module (Sarcophagus or Buyback Module), counting only swaps the Ramses subgraph priced in USD.",
  HoldersRevenue: "Swap fees allocated to xRAM voters, the treasury share that accrued while it was routed to the Sarcophagus or Buyback Module (Robinhood Chain from 2026-08-16 20:26:47 UTC, Elysium from launch), and external bribes. Swap fees count only swaps the Ramses subgraph priced in USD. This is an allocation at fee accrual, not a measurement of executed buybacks or burials.",
  SupplySideRevenue: "Swap fees left to liquidity providers after the voter and treasury shares, counting only swaps the Ramses subgraph priced in USD.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders.",
    "Bribes": "External bribes paid to voters of the pools, valued at the subgraph token price on the bribe day.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders.",
  },
  Revenue: {
    "Swap Fees to holders": "Voter share of swap fees, plus the treasury share accrued while routed to the Sarcophagus or Buyback Module.",
    "Swap Fees to protocol": "Treasury share of swap fees accrued while the recipient was not a Ramses holder module.",
    "Bribes to holders": "External bribes paid to voters.",
  },
  ProtocolRevenue: {
    "Swap Fees to protocol": "Treasury share of swap fees accrued while the recipient was not a Ramses holder module.",
  },
  HoldersRevenue: {
    "Swap Fees to holders": "Voter share of swap fees, plus the treasury share accrued while routed to the Sarcophagus or Buyback Module. In the hour of the Robinhood routing change, the treasury share is split by the time before and after the change.",
    "Bribes to holders": "External bribes paid to voters.",
  },
  SupplySideRevenue: {
    "Swap Fees to LPs": "Swap fees left to liquidity providers after the voter and treasury shares.",
  },
};

export function createRamsesAdapter(product: RamsesProduct): SimpleAdapter {
  const adapter: Record<string, ProductChainConfig> = {};
  for (const [chain, config] of Object.entries(chainConfig)) {
    const start = config.start[product];
    if (start) adapter[chain] = { ...config, start };
  }
  return {
    version: 2,
    pullHourly: true,
    fetch: (options: FetchOptions) => fetchProduct(options, product, adapter[options.chain]),
    adapter,
    methodology,
    breakdownMethodology,
  };
}

export default createRamsesAdapter("cl");

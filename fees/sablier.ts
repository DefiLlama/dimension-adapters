import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// Sablier charges one fee: a flat USD-denominated minimum, paid in native gas
// token on claim. No percentage fee on streamed value. The broker fee in Lockup
// <= v2.x went to third-party front-ends, never Sablier, and is gone in v3.0.
//
// Source is Sablier's fee indexer, deduped per fee-paying tx and gated on
// 2025-02-03 (the day charging began). We sum native `amount`, not `amountUSD`
// (cents), so pricing goes through DefiLlama. Do NOT use the streams indexer's
// `fee` column -- it is the whole tx value, e.g. 232 ETH on a stream-NFT sale.

const INDEXER = "https://indexer.hyperindex.xyz/7672d32/v1/graphql";

// start = first fee-paying transaction on that chain, from the fee indexer.
const CONFIG: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1, start: "2025-02-05" },
  [CHAIN.OPTIMISM]: { chainId: 10, start: "2025-02-03" },
  [CHAIN.XDC]: { chainId: 50, start: "2025-02-21" },
  [CHAIN.BSC]: { chainId: 56, start: "2025-02-08" },
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2025-08-14" },
  [CHAIN.POLYGON]: { chainId: 137, start: "2025-02-25" },
  [CHAIN.MONAD]: { chainId: 143, start: "2025-12-02" },
  [CHAIN.SONIC]: { chainId: 146, start: "2025-11-05" },
  [CHAIN.ERA]: { chainId: 324, start: "2025-02-03" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: "2025-10-22" },
  [CHAIN.LIGHTLINK_PHOENIX]: { chainId: 1890, start: "2025-06-12" },
  [CHAIN.ABSTRACT]: { chainId: 2741, start: "2025-02-04" },
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: "2026-07-26" },
  [CHAIN.SSEED]: { chainId: 5330, start: "2025-05-05" },
  [CHAIN.BASE]: { chainId: 8453, start: "2025-02-04" },
  [CHAIN.MODE]: { chainId: 34443, start: "2025-05-07" },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2025-02-04" },
  [CHAIN.AVAX]: { chainId: 43114, start: "2025-02-04" },
  [CHAIN.SOPHON]: { chainId: 50104, start: "2025-07-25" },
  [CHAIN.LINEA]: { chainId: 59144, start: "2025-02-16" },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: "2025-02-20" },
  [CHAIN.BLAST]: { chainId: 81457, start: "2025-02-18" },
  [CHAIN.CHILIZ]: { chainId: 88888, start: "2025-02-27" },
  [CHAIN.SCROLL]: { chainId: 534352, start: "2025-02-03" },
};

const PAGE_SIZE = 1000;

const buildQuery = (from: number, to: number, cursor: string) => `{
  FeeTransaction(
    where: {
      timestamp: {_gte: "${new Date(from * 1000).toISOString()}", _lt: "${new Date(to * 1000).toISOString()}"}
      id: {_gt: "${cursor}"}
    }
    order_by: {id: asc}
    limit: ${PAGE_SIZE}
  ) {
    id
    chainId
    amount
  }
}`;

interface Row {
  id: string;
  chainId: string;
  amount: string;
}

const fetchWindow = async (from: number, to: number) => {
  const all: Row[] = [];
  let cursor = "";
  while (true) {
    const res: { data: { FeeTransaction: Row[] } } = await postURL(INDEXER, {
      query: buildQuery(from, to, cursor),
    });
    const rows = res.data.FeeTransaction;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }
  return all;
};

// Hold only the active window: keeping all of them grows unbounded on backfills,
// and dropping on settle refetches per chain when chains run sequentially.
let cached: { key: string; rows: Promise<Row[]> } | undefined;

const getWindow = (from: number, to: number) => {
  const key = `${from}-${to}`;
  if (cached?.key !== key) cached = { key, rows: fetchWindow(from, to) };
  return cached.rows;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const { chainId } = CONFIG[options.chain];
  const rows = await getWindow(options.fromTimestamp, options.toTimestamp);
  for (const r of rows) if (Number(r.chainId) === chainId) dailyFees.addGasToken(r.amount);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "The flat fee users pay when they claim tokens from a Sablier stream or airdrop. It is charged in the chain's native coin and targets a fixed dollar amount (around $1, waived to $0 on most chains since 22 April 2026, though the Sablier app still attaches it by default). Nothing is charged as a percentage of the tokens being streamed. Counted from 3 February 2025, the day Sablier began charging.",
    Revenue: "All of it. The fee is Sablier's only income and none of it is shared with liquidity providers, stream creators, or integrators.",
    ProtocolRevenue: "All of it goes to the Sablier treasury. There is no token buyback, burn, or staking distribution, so holders receive nothing.",
  },
  adapter: CONFIG,
  fetch,
};

export default adapter;

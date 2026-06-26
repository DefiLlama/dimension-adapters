import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { postURL } from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// zkp2p is a non-custodial onchain P2P on/off-ramp. Trades execute as "intents"
// against USDC deposits held in the protocol's escrow contracts on Base. The
// protocol's own public Envio indexer exposes per-intent records, including a
// FULFILLED status and a fulfillTimestamp, which we sum to get daily volume.
//
// Indexer: https://indexer.zkp2p.xyz/v1/graphql
// Schema: top-level `Intent` table with `id`, `amount` (USDC base units),
//   `status` (enum: SIGNALED | FULFILLED | PRUNED | ...), and `fulfillTimestamp`.
const INDEXER = "https://indexer.zkp2p.xyz/v1/graphql";
const USDC_BASE = ADDRESSES.base.USDC;
const PAGE_SIZE = 1000;

interface IntentRow {
  id: string;
  amount: string;
}

interface IntentResponse {
  Intent: IntentRow[];
}

// Hasura cursor-pagination by id (lexicographic). Time-windowed by
// fulfillTimestamp so a v2 fetch with arbitrary [from, to) works correctly.
const buildQuery = (fromTs: number, toTs: number, cursor: string) => `
  query {
    Intent(
      where: {
        status: { _eq: FULFILLED }
        fulfillTimestamp: { _gte: "${fromTs}", _lt: "${toTs}" }
        id: { _gt: "${cursor}" }
      }
      order_by: { id: asc }
      limit: ${PAGE_SIZE}
    ) {
      id
      amount
    }
  }
`;

const fetch = async ({ createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
  const dailyVolume = createBalances();
  let cursor = "";

  // Page through all fulfilled intents in the window. Daily volume is
  // typically ~100-200 intents, well under one page, but we paginate for
  // safety in case of historical days with higher activity.
  try {
    while (true) {
      const query = buildQuery(fromTimestamp, toTimestamp, cursor);
      const res : {data: IntentResponse} = await postURL(INDEXER, { query });
      const rows = res.data.Intent;
      if (rows.length === 0) break;
      for (const r of rows) dailyVolume.add(USDC_BASE, r.amount);
      if (rows.length < PAGE_SIZE) break;
      cursor = rows[rows.length - 1].id;
    }
  } catch (e) {
    throw new Error(`Failed to fetch zkp2p volume for ${fromTimestamp}-${toTimestamp}`);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Sum of `amount` across all intents with `status = FULFILLED` and `fulfillTimestamp` in the day window, sourced from the protocol's public Envio GraphQL indexer. Intent amounts are denominated in USDC on Base.",
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-01-21",
    },
  },
};

export default adapter;

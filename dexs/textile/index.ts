import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

// Textile is an on-chain FX DEX (RFQ-style: market-maker bots quote off-chain
// prices, swaps settle atomically through a reactor contract — no AMM pools).
// Volume is read from Textile's public GraphQL API, which serves the protocol's
// Goldsky-indexed reactor fills with per-trade USD volume (the fill's stable
// leg), timestamp and chainId. https://docs.textilecredit.com
const ENDPOINT = "https://api.textilecredit.com/graphql";

const CHAIN_IDS: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.BSC]: 56,
  [CHAIN.POLYGON]: 137,
  [CHAIN.BASE]: 8453,
  [CHAIN.CELO]: 42220,
};

// Server-side [from, to) filter — same bounds as FetchOptions — so we don't
// pull full maker history on every hourly run. settlementTradeVolumes includes
// every reactor fill (Stitches and limit-order fills).
const QUERY = `
  query TextileVolumes($from: Int!, $to: Int!) {
    settlementTradeVolumes(fromTimestamp: $from, toTimestamp: $to) {
      timestamp
      chainId
      volumeUsd
    }
  }
`;

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const chainId = CHAIN_IDS[options.chain];

  const res = await httpPost(ENDPOINT, {
    query: QUERY,
    variables: {
      from: options.fromTimestamp,
      to: options.toTimestamp,
    },
  });
  const rows = res?.data?.settlementTradeVolumes ?? [];

  let dailyVolume = 0;
  for (const t of rows) {
    if (t.chainId !== chainId) continue;
    dailyVolume += t.volumeUsd ?? 0;
  }

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Sum of the USD value of the stable (USDT/USDC) leg of every reactor fill on the chain, as indexed from on-chain Fill transactions by the protocol subgraph and served by Textile's public API (settlementTradeVolumes).",
  },
  fetch,
  chains: Object.keys(CHAIN_IDS),
  start: "2026-06-07",
};

export default adapter;

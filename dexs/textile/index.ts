import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

// Textile is an on-chain FX DEX (RFQ-style: market-maker bots quote off-chain
// prices, swaps settle atomically through a reactor contract — no AMM pools).
// Volume is read from Textile's public GraphQL API, which serves the protocol's
// Goldsky-indexed reactor fills with per-trade USD volume (the fill's stable
// leg), timestamp and chainId. https://docs.textilecredit.com
//
// Not read on-chain directly: the Fill event carries no amounts (they come from
// the maker's Transfer logs in each fill tx), Celo is about half the volume and
// has no llama indexer, and public Celo RPCs drop logs and receipts.
const ENDPOINT = "https://api.textilecredit.com/graphql";

const CHAIN_IDS: Record<string, number> = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.BSC]: 56,
  [CHAIN.POLYGON]: 137,
  [CHAIN.BASE]: 8453,
  [CHAIN.CELO]: 42220,
};

// Server-side [from, to) and chain filter, same bounds as FetchOptions.
// settlementTradeVolumes includes every reactor fill (Stitches and limit-order
// fills). It returns an error rather than a short list when this chain's
// subgraph read failed or hasn't indexed up to `to` yet.
const QUERY = `
  query TextileVolumes($from: Int!, $to: Int!, $chainId: Int!) {
    settlementTradeVolumes(fromTimestamp: $from, toTimestamp: $to, chainId: $chainId) {
      volumeUsd
    }
  }
`;

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const res = await httpPost(ENDPOINT, {
    query: QUERY,
    variables: {
      from: options.fromTimestamp,
      to: options.toTimestamp,
      chainId: CHAIN_IDS[options.chain],
    },
  });

  // GraphQL errors come back with HTTP 200. Treating them as zero volume is how
  // whole hours went missing, so fail the run and let it be retried.
  if (res?.errors?.length) throw new Error(`Textile API: ${res.errors.map((e: any) => e.message).join("; ")}`);
  const rows = res?.data?.settlementTradeVolumes;
  if (!Array.isArray(rows)) throw new Error("Textile API: settlementTradeVolumes missing from response");

  const dailyVolume = rows.reduce((sum: number, row: any) => sum + row.volumeUsd, 0);
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

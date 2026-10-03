import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/**
 * SuiDex — trading volume across both generations of the protocol.
 *
 * SuiDex runs a Uniswap-V2-style AMM and a concentrated-liquidity (V3) DEX side by
 * side on Sui. The endpoint below returns the two summed, with a per-generation
 * breakdown, over an arbitrary window.
 *
 * TVL for this protocol is already listed (DefiLlama-Adapters,
 * `projects/suidex/index.js`, protocol id 7718); this adds the volume dimension
 * under the same `suidex` slug.
 */
const SUIDEX_API = "https://dex.suidex.org/api/defillama/summary";

interface SuidexSummary {
  volumeUsd: number;
  feesUsd: number;
  /** False when either generation could not be read, or when the window reaches
   *  back past the V3 swap history we retain (90 days). */
  complete: boolean;
  coverage?: { v3DataFrom: string | null; windowFullyCovered: boolean };
  breakdown?: {
    v2?: { volumeUsd: number };
    v3?: { volumeUsd: number };
  };
}

const fetch = async (options: FetchOptions) => {
  const url = `${SUIDEX_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const res: SuidexSummary = await fetchURL(url);

  // Throw rather than return a partial figure. V3 swap history is pruned at 90
  // days, so a backfill reaching further back can only be answered from the V2
  // half — which would be a real number that is not the whole number. A missing
  // day is visible; an understated day is not.
  if (!res || res.complete !== true) {
    throw new Error(
      `SuiDex: incomplete data for ${options.startTimestamp}-${options.endTimestamp}` +
      (res?.coverage?.v3DataFrom ? ` (V3 history starts ${res.coverage.v3DataFrom})` : ""),
    );
  }

  return { dailyVolume: res.volumeUsd };
};

const methodology = {
  Volume:
    "Sum of swap volume across SuiDex V2 (constant-product AMM) and SuiDex V3 " +
    "(concentrated liquidity), in USD, as recorded by the protocol's own indexer.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  // The earliest day the endpoint can answer for BOTH generations: V3 swap rows
  // are retained for 90 days, and this is where that window began. Earlier dates
  // would report V2 only, so the adapter refuses them rather than understate.
  start: "2026-07-05",
  methodology,
  pullHourly: true,
};

export default adapter;

import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

/**
 * SuiDex — swap fees and how they are split.
 *
 * Both generations of the protocol take a cut of swap fees and pass the rest to
 * liquidity providers, but they do it differently, so the endpoint weights them
 * separately rather than applying one blended ratio:
 *
 *   V3 (concentrated liquidity) — the protocol's share is stored PER POOL and is
 *   adjustable, so it is read from each pool and that pool's fees weighted by it.
 *   Most pools sit at 20%; they are not all the same.
 *
 *   V2 (constant-product AMM) — a flat 0.30% fee split 0.15 to LPs, 0.09 to the
 *   team, 0.03 to VICTORY lockers and 0.03 to buyback. So 50% supply-side, and the
 *   lockers + buyback portion (20% of fees) goes to token holders.
 */
const SUIDEX_API = "https://dex.suidex.org/api/defillama/summary";

interface SuidexSummary {
  feesUsd: number;
  supplySideRevenueUsd: number;
  protocolRevenueUsd: number;
  holdersRevenueUsd: number;
  complete: boolean;
  coverage?: { v3DataFrom: string | null; windowFullyCovered: boolean };
}

const fetch = async (options: FetchOptions) => {
  const url = `${SUIDEX_API}?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const res: SuidexSummary = await fetchURL(url);

  // See the volume adapter: V3 swap history is pruned at 90 days, so an older
  // window can only be answered from V2. Refuse it rather than publish a figure
  // that looks complete and is not.
  if (!res || res.complete !== true) {
    throw new Error(
      `SuiDex: incomplete data for ${options.startTimestamp}-${options.endTimestamp}` +
      (res?.coverage?.v3DataFrom ? ` (V3 history starts ${res.coverage.v3DataFrom})` : ""),
    );
  }

  return {
    dailyFees: res.feesUsd,
    dailyUserFees: res.feesUsd,
    dailySupplySideRevenue: res.supplySideRevenueUsd,
    dailyRevenue: res.protocolRevenueUsd,
    dailyProtocolRevenue: res.protocolRevenueUsd,
    dailyHoldersRevenue: res.holdersRevenueUsd,
  };
};

const methodology = {
  Fees: "All swap fees paid by traders on SuiDex V2 and V3.",
  UserFees: "Swap fees paid by traders.",
  SupplySideRevenue:
    "The share of swap fees kept by liquidity providers — the per-pool remainder " +
    "after the protocol's cut on V3, and 50% of the 0.30% fee on V2.",
  Revenue:
    "The share of swap fees the protocol keeps: a per-pool percentage on V3 " +
    "(commonly 20%), and 50% of the fee on V2 (team, VICTORY lockers and buyback).",
  ProtocolRevenue: "Same as Revenue.",
  HoldersRevenue:
    "The portion the protocol itself directs to VICTORY holders: the lockers' " +
    "revenue share and the buyback written into the V2 pair contract, together " +
    "20% of V2 swap fees. V3's protocol share is distributed to the team and is " +
    "not contractually directed to holders, so it is counted as protocol revenue " +
    "only — even though part of it is in practice spent buying VICTORY.",
};

const adapter: Adapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  // V3 swap rows are retained for 90 days and this is where that window began;
  // earlier dates would be V2-only, which the adapter refuses.
  start: "2026-07-05",
  methodology,
};

export default adapter;

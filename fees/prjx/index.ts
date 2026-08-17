import { FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchProjectXPools } from "../../helpers/prjx";

// Project X is a Uniswap-V3-style AMM on Hyperliquid L1, tracked on DefiLlama
// for TVL but absent from /fees. Sum the per-pool rolling-24h USD swap fees.
const fetch = async (): Promise<FetchResultV2> => {
  const dailyFees = (await fetchProjectXPools()).reduce((acc, pool) => {
    const fee = Number(pool.fee24h);
    if (!Number.isFinite(fee)) throw new Error(`Project X: invalid fee24h ${pool.fee24h}`);
    return acc + fee;
  }, 0);
  // A Uniswap-V3-style AMM: the pool swap fee is paid by traders and accrues to
  // the liquidity providers, so the same figure is user fees and supply-side
  // revenue. Project X does not publish a protocol-fee split, so none is
  // deducted as protocol revenue.
  return { dailyFees, dailyUserFees: dailyFees, dailySupplySideRevenue: dailyFees };
};

const methodology = {
  Fees: "Sum of the trailing-24h swap fees across Project X's pools (per-pool fee24h, USD), from the Project X pools API.",
  UserFees: "Swap fees paid by traders.",
  SupplySideRevenue: "All swap fees accrue to the liquidity providers.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      // The API exposes only a rolling 24h snapshot, so run at current time.
      runAtCurrTime: true,
      start: '2025-07-08',
    },
  },
  methodology,
};

export default adapter;

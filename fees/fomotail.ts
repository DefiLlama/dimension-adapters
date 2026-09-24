import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

/**
 * Fomotail — copytrade bot on Robinhood Chain (chainId 4663).
 *
 * A user copies a trader; on every profitable close Fomotail charges a 2% performance fee on the
 * realised profit (winners only — losing positions pay nothing), split:
 *   - 1.2% to the copied trader     -> supply-side revenue
 *   - 0.8% to the protocol treasury -> protocol revenue
 * Every fee payout is a USDG transfer.
 *
 * Protocol revenue is measured DIRECTLY on-chain as USDG transfers into the treasury wallet
 * (its only inflow). Total fees and the trader (supply-side) share are derived from the fixed
 * 0.8% / 2% split. USDG (Global Dollar) is a $1 stablecoin.
 */

const USDG = ADDRESSES.robinhood.USDG;
const TREASURY = "0x444d74c47987fb7ae8efb9e9ecf25721fa55fc57";

const FEES_TO_TREASURY = "Performance Fees To Treasury";
const FEES_TO_TRADERS = "Performance Fees To Copied Traders";

const fetch = async (options: FetchOptions) => {
  // Revenue = USDG received by the treasury. Its 0.8% is 40% of the 2% fee, so fees = revenue × 2.5
  // and the trader share = revenue × 1.5.
  const treasury = await addTokensReceived({ options, target: TREASURY, tokens: [USDG] });
  const dailyRevenue = treasury.clone(1, FEES_TO_TREASURY);
  const dailyFees = treasury.clone(2.5, METRIC.PERFORMANCE_FEES);
  const dailySupplySideRevenue = treasury.clone(1.5, FEES_TO_TRADERS);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "2% performance fee on the realised profit of each copied position, charged only on profitable closes.",
  Revenue: "The 0.8% of realised profit kept by the protocol, measured directly as USDG transfers into the treasury.",
  ProtocolRevenue: "The 0.8% of realised profit kept by the protocol, measured directly as USDG transfers into the treasury.",
  SupplySideRevenue: "The 1.2% of realised profit paid to the copied trader (leader), derived from the fixed fee split.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PERFORMANCE_FEES]: "2% of realised profit on each profitable copied close. Losing positions pay nothing.",
  },
  Revenue: {
    [FEES_TO_TREASURY]: "0.8% of realised profit, measured as USDG transferred into the protocol treasury.",
  },
  ProtocolRevenue: {
    [FEES_TO_TREASURY]: "The full protocol share is kept by the treasury. Fomotail has no token, so none is distributed to holders.",
  },
  SupplySideRevenue: {
    [FEES_TO_TRADERS]: "1.2% of realised profit paid to the copied trader, derived from the fixed 0.8% / 2% split.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch,
      start: "2026-08-28", // first on-chain fee: 2026-08-29
    },
  },
};

export default adapter;

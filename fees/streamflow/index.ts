import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type RevenueDailyPoint = {
  day: string;
  revenue_usdc: string;
  buyback_usdc: string;
};

type RevenueDailyResponseSchema = {
  total_revenue_usdc: string;
  total_buyback_usdc: string;
  data: RevenueDailyPoint[];
};

const fetch: any = async (options: FetchOptions) => {
  const result: RevenueDailyResponseSchema = await fetchURL("https://metabase.internal-streamflow.com/_public/api/v1/stats/revenue-daily?days=365");

  // The endpoint serves a rolling window only (days= accepts 7, 30 or 365), so older dates are unreachable and must fail loudly instead of reporting zero.
  const point = result.data.find(p => p.day === options.dateString);
  if (!point) throw new Error(`no revenue row for ${options.dateString} (API serves a rolling 365 days)`);

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  dailyFees.addUSDValue(Number(point.revenue_usdc));
  dailyProtocolRevenue.addUSDValue(Number(point.revenue_usdc) - Number(point.buyback_usdc));
  dailyHoldersRevenue.addUSDValue(Number(point.buyback_usdc));

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue, dailyHoldersRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-04-20',
  allowNegativeValue: true, // buybacks are funded from the treasury, so protocol revenue can go negative on a day they exceed revenue
  methodology: {
    Fees: "All fees paid by users to use a particular Streamflow product.",
    Revenue: "All fees collected by the Streamflow protocols, a portion of which goes towards $STREAM buybacks and distribution to stakers.",
    ProtocolRevenue: "All fees collected by the Streamflow protocols that go into the Streamflow treasury.",
    HoldersRevenue: "Portion of the revenue used to buyback $STREAM tokens.",
  },
}

export default adapter;
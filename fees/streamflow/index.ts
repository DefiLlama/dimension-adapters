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

const solanaFetch: any = async (_a: any, _b:any, options: FetchOptions) => {
  const result: RevenueDailyResponseSchema = await fetchURL("https://metabase.internal-streamflow.com/_public/api/v1/stats/revenue-daily?days=365");

  const day = 60 * 60 * 24;
  const fromTimestamp = options.fromTimestamp - day;
  const toTimestamp = options.toTimestamp - day;

  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const filteredData = result.data.filter(point => {
    const dayTimestamp = new Date(point.day).getTime() / 1000;
    return dayTimestamp > fromTimestamp && dayTimestamp < toTimestamp;
  });

  for (const point of filteredData) {
    dailyFees.addUSDValue(Number(point.revenue_usdc));
    dailyProtocolRevenue.addUSDValue(Number(point.revenue_usdc) - Number(point.buyback_usdc));
    dailyHoldersRevenue.addUSDValue(Number(point.buyback_usdc));
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue, dailyHoldersRevenue }
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology: {
    Fees: "All fees paid by users to use a particular Streamflow product.",
    Revenue: "All fees collected by the Streamflow protocols, a portion of which goes towards $STREAM buybacks and distribution to stakers.",
    ProtocolRevenue: "All fees collected by the Streamflow protocols that go into the Streamflow treasury.",
    HoldersRevenue: "Portion of the revenue used to buyback $STREAM tokens.",
  },
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: solanaFetch,
      start: '2025-04-20',
    },
  },
}

export default adapter;
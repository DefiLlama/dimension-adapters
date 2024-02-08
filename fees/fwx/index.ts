import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

interface IEndpoint {
  dailyFees: string;
  realtimeCompanyRevenue: string;
}

interface IDailyFeeData {
  claimable_token_interest: string;
  held_token_interest: string;
  fee_profit: string;
  fee_auction: string;
  daily_revenue: string;
  daily_fees: string;
}

interface ICompanyRevenue {
  total_claimable_token_interest: string;
  total_held_token_interest: string;
  total_fee_profit: string;
  total_fee_auction: string;
  total_revenue: string;
  total_fees: string;
}

const endpoints: Record<Chain, IEndpoint> = {
  [CHAIN.AVAX]: {
    dailyFees: "https://app.fwx.finance/api/43114/v1/dashboard/daily-fees",
    realtimeCompanyRevenue: "https://app.fwx.finance/api/43114/v1/realtime/company-revenue",
  },
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1e3)
    );
    const date = new Date(dayTimestamp * 1e3);
    const formattedDate = date.toISOString().replace(/\.(\d{3})Z$/, ".$1Z");

    // * call api for daily fees and revenue
    const dailyRes = await httpPost(endpoints[chain].dailyFees, { date: formattedDate });
    const dailyData = dailyRes as IDailyFeeData;

    // * call api for realtime total fees and revenue
    const realtimeRes = await httpPost(endpoints[chain].realtimeCompanyRevenue, {});
    const realtimeData = realtimeRes as ICompanyRevenue;

    return {
      timestamp,
      dailyFees: dailyData.daily_fees,
      dailyRevenue: dailyData.daily_revenue,
      dailySupplySideRevenue: dailyData.claimable_token_interest,
      totalFees: realtimeData.total_fees,
      totalRevenue: realtimeData.total_revenue,
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1701907200,
    },
  },
};
export default adapter;

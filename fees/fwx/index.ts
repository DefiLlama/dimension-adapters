import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import axios from "axios";

interface IEndpoint {
  dailyFee: string;
  realtimeCompanyRevenue: string;
}

interface IDailyFeeData {
  tokenInterestProfit: string;
  feeProfit: string;
  feeAuction: string;
  totalDailyFee: string;
}

interface ICompanyRevenueData {
  name: string;
  value: string;
}
interface ICompanyRevenue {
  data: ICompanyRevenueData[];
}

const endpoints: Record<Chain, IEndpoint> = {
  [CHAIN.AVAX]: {
    dailyFee: "https://app.fwx.finance/api/43114/v1/dashboard/company-revenue",
    realtimeCompanyRevenue:
      "https://app.fwx.finance/api/43114/v1//realtime/wallet-balance",
  },
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1e3)
    );
    const date = new Date(dayTimestamp * 1e3);
    const formattedDate = date.toISOString().replace(/\.(\d{3})Z$/, ".$1Z");

    // * call api for daily fee data
    const dailyFeeRes = await axios.post(endpoints[chain].dailyFee, {
      date: formattedDate,
    });
    const dailyFeeData = dailyFeeRes.data as IDailyFeeData;
    const tokenInterestProfit = parseFloat(dailyFeeData.tokenInterestProfit);
    const dailyHoldersRevenue = 9 * tokenInterestProfit;
    const dailyFees =
      parseFloat(dailyFeeData.totalDailyFee) + dailyHoldersRevenue;
    const dailyProtocolRevenueString = dailyFeeData.totalDailyFee;
    const dailyRevenueString = dailyProtocolRevenueString;

    // * call api for total fee data
    const companyRevenueRes = await axios.post(
      endpoints[chain].realtimeCompanyRevenue
    );
    const companyRevenue = companyRevenueRes.data as ICompanyRevenue;
    let totalFee: number = 0;
    for (let i = 0; i < companyRevenue.data.length; i++) {
      const value = parseFloat(companyRevenue.data[i].value);
      totalFee += value;
    }

    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenueString,
      dailyProtocolRevenue: dailyProtocolRevenueString,
      dailyHoldersRevenue: dailyHoldersRevenue.toString(),
      totalFees: totalFee.toString(),
      timestamp,
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async () => 1701907200,
    },
  },
};
export default adapter;

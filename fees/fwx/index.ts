import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import axios from "axios";

interface IEndpoint {
  dailyFee: string;
  realtimeTvlPlatform: string;
}

interface IDailyFeeData {
  tokenInterestProfit: string;
  feeProfit: string;
  feeAuction: string;
  totalDailyFee: string;
}

interface ITvlPlatformData {
  name: string;
  value: string;
}
interface ITvlPlatform {
  data: ITvlPlatformData[];
}

const endpoints: Record<Chain, IEndpoint> = {
  [CHAIN.AVAX]: {
    dailyFee: "https://app.fwx.finance/api/43114/v1/dashboard/company-revenue",
    realtimeTvlPlatform:
      "https://app.fwx.finance/api/43114/v1//realtime/tvl-platform",
  },
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const date = new Date(timestamp * 1e3);
    const formattedDate = date.toISOString().replace(/\.(\d{3})Z$/, ".$1Z");

    // * call api for daily fee data
    const dailyFeeRes = await axios.post(endpoints[chain].dailyFee, {
      date: formattedDate,
    });
    const dailyFeeData = dailyFeeRes.data as IDailyFeeData;
    const tokenInterestProfit = parseFloat(dailyFeeData.tokenInterestProfit);
    const dailyHoldersRevenue = 0.9 * tokenInterestProfit;
    const dailyProtocolRevenue = 0.1 * tokenInterestProfit;
    const dailyRevenue = dailyProtocolRevenue;

    // * call api for total fee data
    const tvlPlatformRes = await axios.post(
      endpoints[chain].realtimeTvlPlatform
    );
    const tvlPlatform = tvlPlatformRes.data as ITvlPlatform;
    let totalFee: number = 0;
    for (let i = 0; i < tvlPlatform.data.length; i++) {
      const value = parseFloat(tvlPlatform.data[i].value);
      totalFee += value;
    }

    return {
      dailyFees: dailyFeeData.totalDailyFee,
      dailyRevenue: dailyRevenue.toString(),
      dailyProtocolRevenue: dailyProtocolRevenue.toString(),
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

import { Chain } from "@defillama/sdk/build/general";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

interface IConfigs {
  pairs: IPairData[];
}

interface IPairData {
  pair_name: string;
  pair_byte: string;
  underlying_asset: string;
  collateral_asset: string;
}

interface IDailyData {
  all: string;
  long: string;
  short: string;
}
interface IChartData {
  date: string;
  daily_data: IDailyData;
}
interface IChart {
  type: string;
  data: IChartData[];
}
interface IChartRes {
  charts: IChart[];
  pair_names: string[];
}

interface IEndpoint {
  pairData: string;
  tradingVolume: string;
  openInterest: string;
}

const endpoints: Record<Chain, IEndpoint> = {
  [CHAIN.AVAX]: {
    pairData: "https://app.fwx.finance/api/43114/v1//configs",
    tradingVolume: "https://app.fwx.finance/api/43114/v1//chart/trading-volume",
    openInterest: "https://app.fwx.finance/api/43114/v1//chart/open-interest",
  },
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1e3)
    );
    const date = new Date(dayTimestamp * 1e3);
    const formattedDate = date.toISOString().replace(/\.(\d{3})Z$/, ".$1Z");

    // * call api for daily volume
    const pairDataRes = await httpPost(endpoints[chain].pairData, {});
    const pairData = pairDataRes as IConfigs
    const pairs = pairData.pairs.map((p: IPairData) => p.pair_name);

    // * call api for daily volume
    const tradingVolumeRes = await httpPost(endpoints[chain].tradingVolume, {
      from_date: formattedDate,
      to_date: formattedDate,
      pair_names: pairs,
      type: ["all"],
    });
    const tradingVolume = tradingVolumeRes as IChartRes
    const totalVolumeData = tradingVolume.charts.find(
      (x: IChart) => x.type == "all"
    );
    const dailyVolumeData = totalVolumeData?.data.find(
      (x: IChartData) =>
        new Date(x.date).getTime() == new Date(formattedDate).getTime()
    )?.daily_data;

    // * call api for daily open interest
    const openInterestRes = await httpPost(endpoints[chain].openInterest, {
      from_date: formattedDate,
      to_date: formattedDate,
      pair_names: pairs,
      type: ["all"],
    });
    const openInterest = openInterestRes as  IChartRes 
    const openInterestData = openInterest.charts.find(
      (x: IChart) => x.type == "all"
    );
    const dailyOpenInterestData = openInterestData?.data.find(
      (x: IChartData) =>
        new Date(x.date).getTime() == new Date(formattedDate).getTime()
    )?.daily_data;

    return {
      dailyVolume: dailyVolumeData?.all,
      dailyOpenInterest: dailyOpenInterestData?.all,
      timestamp: timestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1701907200,
    },
  },
};

export default adapter;

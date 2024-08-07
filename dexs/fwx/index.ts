import { Chain } from "@defillama/sdk/build/general";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

interface IDailyData {
  date: string;
  short: string;
  long: string;
  total: string;
}
interface IRes {
  data: IDailyData[];
}

interface IEndpoint {
  tradingVolume: string;
  openInterest: string;
}

const CHAIN_ID = {
  [CHAIN.AVAX]: 43114,
};

const endpoints: Record<Chain, IEndpoint> = {
  [CHAIN.AVAX]: {
    tradingVolume: `https://app.fwx.finance/api/v2/trade/volume`,
    openInterest: `https://analytics.fwx.finance/trade/daily-open-interest`,
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
    const tradingVolumeRes = await httpPost(endpoints[chain].tradingVolume, {
      from_date: formattedDate,
      to_date: formattedDate,
      chain_id: CHAIN_ID[chain],
    });
    const tradingVolume = tradingVolumeRes as IRes;
    const dailyVolumeData = tradingVolume?.data.find(
      (x: IDailyData) =>
        new Date(x.date).getTime() == new Date(formattedDate).getTime()
    );

    // * call api for daily open interest
    const openInterestRes = await httpPost(endpoints[chain].openInterest, {
      from_date: formattedDate,
      to_date: formattedDate,
      chain_id: 43114,
    });
    const openInterestData = openInterestRes as IRes;
    const dailyOpenInterestData = openInterestData?.data.find(
      (x: IDailyData) =>
        new Date(x.date).getTime() == new Date(formattedDate).getTime()
    );
    console.log(dailyVolumeData?.total, dailyOpenInterestData?.total);

    return {
      dailyVolume: convertStringNumber(dailyVolumeData?.total || "0"),
      dailyOpenInterest: convertStringNumber(
        dailyOpenInterestData?.total || "0"
      ),
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

// devide by 1e18
function convertStringNumber(inputString: string) {
  let number = BigInt(inputString);
  const divisor = BigInt(1e18);
  let integerPart = number / divisor;
  let fractionalPart = number % divisor;
  let fractionalString = fractionalPart.toString().padStart(18, "0");
  let result = `${integerPart}.${fractionalString}`;
  return result;
}

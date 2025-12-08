import { Chain } from "../../adapters/types";
import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
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

const CHAIN_ID = {
  [CHAIN.AVAX]: 43114,
  [CHAIN.BASE]: 8453,
  [CHAIN.BSC]: 56,
};

const endpoints = {
  tradingVolume: `https://analytics.fwx.finance/api/trade/daily-trade-volume`,
  openInterest: `https://analytics.fwx.finance/api/trade/daily-open-interest`,
};

const fetch = async (timestamp: number, _b: any, options: FetchOptions): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1e3)
  );
  const date = new Date(dayTimestamp * 1e3);
  const formattedDate = date.toISOString().replace(/\.(\d{3})Z$/, ".$1Z");

  // * call api for daily volume
  const tradingVolumePerpRes = await httpPost(endpoints.tradingVolume, {
    from_date: formattedDate,
    to_date: formattedDate,
    chain_id: CHAIN_ID[options.chain],
    is_perp: true,
  });

  const tradingVolumePerp = tradingVolumePerpRes as IRes;
  const dailyPerpVolumeData = tradingVolumePerp?.data.find(
    (x: IDailyData) =>
      new Date(x.date).getTime() == new Date(formattedDate).getTime()
  );

  const tradingVolumeAphRes = await httpPost(endpoints.tradingVolume, {
    from_date: formattedDate,
    to_date: formattedDate,
    chain_id: CHAIN_ID[options.chain],
    is_perp: false,
  });
  const tradingVolumeAph = tradingVolumeAphRes as IRes;
  const dailyAphVolumeData = tradingVolumeAph?.data.find(
    (x: IDailyData) =>
      new Date(x.date).getTime() == new Date(formattedDate).getTime()
  );

  // * call api for daily open interest
  const openInterestRes = await httpPost(endpoints.openInterest, {
    from_date: formattedDate,
    to_date: formattedDate,
    chain_id: CHAIN_ID[options.chain],
  });

  const openInterestData = openInterestRes as IRes;
  const dailyOpenInterestData = openInterestData?.data.find(
    (x: IDailyData) =>
      new Date(x.date).getTime() == new Date(formattedDate).getTime()
  );

  const openInterestValue = BigInt(dailyOpenInterestData?.total || "0");
  return {
    dailyVolume: convertStringNumber(
      BigInt(dailyPerpVolumeData?.total || "0") +
      BigInt(dailyAphVolumeData?.total || "0")
    ),
    openInterestAtEnd: convertStringNumber(
      openInterestValue < 0 ? -openInterestValue : openInterestValue
    ),
    timestamp: timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: "2023-12-07",
    },
    [CHAIN.BASE]: {
      fetch,
      start: "2024-09-04",
    },
    [CHAIN.BSC]: {
      fetch,
      start: "2024-01-22",
    },
  },
};

export default adapter;

// divide by 1e18
function convertStringNumber(number: bigint) {
  const divisor = BigInt(1e18);
  let integerPart = number / divisor;
  let fractionalPart = number % divisor;

  // Ensure fractional part is positive for correct formatting
  if (fractionalPart < 0) {
    fractionalPart = -fractionalPart;
  }

  let fractionalString = fractionalPart.toString().padStart(18, "0");
  return `${integerPart}.${fractionalString}`;
}

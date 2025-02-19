import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const URL = "https://api.citrex.markets/v1/ticker/24hr";

interface ResponseItem {
  fundingRateHourly: string;
  fundingRateYearly: string;
  high: string;
  low: string;
  markPrice: string;
  nextFundingTime: string;
  openInterest: string;
  oraclePrice: string;
  priceChange: string;
  priceChangePercent: string;
  productId: number;
  productSymbol: string;
  volume: string;
}

const fetch = async (timestamp: number) => {
  const response: ResponseItem[] = await httpGet(URL);

  //   console.log(response);

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  //   console.log(dayTimestamp);

  // Divide by 10^18 to convert from min units to USDC as per the contract
  const dailyVolume =
    response.reduce((acc, item) => {
      return acc + Number(item.volume);
    }, 0) /
    10 ** 18;

  //   console.log(dailyVolume);

  return {
    dailyVolume: dailyVolume?.toString(),
    timestamp: dayTimestamp,
  };
};

fetch(1630000000);

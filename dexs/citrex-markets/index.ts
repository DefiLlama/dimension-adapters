import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

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

  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  // Divide by 10^18 to convert from min units to USDC human-readable as per the contract
  let dailyVolume = response.reduce((acc, item) => {
    return acc + Number(item.volume);
  }, 0);

  dailyVolume = dailyVolume / 10 ** 18;

  return {
    dailyVolume: dailyVolume?.toString(),
    timestamp: dayTimestamp,
  };
};

const adapter = {
  version: 1,
  methodology:
    "The daily volume is calculated by querying the Citrex Markets API for the 24-hour volume of all USDC perpetual contracts.",
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-02-18",
    },
  },
};
export default adapter;

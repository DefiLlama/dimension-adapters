import { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { tickerToCgId } from "../../helpers/coingeckoIds";

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

const fetch = async (_: any, _b: any, options: FetchOptions) => {
  const response: ResponseItem[] = await httpGet(URL);

  const dailyVolume = options.createBalances();

  for (const item of response) {
    const ticker = item.productSymbol.replace("perp", "").toUpperCase();
    const cgId = tickerToCgId[ticker];
    const vol = Number(item.volume) / 1e18;
    const markPrice = Number(item.markPrice) / 1e18;

    if (cgId && markPrice > 0) {
      dailyVolume.addCGToken(cgId, vol / markPrice);
    } else {
      dailyVolume.addUSDValue(vol);
    }
  }
  return { dailyVolume };
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

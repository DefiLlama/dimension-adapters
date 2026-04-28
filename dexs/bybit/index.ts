import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBybit } from "../../helpers/cex";

const fetch = async () => {
  const { dailySpotVolume, dailyDerivativesVolume, openInterest } = await fetchBybit();
  return {
    dailyVolume: dailySpotVolume + dailyDerivativesVolume,
    openInterestAtEnd: openInterest,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.OFF_CHAIN]: {
      fetch,
      runAtCurrTime: true,
      start: "2018-03-01",
    },
  },
  methodology: {
    Volume: "Sum of 24h spot, linear (USDT/USDC) perpetual, and inverse perpetual trading volume from Bybit v5 API. Inverse turnover converted to USD using last traded price.",
    OpenInterest: "Aggregate open interest from linear and inverse perpetual markets. Both provided in USD by Bybit's openInterestValue field.",
  },
};

export default adapter;

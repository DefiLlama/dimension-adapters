import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBinance } from "../../helpers/cex";

const fetch = async () => {
  const { dailySpotVolume, dailyDerivativesVolume, openInterest } = await fetchBinance();
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
      start: "2017-07-14",
    },
  },
  methodology: {
    Volume: "Sum of 24h spot, USDT-margined futures, and COIN-margined futures trading volume from Binance public API. Non-USDT spot pairs converted to USD using BTC/ETH/BNB reference prices.",
    OpenInterest: "Aggregate open interest across top USDT-M and COIN-M futures contracts, converted to USD using mark prices.",
  },
};

export default adapter;

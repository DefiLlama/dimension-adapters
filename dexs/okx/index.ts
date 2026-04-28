import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchOkx } from "../../helpers/cex";

const fetch = async () => {
  const { dailySpotVolume, dailyDerivativesVolume, openInterest } = await fetchOkx();
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
      start: "2017-10-01",
    },
  },
  methodology: {
    Volume: "Sum of 24h spot, perpetual swap, and delivery futures trading volume from OKX v5 API. Derivatives volume computed as volCcy24h × last price. Non-stablecoin spot pairs converted to USD using reference prices.",
    OpenInterest: "Aggregate open interest across all perpetual swaps and delivery futures, using OKX's native oiUsd field.",
  },
};

export default adapter;

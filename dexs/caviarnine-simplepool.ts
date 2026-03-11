import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const URL = "https://api-core.caviarnine.com/v1.0/stats/product/simplepools";

const fetch = async (): Promise<FetchResult> => {
  const response = await fetchURL(URL);
  const dailyVolume = response.summary.volume.interval_1d.usd;
  const dailyFees = response.summary.protocol_fees.interval_1d.usd;
  return {
    dailyVolume,
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.RADIXDLT]: {
      fetch,
      runAtCurrTime: true
    },
  },
};

export default adapter;

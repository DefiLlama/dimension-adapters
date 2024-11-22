import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";

const api = "https://orderbook.filament.finance/sei/api/v1/orderbook/tradeVolumeStats/BTC";

const fetch = async () => {
  const timestamp = getUniqStartOfTodayTimestamp();
  const res = await httpGet(api);
  const { allTimeVolume, volumeIn24Hours } = res;

  return {
    timestamp,
    dailyVolume: volumeIn24Hours,
    totalVolume: allTimeVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    sei: {
      fetch,
      runAtCurrTime: true,
    },
  },
};

export default adapter;

import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.dydx.exchange/v3/stats?days=1"

interface IVolumeall {
  quoteVolume: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall[] = Object.values((await fetchURL(historicalVolumeEndpoint))?.data.markets);
  const dailyVolume = historicalVolume.reduce((a: number, b: IVolumeall) => a+Number(b.quoteVolume), 0)
  return {
    dailyVolume: dailyVolume && dailyVolume > 0 ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      runAtCurrTime: true,
      start: async () => 1614211200,
    },
  },
};

export default adapter;

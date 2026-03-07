import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://prod.kokonut-api.com/stats"

interface IVolumeall {
  volume24hrOnlySwap: string;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalVolume: IVolumeall = (await fetchURL(historicalVolumeEndpoint));
  return {
    dailyVolume: historicalVolume ? `${historicalVolume.volume24hrOnlySwap}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: '2022-12-30',
      runAtCurrTime: true
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: () => { throw new Error("No volume data available for polygon zkEVM") },
      start: '2023-06-19',
      deadFrom: "2025-03-21",
    },
    [CHAIN.BASE]: {
      fetch: () => { throw new Error("No volume data available for base") },
      start: '2023-08-09',
      deadFrom: "2025-03-21",
    },
  },
};

export default adapter;

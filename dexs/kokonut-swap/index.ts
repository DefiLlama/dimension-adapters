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

const fetchZKEVM = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const volume24hrOnlySwap = (await fetchURL('https://prod.kokonut-api.com/zkevm-24hr-volume'));
  return {
    dailyVolume: volume24hrOnlySwap,
    timestamp: dayTimestamp,
  };
};

const fetchBASE = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const volume24hrOnlySwap = (await fetchURL('https://prod.kokonut-api.com/base-24hr-volume'));
  return {
    dailyVolume: volume24hrOnlySwap,
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
      fetch: () => ({} as any),
      start: '2023-06-19',
      runAtCurrTime: true
    },
    [CHAIN.BASE]: {
      fetch: () => ({} as any),
      start: '2023-08-09',
      runAtCurrTime: true
    },
  },
};

export default adapter;

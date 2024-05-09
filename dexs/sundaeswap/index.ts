import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, DISABLED_ADAPTER_KEY, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import disabledAdapter from "../../helpers/disabledAdapter";

const historicalVolumeEndpoint = "https://stats.sundaeswap.finance/api/defillama/v0/global-stats/2100"

interface IVolumeall {
  volumeLovelace: number;
  day: string;
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, startOfDay }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances()
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).response;

  dailyVolume.addGasToken(historicalVolume
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(dayItem.day)) === startOfDay)?.volumeLovelace as any)
  return {
    dailyVolume,
    timestamp: startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.CARDANO]: {
      fetch,
      start: 1643673600,
    },
  },
};

export default adapter;

import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://stats.sundaeswap.finance/api/defillama/v0/global-stats/2100"

interface IVolumeall {
  volumeLovelace: number;
  day: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances()
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).response;
  const volume = historicalVolume.find(dayItem => dayItem.day === dateStr)?.volumeLovelace as any
  if (!volume) return { dailyVolume };
  dailyVolume.addGasToken(volume)

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.CARDANO],
  fetch,
  start: '2022-02-01',
};

export default adapter;

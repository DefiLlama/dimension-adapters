import type { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface IVolumeall {
  time: string;
  volume: string;
  totalVolume: string;
};

const historicalVolumeEndpoint = "https://api-mainnet-prod.minswap.org/defillama/v2/volume-series";

const fetch = async ({ startOfDay, createBalances, }: FetchOptions) => {
  const dailyVolume = createBalances();
  const vols: IVolumeall[] = (await httpGet(historicalVolumeEndpoint));
  const volData = vols
    .find(dayItem => new Date(Number(dayItem.time)).getTime() / 1000 === startOfDay)
  dailyVolume.addGasToken(volData?.volume)

  return {
    dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.CARDANO],
  start: '2022-03-24',
};

export default adapter;

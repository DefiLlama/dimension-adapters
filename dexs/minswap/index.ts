import type { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface IVolumeall {
  time: string;
  volume: string;
  totalVolume: string;
};

const historicalVolumeEndpoint = "https://api-mainnet-prod.minswap.org/defillama/v2/volume-series";

const fetch = async (timestamp: number, _: ChainBlocks, { startOfDay, createBalances, }: FetchOptions) => {
  const dailyVolume = createBalances();
  const totalVolume = createBalances();
  const vols: IVolumeall[] = (await httpGet(historicalVolumeEndpoint));
  const volData = vols
    .find(dayItem => new Date(Number(dayItem.time)).getTime() / 1000 === startOfDay)
  dailyVolume.addGasToken(volData?.volume)
  totalVolume.addGasToken(volData?.totalVolume)

  return {
    timestamp: startOfDay,
    // totalVolume,
    dailyVolume,
  }
}

const getStartTimestamp = async () => {
  const historicalVolume: IVolumeall[] = (await httpGet(historicalVolumeEndpoint));
  return (new Date(Number(historicalVolume[0].time)).getTime()) / 1000;
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.CARDANO]: {
      start: 1648080000,
      fetch: fetch,
    }
  }
};

export default adapter;

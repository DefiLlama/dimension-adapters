import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://ttswap.space/api/info"

interface IVolumeall {
  volume24H: number;
}

const fetch = async (_: any) => {
  const historicalVolume: IVolumeall = (await fetchURL(historicalVolumeEndpoint)).data.overview;
  return {
    dailyVolume: historicalVolume ? `${historicalVolume.volume24H}` : undefined,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.THUNDERCORE],
  start: '2023-01-10',
  runAtCurrTime: true,
};

export default adapter;

import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://ocean.defichain.com/v0/mainnet/poolpairs?size=1000"

interface IData {
  volume: IVolume;
}
interface IVolume {
  h24: number;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IData[] = (await fetchURL(historicalVolumeEndpoint))?.data;
  const dailyVolume = historicalVolume
    .reduce((acc, { volume }) => acc + Number(volume.h24), 0)


  return {
    dailyVolume: dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.DEFICHAIN],
  runAtCurrTime: true,
};

export default adapter;

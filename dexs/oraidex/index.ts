import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://api.oraidex.io/v1/pools/"

interface IVolumeall {
  value: number;
  volume24Hour: string;
}

const fetch = async () => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));
  const dailyVolume = historicalVolume
    .filter(e => Number(e.volume24Hour)/1e6 < 100_000_000) // prev pool volume spike
    .reduce((acc, { volume24Hour }) => acc + Number(volume24Hour), 0) / 1e6;

  return {
    dailyVolume: dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ORAI]: {
      fetch,
      runAtCurrTime: true,
      start: '2022-11-24',
    },
  },
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";


const API = "https://api.ondoperps.xyz/v1/perps/volume";

type VolumeItem = {
  market: string;
  volume: string;
  quoteVolume: string;
};

const fetch = async (options: FetchOptions) => {
  const response = await httpGet(API);
  const dailyVolume = response.result.reduce((acc: number, market: VolumeItem) => acc + Number(market.quoteVolume), 0)
  return { dailyVolume }
}

const methodology = {
  Volume:
    "Daily trading volume from Ondo Perps's API.",
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    start: "2025-06-08",
    runAtCurrTime: true,
    methodology,
};

export default adapter;

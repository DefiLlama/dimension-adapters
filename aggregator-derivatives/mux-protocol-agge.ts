import fetchURL from "../utils/fetchURL"
import { Chain, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const historicalVolumeEndpoint = "https://stats.mux.network/api/public/dashboard/13f401da-31b4-4d35-8529-bb62ca408de8/dashcard/389/card/306"

interface IVolumeall {
  volume: string;
  time: string;
  title: string;
}

const chainsMap = {
  [CHAIN.ARBITRUM]: "Arbitrum",
  [CHAIN.AVAX]: "Avalanche",
  [CHAIN.BSC]: "BNB Chain",
  [CHAIN.FANTOM]: "Fantom"
}

const fetch = async (_1: number, _: any, { chain, dateString }: FetchOptions) => {
  const callhistoricalVolume = (await fetchURL(historicalVolumeEndpoint))?.data.rows;

  const historicalVolume: IVolumeall[] = callhistoricalVolume.map((e: string[] | number[]) => {
    const [time, title, volume] = e;
    return {
      time,
      volume,
      title
    } as IVolumeall;
  });

  const historical = historicalVolume.filter((e: IVolumeall) => e.title === (chainsMap as any)[chain]);
  const dailyVolume = historical
    .find(dayItem => dayItem.time.slice(0, 10) === dateString)?.volume

  return {
    dailyVolume: dailyVolume,
  };
}

export default {
  fetch,
  version: 1,
  chains: Object.keys(chainsMap) as Chain[],
}
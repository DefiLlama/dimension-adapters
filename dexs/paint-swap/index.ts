import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const dateFrom = 1630584906;
const historicalVolumeEndpoint = (dateTo: number) => `https://api.paintswap.finance/v2/marketplaceDayDatas?numToSkip=0&numToFetch=1000&orderDirection=asc&dateFrom=${dateFrom}&dateTo=${dateTo}`;

interface IVolumeall {
  dailyVolume: string;
  date: number;
}

const fetch = async (timestamp: number, _: ChainBlocks, { startOfDay, createBalances, }: FetchOptions) => {
  const dailyVolume = createBalances();
  const totalVolume = createBalances();
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(startOfDay))).marketPlaceDayDatas;
  historicalVolume
    .filter(volItem => (new Date(volItem.date).getTime()) <= startOfDay)
    .map(({ dailyVolume }) => totalVolume.addGasToken(dailyVolume))

  dailyVolume.addGasToken(historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime()) === startOfDay)?.dailyVolume)


  return {
    timestamp: startOfDay,
    // totalVolume, 
    dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: 1630584906,
    },
  },
};

export default adapter;

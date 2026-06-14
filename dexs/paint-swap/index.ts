import fetchURL from "../../utils/fetchURL"
import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const dateFrom = 1630584906;
const historicalVolumeEndpoint = (dateTo: number) => `https://api.paintswap.finance/v2/marketplaceDayDatas?numToSkip=0&numToFetch=1000&orderDirection=asc&dateFrom=${dateFrom}&dateTo=${dateTo}`;

interface IVolumeall {
  dailyVolume: string;
  date: number;
}

const fetch = async ({ startOfDay, createBalances, }: FetchOptions) => {
  const dailyVolume = createBalances();
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint(startOfDay))).marketPlaceDayDatas;

  dailyVolume.addGasToken(historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime()) === startOfDay)?.dailyVolume)


  return {
    dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SONIC],
  start: '2021-09-02',
};

export default adapter;

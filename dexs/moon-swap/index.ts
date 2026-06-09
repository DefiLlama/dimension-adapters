import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const historical = "https://moonswap.fi/api/route/opt/swap/dashboard/global-chart";
const START_TIME = 1634515198;

interface IVolumeall {
  dailyVolumeUSD: string;
  date: number;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await httpPost(historical, {start_time: START_TIME, skip: 0}))?.data.uniswapDayDatas;

  const dailyVolume = historicalVolume
    .find(dayItem => Number(dayItem.date) === options.startOfDay)?.dailyVolumeUSD

  return {
    dailyVolume: dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.CONFLUX],
  start: START_TIME,
};

export default adapter;

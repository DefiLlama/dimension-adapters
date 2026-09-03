import { httpPost } from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


interface IVolumeall {
  dailyVolumeUSD: string;
  date: number;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolumeEndpoint = "https://www.vanswap.org/info/DayDatas?first=10&date=" + (options.toTimestamp - 86400 * 2)
  const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint, null))?.result;
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date).getTime()) === options.startOfDay)?.dailyVolumeUSD

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.VISION],
  start: 1647302400,
  // www.vanswap.org and the vanswap.org apex both SERVFAIL from Cloudflare and Google, i.e. the
  // delegation itself is broken. Last published point 2024-12-09 ($7,798) and TVL fell from
  // $3.16M to 0 on 2026-02-20.
  deadFrom: '2024-12-10',
};

export default adapter;

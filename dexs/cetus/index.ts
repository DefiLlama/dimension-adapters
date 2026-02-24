import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

async function fetch({ startTimestamp, endTimestamp, chain }: FetchOptions) {
  if (chain === CHAIN.APTOS && endTimestamp > 1747958400){
    return { dailyVolume: 0 }
  }

  let list  = (await fetchURL(`https://api-sui.cetus.zone/v3/sui/clmm/histogram?beginTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&dateType=hour`)).data.list;

  let dailyVolume = 0;
  for (const item of list) {
    dailyVolume += Number(item.value);
  }
  // const hackDay = (+new Date('2025-05-22')) / 1e3
  // if (endTimestamp > hackDay) return { dailyVolume: 0 }  // dex is paused
  //const dailyVolume = (await fetchURL(`https://api-sui.cetus.zone/v3/sui/vol/time_range?date_type=hour&start_time=${startTimestamp}&end_time=${endTimestamp}`)).data.vol_in_usd;

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI, CHAIN.APTOS],
  start: '2023-05-02',
};

export default adapter;
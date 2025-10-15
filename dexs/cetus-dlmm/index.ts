import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async ({ startTimestamp, endTimestamp }: FetchOptions) => {
  const volList = (await fetchURL(`https://api-sui.cetus.zone/v3/sui/dlmm/histogram?dateType=hour&dataType=vol&beginTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`)).data.list;
  let dailyVolume = volList.reduce((p, c) => p + Number(c.value), 0);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SUI],
  start: '2025-09-30',
};

export default adapter;
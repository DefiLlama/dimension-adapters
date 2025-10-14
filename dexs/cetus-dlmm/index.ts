import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const fetch = async (_: any, _1: any, { fromTimestamp, toTimestamp }: FetchOptions) => {
  const volList = (await fetchURL(`https://api-sui.cetus.zone/v3/sui/dlmm/histogram?dateType=hour&dataType=vol&beginTimestamp=${fromTimestamp}&endTimestamp=${toTimestamp}`)).data.list;
  var Volume = 0;
  for (const item of volList) {
    Volume += Number(item.value);
  }
  return {
    dailyVolume: Volume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch,
      start: '2025-09-30',
    }
  }
};

export default adapter;
import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const v3Endpoints = "https://api.bulbaswap.io/v1/subgraph-apis/v3";

const fetchV3Data = async (_: any, _tt: any, options: FetchOptions) => {
  const v3FactoryQuery = `{
    factory(id: "0xFf8578C2949148A6F19b7958aE86CAAb2779CDDD") {
      totalValueLockedUSD
      totalVolumeUSD
      totalFeesUSD
      txCount
    }
    uniswapDayData(id: ${Math.floor(options.startOfDay / 86400)}) {
      volumeUSD
      feesUSD
    }
  }`;
  const response = await httpPost(v3Endpoints, {
    query: v3FactoryQuery,
  });

  const dayData = response.data.uniswapDayData || {};

  return {
    dailyVolume: dayData.volumeUSD || "0",
    dailyFees: dayData.feesUSD || "0",
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MORPH]: {
      fetch: fetchV3Data,
      start: '2021-04-14',
    },
  },
};

export default adapter;

import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const v2Fees = 0.0035;
const v2Endpoints = "https://api.bulbaswap.io/v1/subgraph-apis/v2";

const fetchV2Data = async (_: any, _tt: any, options: FetchOptions) => {
  const dayID = Math.floor(options.startOfDay / 86400);
  const factoryQuery = `{
    uniswapFactory(id: "0x8D2A8b8F7d200d75Bf5F9E84e01F9272f90EFB8b") {
      totalLiquidityUSD
      totalVolumeUSD
      txCount
    }
    uniswapDayData(id: ${dayID}) {
      dailyVolumeUSD
      date
    }
  }`;

  const response = await httpPost(v2Endpoints, {
    query: factoryQuery,
  });

  const dailyVolume = response.data.uniswapDayData.dailyVolumeUSD || "0";

  const result = {
    dailyVolume,
    dailyFees: (Number(dailyVolume) * v2Fees).toString(),
  };

  return result;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MORPH]: {
      fetch: fetchV2Data,
      start: '2021-04-14',
    },
  },
};

export default adapter;

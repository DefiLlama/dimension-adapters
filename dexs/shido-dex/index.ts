import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const fetchV2Data = async (_: any, _tt: any, options: FetchOptions) => {
  const dayID = Math.floor(options.startOfDay / 86400);
  const factoryQuery = `{
    factories {
      totalVolumeUSD
    }
    uniswapDayData(id: ${dayID}) {
      volumeUSD
    }
  }`;

  const response = await httpPost('https://ljd1t705przomdjt11587.cleavr.xyz/subgraphs/name/shido/mainnet', {
    query: factoryQuery,
  });

  const dailyVolume = response.data.uniswapDayData.volumeUSD || "0";

  const result = {
    dailyVolume,
    timestamp: options.startOfDay,
  };

  return result;
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SHIDO]: {
      fetch: fetchV2Data,
      start: '2024-09-26',
    }
  },
};

export default adapter;

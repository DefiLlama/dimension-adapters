import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const v2Fees = 0.0035;

// V2 endpoints
const v2Endpoints = "https://api.bulbaswap.io/v1/subgraph-apis/v2";

// V3 endpoints
const v3Endpoints = "https://api.bulbaswap.io/v1/subgraph-apis/v3";


// V2 fetch function
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

// V3 fetch function
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


const adapter: BreakdownAdapter = {
  breakdown: {
    'v2': {
      [CHAIN.MORPH]: {
        fetch: fetchV2Data,
        start: '2021-04-14',
      },
    },
    'v3': {
      [CHAIN.MORPH]: {
        fetch: fetchV3Data,
        start: '2021-04-14',
      },
    },
  }
};

export default adapter;
